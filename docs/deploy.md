# Deploying Wholphin Web

Wholphin Web is a static web app plus a tiny server (`server/`). The server hands out the app, tells it
which Jellyfin to use, and (optionally) forwards Seerr requests so the browser can talk to Seerr.
It does **not** carry video or images: the browser talks to Jellyfin directly.

```
 user's browser ────https──> Caddy ──> Wholphin Web container (this project)   the app + /seerr-proxy
        │                       └────> Jellyfin                                 video, images, API
        └──https──────────────────────> Jellyfin (public address)
```

> **Applying the Caddy / nginx changes below is up to you (the owner).** Nothing in this repository
> touches a running Caddy, Jellyfin or Seerr.

To try the app beside a setup that already works, without changing that setup, see section 9. It has a
variant on a second port, a variant on a sub-domain for when no second port can be opened, and a way to try a
Caddy configuration without touching the Caddy that is running.

## 1. Settings (environment variables)

| Variable | Needed | Meaning |
|---|---|---|
| `JELLYFIN_URL` | recommended | The address a user's **browser** uses to reach Jellyfin, e.g. `https://jellyfin.example.com`. The public one, not `localhost`. When set, the app is locked to that server and users land straight on its login screen. Without it, people see a "add server" screen and type an address. |
| `SEERR_URL` | optional | Where **this server** reaches Seerr (can be an internal address, e.g. `http://host.docker.internal:5055`). When set, Seerr is available inside the app (Discover) through `/seerr-proxy`. Leave out to turn Seerr off. |
| `SERVER_NAME` | optional | Name shown before the server answers. |
| `PORT` | optional | Port to listen on. Default `8080`. |
| `HOST` | optional | Address to bind. Default `0.0.0.0`. |
| `TRUST_PROXY` | optional | Default `true`: believe `X-Forwarded-Proto/-Host/-For` from Caddy/nginx (needed so cookies get `Secure` over HTTPS). Set `false` if the app is exposed directly with no proxy in front. |
| `HSTS` | optional | Default `true`: send `Strict-Transport-Security` on HTTPS requests. |
| `CSP_EXTRA_ORIGINS` | optional | Extra origins (space/comma separated) the app may connect to, e.g. a second Jellyfin address. |
| `MAX_BODY_MB` / `SEERR_TIMEOUT_SECONDS` | optional | Seerr proxy limits. Defaults `10` and `30`. |
| `ACCESS_LOG` | optional | `true` logs one line per request (paths only, never query strings). |
| `DIST_DIR` | optional | Folder with the built app. Default `./dist`. |

The app reads these from `GET /config.json`, so you change them by restarting the server, not by rebuilding.

**Serve it at the root of a domain or port.** The app is built for `/`; it cannot live under a
sub-path like `https://example.com/wholphin/`. Use a port or a subdomain (below).

## 2. Run with Docker

Build once, run:

```bash
docker build -t wholphin-web .
docker run -d --name wholphin-web --restart unless-stopped \
  -p 127.0.0.1:8090:8080 \
  -e JELLYFIN_URL=https://jellyfin.example.com \
  -e SEERR_URL=http://host.docker.internal:5055 \
  --add-host host.docker.internal:host-gateway \
  wholphin-web
```

Or with Compose: copy `docker-compose.example.yml` to `docker-compose.yml`, edit the two addresses, then
`docker compose up -d --build`.

* `-p 127.0.0.1:8090:8080` publishes the app on the PC only (Caddy then exposes it). To test from another
  device on your network without Caddy, drop `127.0.0.1:` and open `http://<pc-ip>:8090` and add `-e TRUST_PROXY=false` (otherwise any client can spoof `X-Forwarded-*` headers); a page opened over plain HTTP like this may call a Jellyfin address that is HTTP or HTTPS; the rule in section 5 limits only pages opened over HTTPS.
* `host.docker.internal` is how a container reaches things running on the PC itself (Docker Desktop provides
  it). If Seerr is another container, put both on one Docker network and use `http://seerr:5055` instead.
* The image has no dev tools or `node_modules` (one bundled server file plus the app) and runs as a non-root user.
  Check it with `docker ps`: the status shows `healthy`.

## 3. Run without Docker

Needs Node 24 and npm.

```bash
npm ci
npm run build          # builds the app into dist/
JELLYFIN_URL=https://jellyfin.example.com SEERR_URL=http://localhost:5055 PORT=8090 npm start
```

On Windows PowerShell set the variables first: `$env:JELLYFIN_URL="https://jellyfin.example.com"; $env:PORT="8090"; npm start`.
`npm run serve:build` produces a single-file server (`dist-server/index.js`) you can run with `node` on a machine that only has the `dist/` folder.

## 4. Put it behind Caddy

Jellyfin already sits behind your Caddy with a public HTTPS address. Add the app next to it, either on its own
**subdomain** (simplest for users) or on its own **port**. Replace the placeholders.

Subdomain (needs the DNS name, e.g. another dynamic-DNS name, pointing at the same machine):

```caddy
wholphin.YOUR-DOMAIN.example {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8090
}
```

Own port on the existing name (users open `https://YOUR-DOMAIN.example:8444`; forward that port on your router too):

```caddy
YOUR-DOMAIN.example:8444 {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8090
}
```

Caddy sends `X-Forwarded-Proto/-For` automatically and keeps the original `Host`, which is what the app wants.
Then `caddy reload`. If Caddy runs in Docker itself, `127.0.0.1` inside its container is not the PC: put Caddy and `wholphin-web` on one Docker network and write `wholphin-web:8080` instead (the `-p` line is then not needed).

Caveat for the port variant: browsers share cookies between ports of the same host name. The Seerr cookie the app stores is limited to the path `/seerr-proxy`, so it does not reach Jellyfin, but another service on the same host name using a cookie called `connect.sid` could clash. A subdomain avoids this.

### nginx equivalent

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name wholphin.YOUR-DOMAIN.example;
    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10m;
    }
}
```

## 5. The HTTPS rule (mixed content)

A page loaded over **HTTPS** is not allowed to call an **HTTP** address (the browser blocks it silently).
A page loaded over plain **HTTP** may call either kind.
So when users open Wholphin Web over HTTPS (they should, from outside your network), `JELLYFIN_URL` must be an
**HTTPS** address too. Your public Caddy address for Jellyfin already is. Do not set it to `http://192.168...`:
that only works if Wholphin Web itself is also opened over plain HTTP on your local network.

This is also the one case where you might want Caddy/nginx to carry Jellyfin traffic through the same
address as the app (a same-origin proxy): a Jellyfin that only exists as plain HTTP and cannot get its own HTTPS
name. Wholphin Web deliberately does not do this itself: Jellyfin allows cross-origin requests, and relaying
video through Node would waste bandwidth and CPU. If you ever need it, a Caddy `handle_path /jellyfin/* { reverse_proxy ... }`
block on the app's site does it, and then `JELLYFIN_URL` would be `https://wholphin.YOUR-DOMAIN.example/jellyfin`.

## 6. How users sign in

Users open the app's address. Because `JELLYFIN_URL` is set they skip the "add server" step and see the
Jellyfin user list (or "Add User" for a manual login). They sign in with their normal Jellyfin account.
Seerr inside the app uses the Seerr login they enter in the app (stored as a session cookie on the app's
address). The Jellyfin built-in web UI keeps working on its own address.

Notes:
* Anyone who can open the app can reach the Seerr **API** (`/api/v1`, images, avatars) through
  `/seerr-proxy`; Seerr's own login still protects everything. Seerr's web UI is not exposed through the proxy.
* The proxy only ever talks to the `SEERR_URL` you configured; the request cannot change the target.

## 7. What the server does for you

* Hashed files under `/assets/` are cached for a year; `index.html` is always revalidated, so updates show on the next load.
* Reloading or bookmarking any in-app address works (it falls back to `index.html`).
* Gzip compression, and a Content-Security-Policy that allows only your Jellyfin (XHR, WebSocket, images, video),
  `blob:`/WebAssembly for the video and subtitle engines, and TMDB artwork for Seerr. A different Jellyfin
  address needs `CSP_EXTRA_ORIGINS`. With no `JELLYFIN_URL` set, any http(s) address is allowed so people can add servers.
* `GET /healthz` returns `{"status":"ok"}` (used by the Docker health check).

## 8. Updating

```bash
git pull
docker compose up -d --build        # or: docker build -t wholphin-web . && docker rm -f wholphin-web && docker run ... (as above)
```

Without Docker: `git pull && npm ci && npm run build`, then restart `npm start`. Users get the new version on
their next page load.

## 9. Trying it on a second port first

For when Jellyfin is already served through Caddy on one HTTPS port of a host name (say
`https://media.example.org`) and you want to look at Wholphin Web on another port of the same name before
deciding anything. Nothing below edits the existing site block, Jellyfin or Seerr. `media.example.org`, `9443`
and `8090` are placeholders: use your own host name, any free public port and any free local port.

**1. Start the container, reachable from this PC only.**

```bash
docker build -t wholphin-web .
docker run -d --name wholphin-web-trial --restart unless-stopped   -p 127.0.0.1:8090:8080   -e JELLYFIN_URL=https://media.example.org   -e SEERR_URL=http://host.docker.internal:5055   -e HSTS=false   --add-host host.docker.internal:host-gateway   wholphin-web
```

* `-p 127.0.0.1:8090:8080`: only Caddy on the same PC can reach the container; it is not open to the network.
* `JELLYFIN_URL` is the preset server: the address a browser already uses for your Jellyfin, exactly as it is
  today, with its port if that is not 443 (for example `https://media.example.org:8443`). The trial page is
  served over HTTPS, so this must be an HTTPS address (section 5). The two ports are different origins for the
  browser; Jellyfin allows that, and the app's Content-Security-Policy is narrowed to this one address.
* `SEERR_URL` is where the **container** reaches Seerr, usually an internal address as above. The app then
  talks to Seerr through `/seerr-proxy` on the trial port, so Caddy needs nothing for Seerr. Leave the line out
  to try the app without Seerr.
* `HSTS=false` for the trial: the `Strict-Transport-Security` header counts for the whole host name, on every
  port, so a browser that saw it would refuse plain-HTTP addresses on `media.example.org` for months. Leave
  the line out only if nothing on that name is opened over plain HTTP.
* `TRUST_PROXY` stays at its default (`true`): Caddy is in front.

**2. Add one site block to the Caddyfile**, next to the existing one, and reload (`caddy reload`). A reload
loads the whole file into the Caddy that serves your existing sites; to look at the new block first without
doing that, see "Trying a configuration without touching the running Caddy" below.

```caddy
media.example.org:9443 {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8090
}
```

Caddy serves HTTPS on that port with the certificate it already manages for the name. If Caddy runs in Docker,
put it and the trial container on one Docker network, write `wholphin-web-trial:8080` instead of
`127.0.0.1:8090` (a port published on `127.0.0.1` is not reachable from another container on every system), and
publish port 9443 on the Caddy container as well.

**3. Forward the port.** For access from outside your network the router must forward TCP port 9443 to this
PC, like the port Jellyfin already uses, and the PC's firewall must allow it. Inside your network it works
without that step if the name resolves to the PC.

**4. Check it.**

```bash
curl http://127.0.0.1:8090/healthz             # {"status":"ok"}: the container answers
curl https://media.example.org:9443/healthz    # the same through Caddy
curl https://media.example.org:9443/config.json
```

`config.json` must show `"serverUrl"` with your Jellyfin address, and `"seerrProxyPath":"/seerr-proxy"` when
`SEERR_URL` is set. `docker ps` shows the container as `healthy`. Then open `https://media.example.org:9443`
in a browser: the Jellyfin user list appears without an "add server" step; sign in with a normal Jellyfin
account and play something. If the user list stays empty or sign-in fails with a network error, `JELLYFIN_URL`
is not the address this browser can reach (or it is an HTTP address, section 5). For Seerr, open Discover and
sign in with a Seerr account.

Two ports of one host name share cookies. The Seerr cookie the app stores is limited to the path
`/seerr-proxy` and the proxy forwards only that cookie, so it does not disturb Jellyfin (the caveat in
section 4).

**5. Remove it again.** Delete the `media.example.org:9443 { ... }` block from the Caddyfile and run
`caddy reload`; `docker rm -f wholphin-web-trial` (and `docker image rm wholphin-web` if you do not want the
image); remove the router's forward for port 9443. The existing site block was never edited. What stays behind
is outside this project: each browser that signed in is listed as a device in Jellyfin's dashboard (delete it
there if you like), and the browser keeps the trial's sign-in under the trial address until its site data is
cleared.

### No second port can be opened: a sub-domain on the port that is already forwarded

Step 3 above needs a second port forwarded on the router. If only the port of the existing sites is forwarded
and you cannot or do not want to open another, give the trial a name of its own on that same port: a sub-domain
of the existing name, `app.media.example.org` beside `media.example.org`. (`app` is a placeholder too.)

What it needs:

* **A DNS name that resolves to the same address** as the existing one. Wildcard DNS gives that
  (`*.media.example.org`), and so does a dynamic-DNS provider that answers every name under a registered name
  with the same address; then nothing has to be registered. Check it first:
  `nslookup app.media.example.org` must print the address `media.example.org` has.
* **Step 1 as above**, unchanged: the container on `127.0.0.1:8090`, `JELLYFIN_URL` the address a browser
  already uses for Jellyfin. `-e HSTS=false` is not needed for this variant: the header the app sends has no
  `includeSubDomains`, so it counts for `app.media.example.org` alone and leaves the existing name as it is.
* **One site block** for the new name, on the port the existing sites use. If that is the standard HTTPS port:

  ```caddy
  app.media.example.org {
      encode zstd gzip
      reverse_proxy 127.0.0.1:8090
  }
  ```

  If your existing site block is written with a port (`media.example.org:8443 { ... }`), write the same port
  here (`app.media.example.org:8443`), and open the app with it.
* **A certificate for the new name.** Caddy gets it by itself when the block is loaded. If no challenge port
  is reachable from outside (ports 80 and 443 closed), Caddy can only prove
  the name through a DNS challenge, so the new block needs the same `tls { dns ... }` settings your existing
  block has (or you have them as a global option already).

What is different from the port variant:

* The router and the firewall stay as they are; step 3 falls away.
* The app and Jellyfin are different origins on the same site (`app.media.example.org` and
  `media.example.org`). That works as in the port variant: the browser calls Jellyfin across origins, Jellyfin
  allows it, and the app's Content-Security-Policy is narrowed to the one Jellyfin address.
* The Seerr cookie the app stores has no `Domain` attribute, so it belongs to `app.media.example.org` alone;
  the cookie caveat of two ports on one name does not apply.
* The checks of step 4 use the new name: `curl https://app.media.example.org/healthz` (with the port, if your
  sites use one).
* To remove it: delete the block, reload, remove the container. A certificate for the sub-domain stays in
  Caddy's storage and in the public certificate logs.

### Trying a configuration without touching the running Caddy

`caddy reload`, `caddy stop` and `caddy start` do not act on a file: they talk to the admin endpoint of the
Caddy that is running (by default `localhost:2019`). Run from a second configuration, `caddy reload` would
replace the configuration of the Caddy that serves your existing sites, and `caddy stop` would stop it. A
second Caddy started with default settings would also try to open the same admin endpoint, and to manage
certificates on its own.

The safe way to look at a new site block is a second, separate Caddy process that cannot reach the first one.
Give it a configuration file of its own with these global options, and start it in the foreground:

```caddy
{
    admin off                 # no admin endpoint: nothing here can reach or collide with the running Caddy's
    persist_config off        # never save this configuration where another Caddy start could pick it up
    auto_https off            # no certificate requests, no calls to the DNS provider, no port 80, no redirects
    storage file_system /path/to/a/folder/of/its/own
}

https://media.example.org:9443 {
    # the certificate the running Caddy already has for this name; the files are only read
    tls /path/to/media.example.org.crt /path/to/media.example.org.key

    encode zstd gzip
    reverse_proxy 127.0.0.1:8090
}
```

```bash
caddy run --config /path/to/Caddyfile.trial --adapter caddyfile    # stops with Ctrl+C
```

* Use `caddy run` (foreground), never `caddy start`, and end it with Ctrl+C or by closing its terminal, never
  with `caddy stop`.
* With `auto_https off` this process cannot obtain a certificate, so it can serve only a name whose
  certificate files already exist: the existing name on another port, as here. The running Caddy keeps them in
  its storage folder, under `certificates/`. For a new sub-domain this method cannot give a valid certificate.
* It listens only on the port in its site block. Whether that port can be reached from outside is the router's
  matter (step 3); on the PC itself, `curl https://media.example.org:9443/healthz` works when the name resolves
  to the PC.
* To check a file without starting anything: `caddy validate --config /path/to/Caddyfile --adapter caddyfile`.

A route added to a running Caddy through its admin endpoint lives only until that Caddy restarts. To keep a
route, write its site block into your own Caddyfile. That step is yours.

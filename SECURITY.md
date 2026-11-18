# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub's private vulnerability reporting: open this repository's **Security** tab, choose **Report a vulnerability**, and describe the problem with steps to reproduce. Reports are handled on a best-effort basis by volunteers.

## In scope

- The web app (everything under `src/`)
- Its small server, including the Seerr proxy

Out of scope: vulnerabilities in Jellyfin, Seerr or the upstream Wholphin Android app (report those to their own projects), and in third-party dependencies unless this project uses them unsafely.

## Deployment cautions

- Serve the app over HTTPS. Without it, sign-in credentials and access tokens cross the network in clear text.
- If you preset a server URL for your deployment, point it only at a server you control.
- Access tokens are kept in the browser's storage for the origin. Anyone with access to the browser profile, or script running on that origin, can use them. Do not host other untrusted content on the same origin, and sign out on shared devices.
- The Seerr proxy forwards requests on behalf of signed-in users; do not expose it to networks you do not trust.

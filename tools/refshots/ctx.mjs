// Scene context: screenshots + manifest, navigation helpers, test-server API (read-only, test user only).
import crypto from 'node:crypto';
import { OUT, PKG, ROOT, adbShell, fs, path, sleep } from './common.mjs';
import * as ui from './adbui.mjs';

export const SERVER_URL_IN_EMULATOR = 'http://10.0.2.2:8097';
const HOST = 'http://localhost:8097';

function loadEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(TESTSRV_[A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* none */ }
  return env;
}

const AUTH_HDR = (token) =>
  `MediaBrowser Client="refshots", Device="refshots", DeviceId="refshots-host", Version="1.0"${token ? `, Token="${token}"` : ''}`;

export class Skip extends Error {}

export async function makeCtx({ manifest, save }) {
  const env = loadEnv();
  const cfg = { user: env.TESTSRV_USER, pass: env.TESTSRV_PASSWORD };
  let session = null; // { token, userId }

  async function jf(method, urlPath, { token, body } = {}) {
    const res = await fetch(HOST + urlPath, {
      method,
      headers: { Authorization: AUTH_HDR(token), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${urlPath.split('?')[0]} -> ${res.status}`);
    try { return JSON.parse(text); } catch { return text; }
  }

  async function login() {
    if (session) return session;
    if (!cfg.user || !cfg.pass) throw new Error('TESTSRV_USER / TESTSRV_PASSWORD missing from .env.local');
    const r = await jf('POST', '/Users/AuthenticateByName', { body: { Username: cfg.user, Pw: cfg.pass } });
    session = { token: r.AccessToken, userId: r.User.Id };
    return session;
  }

  /** Read-only GET on the test server as the test user. */
  async function get(p) {
    const s = await login();
    return jf('GET', p, { token: s.token });
  }

  const ctx = {
    manifest, env, cfg,
    appVersion: (adbShell(`dumpsys package ${PKG} | grep versionName`).match(/versionName=(\S+)/) || [])[1] || null,
    scene: null, nn: '00', shots: 0,
    ui,
    get, login,
    jf,

    /** Authorize a Quick Connect code as the test user (never types a password into the app). */
    async authorizeQuickConnect(code) {
      const sess = await login();
      await jf('POST', '/QuickConnect/Authorize?code=' + encodeURIComponent(code) + '&userId=' + sess.userId, { token: sess.token });
      ui.trail.push('(host: authorize quick connect code via API)');
    },

    /** Make sure the app is signed in as the test user at Home; runs the Quick Connect flow when needed. */
    async ensureSignedIn() {
      if (ctx.signedIn) { await ctx.fresh(); return; }
      ui.restartApp();
      const nodes = await ui.waitFor(/^(Home|Select Server|Select User)$/, { timeout: 40000 });
      if (nodes && ui.hasText(nodes, 'Home')) { ctx.signedIn = true; await sleep(1500); return; }
      const { setupFlow } = await import('./setup.mjs');
      await setupFlow(ctx, { shots: false });
      ctx.signedIn = true;
    },

    /** Open a drawer destination (library name, Home, Favorites, Search, Settings) from a fresh Home. */
    async openDrawer(name, { waitText, fresh = true } = {}) {
      if (fresh) await ctx.fresh();
      await ui.press('left', 'wait:900');
      // The drawer is a lazy list taller than the screen: walk it by counting items (order from the API).
      const views = (await get('/UserViews?userId=' + (await login()).userId)).Items.map((v) => v.Name);
      const order = ['Search', 'Home', 'Favorites', ...views, 'Settings'];
      // while music plays the drawer gains a 'Now playing' item above Search
      if (ui.hasText(ui.dump(), /^Now playing$/)) order.unshift('Now playing');
      const to = order.findIndex((n) => n.toLowerCase() === String(name).toLowerCase());
      if (to < 0) throw new Error('drawer item not found: ' + name);
      // focus starts on the selected item: Home on a fresh start, otherwise whatever page we are on
      let from = order.indexOf('Home');
      if (!fresh) {
        await sleep(900);
        const cur = (ui.focusInfo()?.label || '').toLowerCase();
        const idx = order.findIndex((n) => cur.endsWith(n.toLowerCase()));
        if (idx >= 0) from = idx;
      }
      const delta = to - from;
      if (delta) await ui.press((delta > 0 ? 'down*' : 'up*') + Math.abs(delta), 'wait:1200');
      const f0 = Date.now();
      const atTarget = () => (ui.focusInfo()?.label || '').toLowerCase().endsWith(String(name).toLowerCase());
      while (Date.now() - f0 < 8000 && !atTarget()) await sleep(700);
      if (!atTarget()) await ui.focusOn(name, { drawer: true, maxSteps: 25 }); // counting went wrong (library list changed?): geometry fallback
      await ui.press('enter');
      ui.trail.push('(open ' + name + ')');
      if (waitText) await ctx.waitFor(waitText, { timeout: 20000 });
      await sleep(1200);
    },
    /** Focus a tab in a library tab row and activate it. */
    async tab(name) {
      await ctx.focus(name);
      await ui.press('enter');
      ui.trail.push('(tab ' + name + ')');
      await sleep(1500);
    },
    /** Icon-only buttons in the toolbar row of a grid page: 0=sort 1=filter 2=view options ...; negative from the end. */
    async toolbar(i) {
      const nodes = ui.dump().filter((n) => n.focusable && n.y1 >= 100 && n.y2 <= 200 && n.x1 > 140 && n.w < 400 && n.h > 70);
      nodes.sort((a, b) => a.x1 - b.x1);
      const n = nodes.at(i);
      if (!n) throw new Error('toolbar button ' + i + ' not found');
      await ctx.focus({ at: [n.cx, n.cy] });
      return n;
    },
    /**
     * Press a key repeatedly, shooting after each press, until the screen stops changing (end of a scrollable page).
     * Names shots <prefix>-1, -2 ...; the shot identical to its predecessor is dropped.
     */
    async scrollThrough(prefix, description, { key = 'down', max = 8, first = true } = {}) {
      let prev = null;
      for (let i = first ? 0 : 1; i <= max; i++) {
        if (i > 0) await ui.press(key, 'wait:500');
        const e = await ctx.shot(prefix + '-' + (i + 1), description + ' (step ' + (i + 1) + ')');
        if (prev && e.hash === prev.hash) {
          fs.unlinkSync(path.join(OUT, e.file));
          manifest.shots = manifest.shots.filter((s) => s.file !== e.file);
          console.log('  (end of page: dropped duplicate ' + e.file + ')');
          break;
        }
        prev = e;
      }
    },
    /** Close any open dialog/menu with Back and wait a beat. */
    async back(n = 1) { for (let k = 0; k < n; k++) { await ui.press('back'); await sleep(700); } },

    begin(scene, nn) { ctx.scene = scene; ctx.nn = nn; ctx.shots = 0; ui.trail.length = 0; },

    /** Save a screenshot once the UI settles. name: suffix after the scene id ('' = just the scene id). */
    async shot(suffix = '', description = '', opts = {}) {
      if (ctx.fast) opts = { timeout: 1800, interval: 350, noDump: true, ...opts }; // moving video / auto-hiding overlay: be quick
      const png = await ui.settle(opts);
      const base = ctx.scene.id + (suffix ? '-' + suffix : '');
      const file = `${ctx.nn}-${base}.png`;
      fs.writeFileSync(path.join(OUT, file), png);
      const nodes = opts.noDump ? [] : ui.dump();
      const entry = {
        file, scene: ctx.scene.id, name: base,
        description: description || ctx.scene.title,
        keys: [...ui.trail],
        focus: ui.focusInfo(nodes)?.label || null,
        texts: ui.texts(nodes).slice(0, 40),
        timestamp: new Date().toISOString(),
      };
      manifest.shots = manifest.shots.filter((s) => s.file !== file);
      manifest.shots.push(entry);
      entry.hash = crypto.createHash('md5').update(png).digest('hex');
      ctx.shots++;
      console.log(`  shot ${file}${entry.focus ? '  [focus: ' + entry.focus.slice(0, 50) + ']' : ''}`);
      return entry;
    },

    press: ui.press,
    dump: ui.dump,
    texts: () => ui.texts(),
    has: (q) => ui.hasText(ui.dump(), q),
    waitFor: async (q, o) => {
      const r = await ui.waitFor(q, o);
      if (!r) throw new Error(`timed out waiting for text ${q}`);
      return r;
    },
    waitGone: ui.waitGone,
    /** Move focus to an element by label (string = exact, RegExp = pattern). */
    async focus(q, o) {
      if (!(await ui.focusOn(q, o))) throw new Error(`could not focus ${q}; screen: ${ui.texts().slice(0, 15).join(' / ')}`);
    },
    /** Focus an element and activate it. */
    async select(q, o) { await ctx.focus(q, o); await ui.press('enter'); ui.trail.push(`(select ${q})`); },
    skip(reason) { throw new Skip(reason); },
    sleep,

    /** Restart the app (it auto-restores the last session) and wait for the home screen. */
    async fresh() {
      ui.restartApp();
      ui.trail.push('(restart app)');
      await ctx.waitHome();
    },
    async waitHome() {
      const nodes = await ui.waitFor(/^Home$/, { timeout: 45000 });
      if (!nodes) throw new Error('home screen did not appear; screen: ' + ui.texts().slice(0, 12).join(' / '));
      await sleep(1500);
    },
  };
  return ctx;
}

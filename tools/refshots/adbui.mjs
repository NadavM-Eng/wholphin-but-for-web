// adb-driven UI helpers: keys, screenshots, settle detection, uiautomator tree queries.
// CLI for exploring by hand:  node tools/refshots/adbui.mjs <dump|texts|key K..|text "..."|shot file>
import crypto from 'node:crypto';
import { PKG, adb, adbShell, fs, sleep } from './common.mjs';

export const KEYS = {
  up: 19, down: 20, left: 21, right: 22, enter: 66, center: 23, back: 4, home: 3, menu: 82,
  play: 126, pause: 127, playpause: 85, ff: 90, rew: 89, next: 87, prev: 88, stop: 86,
  info: 165, guide: 172, search: 84, del: 67, tab: 61, 'page_up': 92, 'page_down': 93,
  ch_up: 166, ch_down: 167, mediaplay: 126,
};

/** Key sequence log: the scene runner reads and resets this to fill the manifest. */
export const trail = [];

export function sh(cmd) { return adbShell(cmd); }

export function keyevent(code, { long = false } = {}) {
  const c = typeof code === 'number' ? code : KEYS[code];
  if (c == null) throw new Error('unknown key ' + code);
  if (long) adbShell(`input keyevent --longpress ${c}`);
  else adbShell(`input keyevent ${c}`);
}

/** Press keys. Items: 'down', 'down*3', 'long:enter', 'text:abc', 'wait:500'. */
export async function press(...seq) {
  for (const item of seq.flat()) {
    const s = String(item);
    if (s.startsWith('wait:')) { await sleep(Number(s.slice(5))); continue; }
    if (s.startsWith('text:')) { inputText(s.slice(5)); trail.push(s); await sleep(250); continue; }
    const long = s.startsWith('long:');
    const m = (long ? s.slice(5) : s).match(/^([a-z_]+)(?:\*(\d+))?$/);
    if (!m) throw new Error('bad key item ' + s);
    const n = Number(m[2] || 1);
    // batch repeats into one adb call for speed
    const c = KEYS[m[1]];
    if (c == null) throw new Error('unknown key ' + m[1]);
    if (long) adbShell(`input keyevent --longpress ${c}`);
    else adbShell(Array(n).fill(`input keyevent ${c}`).join(' && '));
    trail.push(s);
    await sleep(long ? 600 : 180);
  }
}

export function inputText(t) {
  // only for non-secret text. %s is a space for `input text`.
  const esc = t.replace(/ /g, '%s').replace(/([&|;<>()$`\\"'*?\[\]{}~#!])/g, '\\$1');
  adbShell(`input text '${esc.replace(/'/g, '')}'`);
}

export function screencap() {
  const r = adb(['exec-out', 'screencap', '-p'], { binary: true });
  return r.stdout;
}
const hash = (b) => crypto.createHash('md5').update(b).digest('hex');

/** Wait until two screenshots 400ms apart are byte-identical (or timeout). Returns the final PNG. */
export async function settle({ timeout = 8000, interval = 450 } = {}) {
  const t0 = Date.now();
  let prev = screencap();
  while (Date.now() - t0 < timeout) {
    await sleep(interval);
    const cur = screencap();
    if (prev && cur && hash(prev) === hash(cur)) return cur;
    prev = cur;
  }
  return prev;
}

// ---- uiautomator tree ----
const attrRe = /(\w[\w-]*)="([^"]*)"/g;
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#10;/g, '\n');

export function dump() {
  for (let i = 0; i < 3; i++) {
    const r = adb(['exec-out', 'uiautomator', 'dump', '/dev/tty']);
    const xml = (r.stdout || '').toString();
    if (!xml.includes('<hierarchy')) { continue; }
    const nodes = [];
    for (const m of xml.matchAll(/<node ([^>]*?)\/?>/g)) {
      const a = {};
      for (const am of m[1].matchAll(attrRe)) a[am[1]] = unesc(am[2]);
      const b = (a.bounds || '').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (!b) continue;
      const [x1, y1, x2, y2] = b.slice(1).map(Number);
      nodes.push({
        text: a.text || '', desc: a['content-desc'] || '', cls: a.class, pkg: a.package,
        focused: a.focused === 'true', focusable: a.focusable === 'true', clickable: a.clickable === 'true',
        selected: a.selected === 'true', checked: a.checked === 'true', scrollable: a.scrollable === 'true',
        x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1,
      });
    }
    return nodes;
  }
  return [];
}

export const label = (n) => n.text || n.desc;
export function texts(nodes = dump()) { return nodes.map(label).filter(Boolean); }
export function matcher(q) {
  if (q instanceof RegExp) return (n) => q.test(label(n));
  if (typeof q === 'function') return q;
  const s = String(q).toLowerCase();
  return (n) => label(n).toLowerCase() === s;
}
export function findAll(nodes, q) { const f = matcher(q); return nodes.filter((n) => label(n) && f(n)); }
export function hasText(nodes, q) { return findAll(nodes, q).length > 0; }

/** The focused node's "label": its own text or, failing that, the texts of nodes contained within it. */
export function focusInfo(nodes = dump()) {
  const f = nodes.filter((n) => n.focused && n.pkg === PKG).sort((a, b) => a.w * a.h - b.w * b.h)[0];
  if (!f) return null;
  const inside = nodes.filter((n) => label(n) && n.cx >= f.x1 && n.cx <= f.x2 && n.cy >= f.y1 && n.cy <= f.y2).map(label);
  return { node: f, label: label(f) || inside.join(' | '), inside };
}

/** Does text q appear on screen (as a node label, or inside the focused node)? */
export async function waitFor(q, { timeout = 15000, every = 700 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const nodes = dump();
    if (hasText(nodes, q)) return nodes;
    await sleep(every);
  }
  return null;
}
export async function waitGone(q, { timeout = 15000, every = 700 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (!hasText(dump(), q)) return true;
    await sleep(every);
  }
  return false;
}

function insideFocusMatch(info, f) { return info && (f(info.node) || info.inside.some((t) => f({ text: t, desc: '' }))); }

/**
 * Move D-pad focus onto the element whose label matches q (string = exact, case-insensitive; RegExp).
 * Uses geometry: presses the arrow pointing toward the target until the focused element contains it.
 */
export async function focusOn(q, { maxSteps = 40, dirs, drawer = false } = {}) {
  // q may also be { at: [x, y] }: focus whatever element contains that screen point (for icon-only buttons)
  const at = q && typeof q === 'object' && !(q instanceof RegExp) ? q.at : null;
  const f = at ? () => false : matcher(q);
  let lastKey = null, stuck = 0, lastPos = '';
  for (let i = 0; i < maxSteps; i++) {
    await sleep(600); // let scroll/spring animations and the accessibility tree catch up
    const nodes = dump();
    const info = focusInfo(nodes);
    if (at ? (info && at[0] >= info.node.x1 && at[0] <= info.node.x2 && at[1] >= info.node.y1 && at[1] <= info.node.y2) : insideFocusMatch(info, f)) return true;
    const targets = at ? [{ cx: at[0], cy: at[1] }] : findAll(nodes, q).filter((n) => drawer || n.x1 >= 140).sort((a, b) => b.w * b.h - a.w * a.h); // x<140 = the nav drawer labels; prefer the largest (card) node
    if (!targets.length) {
      // not on screen: try scrolling toward it
      const k = lastKey || 'down';
      await press(k); continue;
    }
    if (!info) { await press('down'); continue; }
    const t = targets[0];
    const dx = t.cx - info.node.cx, dy = t.cy - info.node.cy;
    let k;
    if (Math.abs(dy) > info.node.h * 0.6 && (!dirs || dirs.includes('v'))) k = dy > 0 ? 'down' : 'up';
    else k = dx > 0 ? 'right' : 'left';
    if (process.env.UIDEBUG) console.log(`  [focusOn ${i}] at ${info.node.x1},${info.node.y1},${info.node.x2},${info.node.y2} target ${Math.round(t.cx)},${Math.round(t.cy)} -> ${k}`);
    const pos = `${info.node.x1},${info.node.y1},${info.node.x2},${info.node.y2}`;
    if (pos === lastPos && k === lastKey) {
      stuck++;
      if (stuck >= 3) { k = k === 'down' || k === 'up' ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
      if (stuck >= 6) return false;
    } else stuck = 0;
    lastPos = pos; lastKey = k;
    await press(k);
  }
  return false;
}

export function currentActivity() {
  const o = adbShell('dumpsys window | grep -E "mCurrentFocus|mFocusedApp"');
  return o.trim().split('\n')[0] || '';
}
export function appRunning() { return /\d+/.test(adbShell(`pidof ${PKG}`)); }

export function restartApp() {
  adbShell(`am force-stop ${PKG}`);
  adbShell(`am start -n ${PKG}/.MainActivity`);
}

if (process.argv[1] && /adbui.mjs$/.test(process.argv[1])) {
  const [c, ...a] = process.argv.slice(2);
  if (c === 'dump') for (const n of dump()) console.log(`${n.focused ? '*' : ' '} [${n.x1},${n.y1},${n.x2},${n.y2}] ${n.cls?.split('.').pop()} ${JSON.stringify(label(n))}${n.focusable ? ' F' : ''}${n.selected ? ' S' : ''}${n.checked ? ' C' : ''}`);
  else if (c === 'texts') console.log(texts().join('\n'));
  else if (c === 'focus') console.log(JSON.stringify(focusInfo()?.label));
  else if (c === 'key') await press(...a);
  else if (c === 'text') { inputText(a.join(' ')); }
  else if (c === 'go') { console.log(await focusOn(a.join(' '))); }
  else if (c === 'shot') { fs.writeFileSync(a[0], await settle()); }
}

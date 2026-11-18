// Shared helpers for the test-server tools: paths, ffmpeg-in-container runner, art/clip builders.
import { spawn } from 'node:child_process';
import { mkdir, writeFile, stat, rename, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATA = path.join(REPO, 'dev/testserver/data');
export const MEDIA = path.join(DATA, 'media');
export const GEN = path.join(DATA, 'cache/gen'); // visible in the container as /cache/gen
export const CONTAINER = 'wholphin-web-test-jellyfin';
const FF = '/usr/lib/jellyfin-ffmpeg/ffmpeg';

export const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
export const FONT_CJK = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';

export const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

export function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn('docker', ['exec', CONTAINER, FF, '-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg exit ${c}: ${err.slice(-600)}\nargs: ${args.join(' ').slice(0, 400)}`))));
  });
}

// Tiny concurrency pool.
export function pool(n) {
  let active = 0; const q = [];
  const next = () => { while (active < n && q.length) { active++; const { fn, res, rej } = q.shift(); fn().then(res, rej).finally(() => { active--; next(); }); } };
  const run = (fn) => new Promise((res, rej) => { q.push({ fn, res, rej }); next(); });
  return run;
}

export const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const x = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `0x${x(f(0))}${x(f(8))}${x(f(4))}`;
}
export function palette(seed, i = 0) {
  const h = parseInt(hash(seed + i).slice(0, 4), 16) % 360;
  return [hsl(h, 70, 38), hsl(h + 40, 75, 28), hsl(h + 170, 65, 18)];
}

export function wrap(text, max) {
  const cjk = /[぀-鿿]/;
  const words = text.split(/\s+/).flatMap((w) => (cjk.test(w) && w.length > max ? w.match(new RegExp(`.{1,${max}}`, 'gu')) : [w])); const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur);
  return lines.join('\n');
}

async function textFile(text) {
  const f = `${hash(text)}.txt`;
  await mkdir(path.join(GEN, 'txt'), { recursive: true });
  await writeFile(path.join(GEN, 'txt', f), text, 'utf8');
  return `/cache/gen/txt/${f}`;
}

// drawtext chain from [{text,size,y,color,font}] (y: ffmpeg expression for the text block top).
async function drawTexts(blocks) {
  const parts = [];
  for (const b of blocks) {
    const tf = await textFile(b.text);
    parts.push(`drawtext=fontfile=${b.font || FONT}:textfile=${tf}:fontsize=${b.size}:fontcolor=${b.color || 'white'}:x=(w-text_w)/2:y=${b.y ?? '(h-text_h)/2'}:line_spacing=${b.ls ?? 12}:shadowcolor=black@0.65:shadowx=3:shadowy=3`);
  }
  return parts.join(',');
}

const tmpName = (ext) => `/cache/gen/tmp/${hash(String(Math.random()))}.${ext}`;
const hostOf = (c) => path.join(GEN, c.replace('/cache/gen/', ''));

// Build `final` (absolute host path) if missing: build(containerTmpPath) -> ffmpeg args; moved into place after success.
export async function job(final, ext, build, post) {
  if (await exists(final)) return false;
  await mkdir(path.join(GEN, 'tmp'), { recursive: true });
  await mkdir(path.dirname(final), { recursive: true });
  const t = tmpName(ext);
  await ffmpeg(await build(t));
  await rename(hostOf(t), final);
  if (post) await post(final);
  return true;
}

// Gradient art. kind: poster 1000x1500 | backdrop 1920x1080 | thumb 1280x720 | square 1000x1000 | logo (png, transparent)
const SIZES = { poster: [1000, 1500], backdrop: [1920, 1080], thumb: [1280, 720], square: [1000, 1000], season: [1000, 1500], avatar: [512, 512] };
export function art(final, kind, { title, sub, seed, font, wrapAt, titleSize }) {
  const ext = kind === 'logo' ? 'png' : 'jpg';
  return job(final, ext, async (out) => {
    const p = palette(seed ?? title);
    if (kind === 'logo') {
      const txt = await drawTexts([{ text: wrap(title, 16), size: 120, font, ls: 8 }]);
      return ['-f', 'lavfi', '-i', 'color=c=black@0.0:s=1000x300,format=rgba', '-vf', txt, '-frames:v', '1', out];
    }
    const [w, h] = SIZES[kind];
    const portrait = h > w, big = w >= 1900;
    const lines = wrap(title, wrapAt ?? (font === FONT_CJK ? (portrait ? 6 : 11) : portrait ? 11 : 22));
    const nl = lines.split('\n').length;
    const size = titleSize ?? Math.round((portrait ? 130 : big ? 150 : 100) / Math.max(1, 1 + (nl - 1) * 0.25));
    const blocks = [{ text: lines, size, font, y: portrait ? 'h*0.30' : '(h-text_h)/2-30' }];
    if (sub) blocks.push({ text: sub, size: Math.round(size * 0.34), color: 'white@0.85', font, y: portrait ? 'h*0.82' : 'h*0.80' });
    const txt = await drawTexts(blocks);
    const vf = `scale=${w}:${h}:flags=bicubic,drawbox=x=0:y=ih*0.72:w=iw:h=ih*0.28:color=black@0.28:t=fill,${txt}`;
    return ['-f', 'lavfi', '-i', `gradients=s=${Math.round(w / 4)}x${Math.round(h / 4)}:c0=${p[0]}:c1=${p[1]}:c2=${p[2]}:nb_colors=3:x0=0:y0=0:x1=0:y1=${Math.round(h / 4)}:d=1:r=1`, '-vf', vf, '-frames:v', '1', '-q:v', '3', out];
  });
}

// Animated gradient video source + title overlay. Returns [inputArgs, vfString].
export async function videoSource({ title, seed, w, h, fps = 24, dur, font, timecode = true, titleSize }) {
  const p = palette(seed ?? title);
  const gw = Math.max(160, Math.round(w / 6) & ~1), gh = Math.max(90, Math.round(h / 6) & ~1);
  const blocks = [{ text: wrap(title, w >= 1280 ? 26 : 20), size: titleSize ?? Math.round(h / 9), font, y: '(h-text_h)/2-20' }];
  const tcf = timecode ? `,drawtext=fontfile=${FONT}:text='%{pts\\:hms}':fontsize=${Math.round(h / 16)}:fontcolor=white@0.9:x=(w-text_w)/2:y=h*0.82:shadowcolor=black@0.6:shadowx=2:shadowy=2` : '';
  const vf = `scale=${w}:${h}:flags=bilinear,${await drawTexts(blocks)}${tcf}`;
  return [['-f', 'lavfi', '-i', `gradients=s=${gw}x${gh}:r=${fps}:speed=0.03:c0=${p[0]}:c1=${p[1]}:c2=${p[2]}:nb_colors=3:d=${dur}`], vf];
}

export const sineIn = (f, ch = 'stereo') => ['-f', 'lavfi', '-i', ch === 'stereo' ? `sine=f=${f}:r=48000,volume=0.25,pan=stereo|c0=c0|c1=c0` : `sine=f=${f}:r=48000,volume=0.25,pan=5.1|FL=c0|FR=c0|FC=c0|LFE=c0|BL=c0|BR=c0`];

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const tag = (n, v) => (v === undefined || v === null || v === '' ? '' : `  <${n}>${esc(v)}</${n}>\n`);
export async function writeIfMissing(file, content) {
  if (await exists(file)) return;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, typeof content === 'string' ? 'utf8' : undefined);
}
export const rel = (...p) => path.join(MEDIA, ...p);
export { mkdir, writeFile, readFile };

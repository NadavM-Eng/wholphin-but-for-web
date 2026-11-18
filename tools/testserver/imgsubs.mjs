// Image-based subtitle builder: renders text cues to bitmaps with the ffmpeg bundled in the Jellyfin image (drawtext), and
// packs them into a raw HDMV PGS stream (.sup). The bundled ffmpeg has no PGS encoder, so the container format is written here.
// A .sup can then be muxed with `-c:s copy` (PGS) or converted with `-c:s dvdsub` (VobSub); see gen-media.mjs (ids pgs, vobsub).
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { ffmpeg, GEN, FONT, hash } from './lib.mjs';

const W = 1280, H = 720; // PGS canvas (matches the 720p test clips)
const BOX_W = 1200, BOX_H = 150; // bitmap size of one cue; placed bottom-centre
const BOX_X = (W - BOX_W) / 2, BOX_Y = 520;
const TICKS = 90000; // PGS timestamps are 90 kHz

/** Renders `text` (one or two lines) as a BOX_W x BOX_H gray8 bitmap: 0 transparent, 128 outline, 255 text. */
async function renderCue(text) {
  const id = hash('pgs' + text);
  await mkdir(path.join(GEN, 'txt'), { recursive: true });
  await mkdir(path.join(GEN, 'tmp'), { recursive: true });
  await writeFile(path.join(GEN, 'txt', `${id}.txt`), text, 'utf8');
  const out = `/cache/gen/tmp/${id}.gray`;
  await ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${BOX_W}x${BOX_H}`, '-vf',
    `drawtext=fontfile=${FONT}:textfile=/cache/gen/txt/${id}.txt:fontsize=44:fontcolor=white:borderw=4:bordercolor=gray:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=10`,
    '-frames:v', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', out]);
  const raw = await readFile(path.join(GEN, 'tmp', `${id}.gray`));
  await unlink(path.join(GEN, 'tmp', `${id}.gray`));
  return raw;
}

/** gray8 -> palette indices (0 transparent, 1 black outline, 2 white text) -> PGS run-length data. */
function rle(gray) {
  const bytes = [];
  for (let y = 0; y < BOX_H; y++) {
    let x = 0;
    while (x < BOX_W) {
      const idx = (px) => (px < 64 ? 0 : px < 192 ? 1 : 2);
      const c = idx(gray[y * BOX_W + x]);
      let n = 1;
      while (x + n < BOX_W && n < 16383 && idx(gray[y * BOX_W + x + n]) === c) n++;
      if (c === 0) {
        if (n < 64) bytes.push(0, n); else bytes.push(0, 0x40 | (n >> 8), n & 255);
      } else if (n === 1) bytes.push(c);
      else if (n < 64) bytes.push(0, 0x80 | n, c);
      else bytes.push(0, 0xc0 | (n >> 8), n & 255, c);
      x += n;
    }
    bytes.push(0, 0); // end of line
  }
  return Buffer.from(bytes);
}

const u16 = (n) => Buffer.from([(n >> 8) & 255, n & 255]);
const u32 = (n) => Buffer.from([(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
const segment = (pts, type, data) => Buffer.concat([Buffer.from('PG'), u32(pts), u32(0), Buffer.from([type]), u16(data.length), data]);

/**
 * cues: [{start, end, text}] in seconds. Writes a .sup file at `file` (absolute host path).
 * `forced` marks every cue as a forced subtitle.
 */
export async function writeSup(file, cues, { forced = false } = {}) {
  const parts = [];
  let comp = 0;
  // an empty display set at t=0 so the stream starts at 0 (ffmpeg shifts every input by its first timestamp)
  parts.push(
    segment(0, 0x16, Buffer.concat([u16(W), u16(H), Buffer.from([0x10]), u16(comp++), Buffer.from([0x80, 0, 0, 0])])),
    segment(0, 0x17, Buffer.concat([Buffer.from([1, 0]), u16(BOX_X), u16(BOX_Y), u16(BOX_W), u16(BOX_H)])),
    segment(0, 0x80, Buffer.alloc(0)),
  );
  for (const cue of cues) {
    const gray = await renderCue(cue.text);
    const data = rle(gray);
    const pts = Math.round(cue.start * TICKS);
    const flag = forced ? 0x40 : 0;
    // display set 1: show (epoch start)
    parts.push(
      segment(pts, 0x16, Buffer.concat([u16(W), u16(H), Buffer.from([0x10]), u16(comp++), Buffer.from([0x80, 0, 0, 1]), u16(0), Buffer.from([0, flag]), u16(BOX_X), u16(BOX_Y)])),
      segment(pts, 0x17, Buffer.concat([Buffer.from([1, 0]), u16(BOX_X), u16(BOX_Y), u16(BOX_W), u16(BOX_H)])),
      // palette: id, Y, Cr, Cb, alpha (0 transparent, 1 black, 2 white)
      segment(pts, 0x14, Buffer.from([0, 0, 0, 16, 128, 128, 0, 1, 16, 128, 128, 255, 2, 235, 128, 128, 255])),
      segment(pts, 0x15, Buffer.concat([u16(0), Buffer.from([0, 0xc0]), Buffer.from([0, (data.length + 4) >> 8 & 255, (data.length + 4) & 255]), u16(BOX_W), u16(BOX_H), data])),
      segment(pts, 0x80, Buffer.alloc(0)),
    );
    // display set 2: clear the screen at the end time
    const endPts = Math.round(cue.end * TICKS);
    parts.push(
      segment(endPts, 0x16, Buffer.concat([u16(W), u16(H), Buffer.from([0x10]), u16(comp++), Buffer.from([0, 0, 0, 0])])),
      segment(endPts, 0x17, Buffer.concat([Buffer.from([1, 0]), u16(BOX_X), u16(BOX_Y), u16(BOX_W), u16(BOX_H)])),
      segment(endPts, 0x80, Buffer.alloc(0)),
    );
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.concat(parts));
}

export const cuesFor = (lines, { first = 2, len = 4, gap = 2 } = {}) => lines.map((text, i) => ({ start: first + i * (len + gap), end: first + i * (len + gap) + len, text }));

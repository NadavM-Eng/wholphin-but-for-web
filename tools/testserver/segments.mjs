// Chapters for the media-segment test data. The "Chapter Segments Provider" plugin (installed by setup.mjs) turns chapters whose
// names match intro / recap / preview / credits into Jellyfin media segments, so the episodes carry chapters with those names.
// Remuxes (-c copy, no re-encode) the existing Orbital Drift season 1 episodes; idempotent (skips files that already have them).
import { spawn } from 'node:child_process';
import { readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { ffmpeg, CONTAINER, GEN, MEDIA, exists, mkdir, writeFile } from './lib.mjs';

export const SEGMENT_SERIES = 'Shows/Orbital Drift (2021)/Season 01';

// Chapter name -> [start second]; each chapter ends where the next starts, the last one at the clip end (30 s).
// Names must not hit the plugin's default regexes by accident: intro|opening|^OP$, recap|last time on|previously on,
// preview|next time on|sneak peek, outro|closing|credits|ending|^ED$, and "ad|break|commercial" (a Commercial segment).
const STANDARD = [['Cold Open', 0], ['Intro', 4], ['Main Story', 14], ['Credits', 21]];
const WITH_RECAP = [['Recap', 0], ['Intro', 5], ['Main Story', 13], ['Credits', 20], ['Preview', 27]];
const CLIP_SECONDS = 30;
/** Episode number -> chapter layout. Episode 4 (Salvage Rights, the seeded next-up) also has a Recap and a Preview. */
export const layoutFor = (episode) => (episode === 4 ? WITH_RECAP : STANDARD);

/** The segments the Chapter Segments Provider should produce for a layout: [{type, start, end}] in seconds. */
export function expectedSegments(episode) {
  const l = layoutFor(episode);
  const type = { Recap: 'Recap', Intro: 'Intro', Credits: 'Outro', Preview: 'Preview' };
  return l.map(([n, s], i) => ({ type: type[n], start: s, end: l[i + 1]?.[1] ?? CLIP_SECONDS })).filter((x) => x.type);
}

function probeChapters(file) {
  return new Promise((resolve) => {
    const p = spawn('docker', ['exec', CONTAINER, '/usr/lib/jellyfin-ffmpeg/ffprobe', '-v', 'error', '-show_chapters', '-of', 'json', file], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', () => { try { resolve((JSON.parse(out).chapters ?? []).map((c) => c.tags?.title)); } catch { resolve([]); } });
  });
}

/** Adds the chapters to every season 1 episode file that lacks them. Returns the number of files rewritten. */
export async function ensureChapters(log = console.log) {
  const dir = path.join(MEDIA, SEGMENT_SERIES);
  if (!(await exists(dir))) { log('segments: Orbital Drift season 1 is not generated yet, skipping chapters'); return 0; }
  let changed = 0;
  for (const f of (await readdir(dir)).filter((n) => n.endsWith('.mp4')).sort()) {
    const ep = Number(f.match(/ - S01E(\d+) - /)?.[1]);
    if (!ep) continue;
    const layout = layoutFor(ep);
    const rel = `${SEGMENT_SERIES}/${f}`;
    const have = await probeChapters(`/media/${rel}`);
    if (have.length === layout.length && have.every((t, i) => t === layout[i][0])) continue;
    const meta = ';FFMETADATA1\n' + layout.map(([title, s], i) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${s * 1000}\nEND=${(layout[i + 1]?.[1] ?? CLIP_SECONDS) * 1000}\ntitle=${title}\n`).join('');
    await mkdir(path.join(GEN, 'meta'), { recursive: true });
    await mkdir(path.join(GEN, 'tmp'), { recursive: true });
    await writeFile(path.join(GEN, 'meta', `seg-e${ep}.txt`), meta, 'utf8');
    const tmp = `seg-e${ep}.mp4`;
    await ffmpeg(['-i', `/media/${rel}`, '-i', `/cache/gen/meta/seg-e${ep}.txt`, '-map', '0', '-map_metadata', '0', '-map_chapters', '1', '-c', 'copy', '-movflags', '+faststart', `/cache/gen/tmp/${tmp}`]);
    await rename(path.join(GEN, 'tmp', tmp), path.join(dir, f));
    log(`segments: chapters written to ${f}`);
    changed++;
  }
  return changed;
}

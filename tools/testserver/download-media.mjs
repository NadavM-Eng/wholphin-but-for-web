// Downloads freely licensed Blender open movies (CC-BY) from the official Blender download server and archive.org
// uploads into dev/testserver/data/media/Movies. Files over ~150 MB are re-encoded (720p H.264/AAC) with the ffmpeg
// inside the Jellyfin container to keep disk use low. Idempotent: skips movies that already exist.
import { mkdir, stat, rename, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { ffmpeg, MEDIA, DATA, exists } from './lib.mjs';

const root = path.join(MEDIA, 'Movies');
const dl = path.join(DATA, 'cache/dl'); // visible as /cache/dl in the container
const ia = (id, file) => `https://archive.org/download/${id}/${encodeURIComponent(file)}`;

// [folder, final file name, url, transcode?]  (transcode: true re-encodes to 720p H.264 ~1 Mbit/s video)
const MOVIES = [
  ['Big Buck Bunny (2008)', 'Big Buck Bunny (2008).mp4', ia('BigBuckBunny1280x720Stereo', 'big_buck_bunny_720_stereo.mp4'), false],
  ['Sintel (2010)', 'Sintel (2010).mp4', ia('sintel-open-movie-by-blender', 'Sintel - Open Movie by Blender.mp4'), true],
  ['Tears of Steel (2012)', 'Tears of Steel (2012).mp4', ia('tears-of-steel_202610', 'Tears of Steel.mp4'), true],
  ['Cosmos Laundromat (2015)', 'Cosmos Laundromat (2015).mp4', ia('CosmosLaundromatFirstCycle', 'Cosmos Laundromat - First Cycle (1080p).mp4'), true],
  ['Spring (2019) [tmdbid-593048]', 'Spring (2019) [tmdbid-593048].mp4', ia('spring_blenderopenmovie', 'Spring - Blender Open Movie - YouTube.mp4'), false],
  ['Agent 327 Operation Barbershop (2017)', 'Agent 327 Operation Barbershop (2017).mp4', ia('agent327operationbarbershop', 'agent327-1080.mp4'), false],
  ['Coffee Run (2020)', 'Coffee Run (2020).mp4', ia('coffee-run', 'Coffee Run.mp4'), false],
  ['Sprite Fright (2021)', 'Sprite Fright (2021).mp4', ia('sprite-fright-blender-open-movie', 'Sprite Fright - Blender Open Movie.mp4'), false],
  ['Charge (2022)', 'Charge (2022).mp4', ia('charge-blender-open-movie-1608p', 'Charge - Blender Open Movie 1608p.mp4'), true],
  ['Wing It! (2023)', 'Wing It! (2023).mp4', ia('wing_it', 'wing_it.mp4'), false],
  ['Caminandes Gran Dillama (2013)', 'Caminandes Gran Dillama (2013).mp4', ia('Caminandes2GranDillama', '02_gran_dillama_1080p.mp4'), true],
  // Elephants Dream: two versions of one movie (multi-version test); official Blender server, already small H.264.
  ['Elephants Dream (2006)', 'Elephants Dream (2006) - 720p.mp4', 'https://download.blender.org/ED/elephantsdream-720-h264-st-aac.mov', false],
  ['Elephants Dream (2006)', 'Elephants Dream (2006) - 480p.mp4', 'https://download.blender.org/ED/elephantsdream-480-h264-st-aac.mov', false],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(url, { redirect: 'follow' });
    if (r.status === 429 || r.status >= 500) { const ra = Number(r.headers.get('retry-after')) || 20 * (i + 1); console.log('throttled, waiting', ra, 's'); await sleep((ra + 3) * 1000); continue; }
    return r;
  }
  throw new Error('too many retries ' + url);
}

async function download(url, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  const r = await fetchRetry(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(dest + '.part'));
  await rename(dest + '.part', dest);
}

const only = process.argv.slice(2).map((s) => s.toLowerCase());
for (const [folder, file, url, transcode] of MOVIES) {
  const dest = path.join(root, folder, file);
  if (only.length && !only.some((o) => folder.toLowerCase().includes(o))) continue;
  if (await exists(dest)) { console.log('skip', file); continue; }
  const tmpName = `${folder.replace(/\W+/g, '_')}_${file.includes('480p') ? '480' : '720'}`;
  const src = path.join(dl, tmpName + path.extname(new URL(url).pathname));
  try {
    if (!(await exists(src))) { console.log('downloading', file); await download(url, src); }
    await mkdir(path.dirname(dest), { recursive: true });
    if (transcode) {
      console.log('re-encoding', file);
      const out = `/cache/dl/${tmpName}.out.mp4`;
      await ffmpeg(['-i', `/cache/dl/${path.basename(src)}`, '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=-2:min(720\\,ih)', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-maxrate', '1800k', '-bufsize', '3600k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '112k', '-ac', '2', '-movflags', '+faststart', out]);
      await rename(path.join(dl, `${tmpName}.out.mp4`), dest);
      await rm(src);
    } else {
      await rename(src, dest);
    }
    console.log('ok  ', file, Math.round((await stat(dest)).size / 1e6) + 'MB');
  } catch (e) {
    console.error('FAILED', file, e.message.slice(0, 300));
  }
  await sleep(1500);
}

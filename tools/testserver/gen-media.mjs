// Generates the synthetic media (Codec Zoo, Shows, Music, Photos) with the ffmpeg bundled in the Jellyfin container.
// Idempotent: existing outputs are skipped. Usage: node tools/testserver/gen-media.mjs [zoo|shows|music|photos|extras|segments]...
import path from 'node:path';
import { readFile, writeFile as wf, mkdir as mk } from 'node:fs/promises';
import { writeSup, cuesFor } from './imgsubs.mjs';
import { ensureChapters } from './segments.mjs';
import { buildGuideXml } from './guide.mjs';
import {
  job, art, videoSource, sineIn, pool, rel, writeIfMissing, tag, GEN, DATA, FONT, FONT_CJK, exists, palette,
} from './lib.mjs';

const only = new Set(process.argv.slice(2));
const want = (n) => only.size === 0 || only.has(n);
const run = pool(8);
const tasks = [];
const add = (fn) => tasks.push(run(fn).catch((e) => { console.error('FAILED:', e.message); process.exitCode = 1; }));
const gen = async (sub, name, content) => { const f = path.join(GEN, sub, name); await mk(path.dirname(f), { recursive: true }); await wf(f, content, 'utf8'); return `/cache/gen/${sub}/${name}`; };

// ================================================================== Codec zoo
const ZOO = [
  { id: 'h264', folder: 'H.264 AAC Baseline (2001)', title: 'H.264 AAC Baseline', plot: 'Browser direct-play baseline: H.264 8-bit 720p with AAC stereo in an MP4 with faststart.', rating: 'PG', genre: ['Test', 'Baseline'], dur: 90, ext: 'mp4' },
  { id: 'hevc10', folder: 'HEVC 10-bit EAC3 5.1 (2002)', title: 'HEVC 10-bit EAC3 5.1', plot: 'HEVC Main10 with E-AC-3 5.1 in Matroska. Needs a transcode or audio remux in most browsers.', rating: 'PG-13', genre: ['Test', 'HEVC'], dur: 75, ext: 'mkv' },
  { id: 'hdr10', folder: 'HEVC HDR10 (2003)', title: 'HEVC HDR10', plot: 'HEVC 10-bit flagged BT.2020 / SMPTE ST 2084 with mastering display metadata. Exercises HDR badges and tone mapping.', rating: 'PG-13', genre: ['Test', 'HDR'], dur: 60, ext: 'mkv' },
  { id: 'av1', folder: 'AV1 Opus (2004)', title: 'AV1 Opus', plot: 'AV1 video with Opus audio in WebM.', rating: 'G', genre: ['Test', 'AV1'], dur: 60, ext: 'webm' },
  { id: 'vp9', folder: 'VP9 Vorbis (2005)', title: 'VP9 Vorbis', plot: 'VP9 video with Vorbis audio in WebM.', rating: 'G', genre: ['Test', 'VP9'], dur: 60, ext: 'webm' },
  { id: 'asp', folder: 'MPEG-4 ASP AVI (2006)', title: 'MPEG-4 ASP AVI', plot: 'MPEG-4 Part 2 (Xvid tag) with MP3 in AVI. Always forces a transcode in a browser.', rating: 'PG', genre: ['Test', 'Legacy'], dur: 60, ext: 'avi' },
  { id: 'mpeg2', folder: 'MPEG-2 Program Stream (2007)', title: 'MPEG-2 Program Stream', plot: 'MPEG-2 video with AC-3 audio in an MPG container. Legacy codec.', rating: 'PG', genre: ['Test', 'Legacy'], dur: 60, ext: 'mpg' },
  { id: 'multi', folder: 'Multi Track Showcase (2008)', title: 'Multi Track Showcase', plot: 'Three audio tracks (AAC English stereo, AC-3 French 5.1, DTS Spanish), embedded SRT, a styled ASS with an attached font, a forced track, and external English and French sidecars.', rating: 'R', genre: ['Test', 'Tracks'], dur: 90, ext: 'mkv' },
  { id: 'chapters', folder: 'Chapter Marathon (2009)', title: 'Chapter Marathon', plot: 'Ten named chapters across two minutes. Chapter images and chapter navigation.', rating: 'PG', genre: ['Test', 'Chapters'], dur: 120, ext: 'mkv' },
  { id: 'uhd', folder: '4K UHD Demo (2010)', title: '4K UHD Demo', plot: '3840x2160 HEVC clip for resolution badges and bandwidth limits.', rating: 'PG-13', genre: ['Test', '4K'], dur: 30, ext: 'mkv' },
  { id: 'long', folder: 'The Extraordinarily Long and Unnecessarily Verbose Title of a Movie That Keeps Going Well Past Any Reasonable Limit (2011)', title: 'The Extraordinarily Long and Unnecessarily Verbose Title of a Movie That Keeps Going Well Past Any Reasonable Limit', plot: 'Truncation and wrapping test for cards, detail headers and playback overlays. '.repeat(5).trim(), rating: 'PG', genre: ['Test', 'Layout'], dur: 60, ext: 'mp4', shortTitle: 'Extraordinarily Long Title' },
  { id: 'he', folder: 'שלום עולם - סרט בדיקה (2012)', title: 'שלום עולם - סרט בדיקה', plot: 'סרט בדיקה בעברית לבדיקת כתיבה מימין לשמאל בכרטיסים, בכותרות ובתיאור. The Hebrew title tests right-to-left rendering.', rating: 'PG', genre: ['Test', 'RTL'], dur: 60, ext: 'mp4' },
  { id: 'ja', folder: '日本語のタイトル テスト映画 (2013)', title: '日本語のタイトル テスト映画', plot: '日本語の文字が正しく表示されるかを確認するためのテスト映画です。CJK glyph rendering test.', rating: 'PG', genre: ['Test', 'CJK'], dur: 60, ext: 'mp4', cjk: true },
  { id: 'pgs', folder: 'PGS Image Subtitles (2014)', title: 'PGS Image Subtitles', plot: 'Two embedded PGS (hdmv_pgs_subtitle) bitmap subtitle tracks, English and Spanish, in Matroska. A client either draws them itself from the extracted .sup stream or has the server burn them into the video.', rating: 'PG', genre: ['Test', 'Subtitles'], dur: 24, ext: 'mkv' },
  { id: 'vobsub', folder: 'VobSub Image Subtitles (2015)', title: 'VobSub Image Subtitles', plot: 'Two embedded VobSub (dvd_subtitle) bitmap subtitle tracks, English and Spanish, in Matroska. Needs burn-in like PGS.', rating: 'PG', genre: ['Test', 'Subtitles'], dur: 24, ext: 'mkv' },
  { id: 'dual', folder: 'Dual Audio Second Default (2016)', title: 'Dual Audio Second Default', plot: 'Two AAC audio tracks in Matroska: English first (440 Hz tone), Japanese second and flagged default (880 Hz tone), with a PGS and an ASS subtitle track. A browser plays only the first audio track of a file it plays directly, so the second one needs a remux.', rating: 'PG', genre: ['Test', 'Tracks'], dur: 30, ext: 'mkv' },
];

const SRT = (lines) => lines.map((l, i) => `${i + 1}\n00:00:${String(2 + i * 8).padStart(2, '0')},000 --> 00:00:${String(7 + i * 8).padStart(2, '0')},000\n${l}\n`).join('\n');
const EN = ['Hello from the English track.', 'Subtitles are rendered by the player.', 'This is line three of the test.', 'And this is the last cue.'];
const FR = ['Bonjour depuis la piste francaise.', 'Les sous-titres sont rendus par le lecteur.', 'Voici la troisieme ligne du test.', 'Et voici la derniere replique.'];
const ES = ['Hola desde la pista en espanol.', 'Los subtitulos los dibuja el reproductor.', 'Esta es la tercera linea de la prueba.', 'Y esta es la ultima linea.'];
const FORCED = ['[Forced] Foreign dialogue only.', '[Forced] Second forced cue.'];
const ASS = `[Script Info]\nTitle: Styled\nScriptType: v4.00+\nPlayResX: 1280\nPlayResY: 720\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Serif,46,&H0000E5FF,&H000000FF,&H00301000,&H80000000,-1,-1,0,0,100,100,0,0,1,3,2,2,40,40,50,1\nStyle: Top,DejaVu Serif,38,&H00FFB347,&H000000FF,&H00201010,&H80000000,-1,0,0,0,100,100,2,0,1,2,1,8,40,40,40,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
  `Dialogue: 0,0:00:03.00,0:00:08.00,Default,,0,0,0,,Styled ASS with {\\c&H00FF40&}colors{\\r} and {\\b1}attached font{\\b0}\n` +
  `Dialogue: 0,0:00:10.00,0:00:16.00,Top,,0,0,0,,{\\an8\\fad(500,500)}Top-aligned fading line\n` +
  `Dialogue: 0,0:00:18.00,0:00:24.00,Default,,0,0,0,,{\\pos(640,360)\\frz8}Positioned and rotated\n` +
  `Dialogue: 0,0:00:26.00,0:00:32.00,Default,,0,0,0,,{\\k40}Karaoke{\\k40} style {\\k40}timing\n`;

const CHAPTERS = ['Opening', 'The Setup', 'First Surprise', 'Rising Action', 'Midpoint', 'The Detour', 'Complications', 'Climax', 'Resolution', 'End Credits'];

async function zooNfo(z) {
  const year = z.folder.match(/\((\d{4})\)$/)[1];
  const actors = ['Ada Tester', 'Linus Sample', 'Grace Fixture'].map((n, i) => `  <actor>\n    <name>${n}</name>\n    <role>Character ${i + 1}</role>\n    <type>Actor</type>\n    <order>${i}</order>\n  </actor>\n`).join('');
  return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n<movie>\n${tag('title', z.title)}${tag('originaltitle', z.title)}${tag('plot', z.plot)}${tag('outline', z.plot.slice(0, 90))}${tag('tagline', 'Synthetic test media')}${tag('mpaa', z.rating)}${tag('year', year)}${tag('premiered', year + '-06-15')}${tag('runtime', Math.max(1, Math.round(z.dur / 60)))}${tag('rating', (6 + (z.title.length % 30) / 10).toFixed(1))}${z.genre.map((g) => tag('genre', g)).join('')}${tag('studio', 'Wholphin Test Labs')}${tag('director', 'Dee Rector')}${actors}</movie>\n`;
}

async function zooEncode(z, out) {
  const nm = z.shortTitle ?? (z.title.length > 50 ? z.title.slice(0, 40) : z.title);
  const w = z.id === 'uhd' ? 3840 : 1280, h = z.id === 'uhd' ? 2160 : 720;
  const [vin, vf] = await videoSource({ title: nm, seed: z.id, w, h, dur: z.dur, font: z.cjk ? FONT_CJK : FONT });
  const T = ['-t', String(z.dur)];
  const x264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27'];
  switch (z.id) {
    case 'h264': return [...vin, ...sineIn(440), '-vf', vf + ',format=yuv420p', ...T, ...x264, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-map', '0:v', '-map', '1:a', out];
    case 'hevc10': return [...vin, ...sineIn(494, '5.1'), '-vf', vf + ',format=yuv420p10le', ...T, '-c:v', 'libx265', '-preset', 'ultrafast', '-crf', '28', '-x265-params', 'log-level=error', '-tag:v', 'hvc1', '-c:a', 'eac3', '-b:a', '384k', '-map', '0:v', '-map', '1:a', out];
    case 'hdr10': return [...vin, ...sineIn(523), '-vf', vf + ',format=yuv420p10le', ...T, '-c:v', 'libx265', '-preset', 'ultrafast', '-crf', '26', '-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc', '-x265-params', 'log-level=error:hdr10=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400', '-c:a', 'aac', '-b:a', '128k', '-map', '0:v', '-map', '1:a', out];
    case 'av1': return [...vin, ...sineIn(587), '-vf', vf + ',format=yuv420p', ...T, '-c:v', 'libsvtav1', '-preset', '10', '-crf', '40', '-c:a', 'libopus', '-b:a', '96k', '-map', '0:v', '-map', '1:a', out];
    case 'vp9': return [...vin, ...sineIn(659), '-vf', vf + ',format=yuv420p', ...T, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '40', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-c:a', 'libvorbis', '-q:a', '3', '-map', '0:v', '-map', '1:a', out];
    case 'asp': return [...vin, ...sineIn(698), '-vf', vf + ',format=yuv420p', ...T, '-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', '7', '-c:a', 'libmp3lame', '-b:a', '128k', '-map', '0:v', '-map', '1:a', out];
    case 'mpeg2': return [...vin, ...sineIn(784), '-vf', vf + ',format=yuv420p', ...T, '-c:v', 'mpeg2video', '-b:v', '2500k', '-maxrate', '4000k', '-bufsize', '2M', '-c:a', 'ac3', '-b:a', '192k', '-f', 'mpeg', '-map', '0:v', '-map', '1:a', out];
    case 'uhd': return [...vin, ...sineIn(880), '-vf', vf + ',format=yuv420p', ...T, '-c:v', 'libx265', '-preset', 'ultrafast', '-crf', '30', '-x265-params', 'log-level=error', '-tag:v', 'hvc1', '-c:a', 'aac', '-b:a', '128k', '-map', '0:v', '-map', '1:a', out];
    case 'multi': {
      const sub = async (n, c) => gen('sub', n, c);
      const [en, es, fo, as] = [await sub('en.srt', SRT(EN)), await sub('es.srt', SRT(ES)), await sub('forced.srt', SRT(FORCED)), await sub('styled.ass', ASS)];
      return [...vin, ...sineIn(440), ...sineIn(554, '5.1'), ...sineIn(659), '-i', en, '-i', es, '-i', fo, '-i', as,
        '-vf', vf + ',format=yuv420p', ...T,
        '-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3:a', '-map', '4', '-map', '5', '-map', '6', '-map', '7',
        ...x264, '-c:a:0', 'aac', '-b:a:0', '128k', '-c:a:1', 'ac3', '-b:a:1', '384k', '-c:a:2', 'dca', '-strict', '-2', '-b:a:2', '754k',
        '-c:s:0', 'srt', '-c:s:1', 'srt', '-c:s:2', 'srt', '-c:s:3', 'ass',
        '-metadata:s:a:0', 'language=eng', '-metadata:s:a:0', 'title=English AAC Stereo',
        '-metadata:s:a:1', 'language=fre', '-metadata:s:a:1', 'title=Francais AC3 5.1',
        '-metadata:s:a:2', 'language=spa', '-metadata:s:a:2', 'title=Espanol DTS',
        '-metadata:s:s:0', 'language=eng', '-metadata:s:s:0', 'title=English SRT',
        '-metadata:s:s:1', 'language=spa', '-metadata:s:s:1', 'title=Espanol SRT',
        '-metadata:s:s:2', 'language=eng', '-metadata:s:s:2', 'title=English Forced',
        '-metadata:s:s:3', 'language=eng', '-metadata:s:s:3', 'title=English Styled ASS',
        '-disposition:a:0', 'default', '-disposition:s', '0', '-disposition:s:2', 'forced',
        '-attach', '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', '-metadata:s:t:0', 'mimetype=application/x-truetype-font', '-metadata:s:t:0', 'filename=DejaVuSerif-Bold.ttf',
        out];
    }
    case 'pgs':
    case 'vobsub': {
      // The bundled ffmpeg cannot encode PGS, so imgsubs.mjs writes the .sup itself (text rendered to bitmaps).
      // VobSub: the .sup is decoded and re-encoded by the bundled dvdsub encoder.
      const label = z.id === 'pgs' ? 'PGS' : 'VobSub';
      const en = path.join(GEN, 'sub', `${z.id}-en.sup`), es = path.join(GEN, 'sub', `${z.id}-es.sup`);
      await writeSup(en, cuesFor([`[${label}] Hello from the English image track.`, `[${label}] These subtitles are bitmaps,\nso the server burns them in.`, `[${label}] Line three of the image test.`, `[${label}] And the last bitmap cue.`]));
      await writeSup(es, cuesFor([`[${label}] Hola desde la pista de imagen.`, `[${label}] Estos subtitulos son mapas de bits,\nel servidor los incrusta.`, `[${label}] Tercera linea de la prueba.`, `[${label}] Y la ultima replica.`]));
      const cs = z.id === 'vobsub' ? ['-canvas_size', '1280x720', '-fix_sub_duration'] : [];
      const sc = z.id === 'pgs' ? 'copy' : 'dvdsub';
      return [...vin, ...sineIn(440), ...cs, '-i', `/cache/gen/sub/${z.id}-en.sup`, ...cs, '-i', `/cache/gen/sub/${z.id}-es.sup`, '-vf', vf + ',format=yuv420p', ...T, ...x264,
        '-c:a', 'aac', '-b:a', '96k', '-map', '0:v', '-map', '1:a', '-map', '2', '-map', '3', '-c:s', sc,
        '-metadata:s:a:0', 'language=eng', '-metadata:s:s:0', 'language=eng', '-metadata:s:s:0', `title=English ${label}`,
        '-metadata:s:s:1', 'language=spa', '-metadata:s:s:1', `title=Espanol ${label}`, '-disposition:s', '0', out];
    }
    case 'dual': {
      // anime-style layout: the default-flagged audio track is not the first one; PGS (bitmap) and ASS subtitles
      await writeSup(path.join(GEN, 'sub', 'dual-en.sup'), cuesFor(['[PGS] Dual audio: English image track.', '[PGS] Second bitmap cue.', '[PGS] Third bitmap cue.', '[PGS] Last bitmap cue.']));
      const as = await gen('sub', 'styled.ass', ASS);
      return [...vin, ...sineIn(440), ...sineIn(880), '-i', '/cache/gen/sub/dual-en.sup', '-i', as, '-vf', vf + ',format=yuv420p', ...T, ...x264,
        '-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3', '-map', '4', '-c:a', 'aac', '-b:a', '96k', '-c:s:0', 'copy', '-c:s:1', 'ass',
        '-metadata:s:a:0', 'language=eng', '-metadata:s:a:0', 'title=English AAC (first)', '-metadata:s:a:1', 'language=jpn', '-metadata:s:a:1', 'title=Japanese AAC (default)',
        '-metadata:s:s:0', 'language=eng', '-metadata:s:s:0', 'title=English PGS', '-metadata:s:s:1', 'language=eng', '-metadata:s:s:1', 'title=English ASS',
        '-disposition:a:0', '0', '-disposition:a:1', 'default', '-disposition:s', '0', out];
    }
    case 'chapters': {
      const step = z.dur / CHAPTERS.length * 1000;
      const meta = ';FFMETADATA1\n' + CHAPTERS.map((c, i) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(i * step)}\nEND=${Math.round((i + 1) * step) - 1}\ntitle=${c}\n`).join('');
      const mf = await gen('meta', 'chapters.txt', meta);
      return [...vin, ...sineIn(330), '-i', mf, '-vf', vf + ',format=yuv420p', ...T, ...x264, '-c:a', 'aac', '-b:a', '128k', '-map', '0:v', '-map', '1:a', '-map_metadata', '2', '-map_chapters', '2', out];
    }
    default: return [...vin, ...sineIn(392 + (z.id.length * 17) % 300), '-vf', vf + ',format=yuv420p', ...T, ...x264, '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-map', '0:v', '-map', '1:a', out];
  }
}

function genZoo() {
  for (const z of ZOO) {
    const dir = rel('Codec Zoo', z.folder);
    add(() => job(path.join(dir, `${z.folder}.${z.ext}`), z.ext, (out) => zooEncode(z, out)));
    add(async () => writeIfMissing(path.join(dir, 'movie.nfo'), await zooNfo(z)));
    const nm = z.shortTitle ?? z.title;
    const font = z.cjk ? FONT_CJK : FONT;
    add(() => art(path.join(dir, 'poster.jpg'), 'poster', { title: nm, sub: `${z.genre.join(' / ')}`, seed: z.id, font, wrapAt: z.cjk ? 6 : 11 }));
    add(() => art(path.join(dir, 'backdrop.jpg'), 'backdrop', { title: nm, sub: z.genre.join(' / '), seed: z.id, font }));
    add(() => art(path.join(dir, 'landscape.jpg'), 'thumb', { title: nm, seed: z.id, font }));
    add(() => art(path.join(dir, 'logo.png'), 'logo', { title: nm, seed: z.id, font }));
    if (z.id === 'multi') {
      const b = path.join(dir, z.folder);
      add(() => writeIfMissing(`${b}.en.srt`, SRT(EN.map((l) => '[sidecar] ' + l))));
      add(() => writeIfMissing(`${b}.fr.srt`, SRT(FR.map((l) => '[sidecar] ' + l))));
      add(() => writeIfMissing(`${b}.en.forced.srt`, SRT(FORCED.map((l) => '[sidecar] ' + l))));
    }
  }
}

// ================================================================== Shows
const SHOWS = [
  { name: 'Orbital Drift', year: 2021, rating: 'TV-14', genre: ['Science Fiction', 'Drama'], studio: 'Drift Works', theme: true,
    plot: 'The crew of a failing salvage station drifts between dying orbits, trading wreckage for time.',
    seasons: [
      ['Departure', 'Dead Reckoning', 'The Long Tether', 'Salvage Rights', 'Ghost Signal', 'Perihelion'],
      ['Aftermath', 'Cold Start', null, 'Debris Field', 'The Quiet Burn'], // E03 missing on disk
      ['Reentry', 'Hard Dock', 'Kessler', 'Safe Harbor', 'Unaired Finale'],
    ], specials: ['Behind the Hull', 'Orbital Drift Recap'] },
  { name: 'The Bakery on Elm Street', year: 2019, rating: 'TV-PG', genre: ['Comedy', 'Family'], studio: 'Rising Dough Pictures',
    plot: 'A family bakery survives rival cupcakes, a haunted oven and one very loud cockatoo.',
    seasons: [['Proof of Concept', 'Sourdough Wars', 'The Cockatoo', 'Flour Power', 'Closing Time'], ['Second Rise', 'Gluten Free-For-All', 'The Health Inspector', 'Cake Wars', 'Open Mic Night'], ['Dough or Die', 'Rye Not', 'The Last Croissant', 'Grand Reopening']] },
  { name: 'Detective Moth', year: 2022, rating: 'TV-MA', genre: ['Crime', 'Mystery'], studio: 'Lantern Noir',
    plot: 'A nocturnal detective follows light to the truth in a city that never turns the lamps off.',
    seasons: [['Into the Light', 'Wing and a Prayer', 'The Lamp Post Killer', 'Cocoon'], ['Metamorphosis', 'Dust on the Wings', 'The Candle Case', 'Moonlight'], ['Pupa', 'Silk Road', 'Night Shift', 'Dawn']] },
  { name: 'Pixel Garden', year: 2020, rating: 'TV-Y', genre: ['Animation', 'Kids'], studio: 'Sprout Studios',
    plot: 'Tiny pixel creatures tend a garden where every plant is a different color.',
    seasons: [['Seeds', 'Rain Dance', 'The Great Weed', 'Sunflower Day'], ['Compost Club', 'Bee Friends', 'Snail Mail', 'Moonflower'], ['Harvest', 'Scarecrow', 'First Frost', 'Spring Again']], specials: ['Garden Song'] },
];
const GUESTS = ['Mira Okonkwo', 'Tomas Lindqvist', 'Priya Raman', 'Felix Oduya', 'Hana Sato', 'Diego Marchetti', 'Wren Alderson', 'Noor Haddad'];
const p2 = (n) => String(n).padStart(2, '0');

function genShows() {
  for (const s of SHOWS) {
    const dir = rel('Shows', `${s.name} (${s.year})`);
    const seed = s.name;
    const nfo = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n<tvshow>\n${tag('title', s.name)}${tag('plot', s.plot)}${tag('mpaa', s.rating)}${tag('year', s.year)}${tag('premiered', `${s.year}-03-01`)}${tag('studio', s.studio)}${tag('status', 'Continuing')}${tag('rating', '8.1')}${s.genre.map((g) => tag('genre', g)).join('')}${GUESTS.slice(0, 3).map((g, i) => `  <actor>\n    <name>${g}</name>\n    <role>Lead ${i + 1}</role>\n    <type>Actor</type>\n    <order>${i}</order>\n  </actor>\n`).join('')}</tvshow>\n`;
    add(() => writeIfMissing(path.join(dir, 'tvshow.nfo'), nfo));
    add(() => art(path.join(dir, 'poster.jpg'), 'poster', { title: s.name, sub: `${s.genre.join(' / ')}  ${s.year}`, seed }));
    add(() => art(path.join(dir, 'backdrop.jpg'), 'backdrop', { title: s.name, sub: s.plot.slice(0, 70), seed }));
    add(() => art(path.join(dir, 'landscape.jpg'), 'thumb', { title: s.name, seed }));
    add(() => art(path.join(dir, 'logo.png'), 'logo', { title: s.name, seed }));
    if (s.theme) {
      add(() => job(path.join(dir, 'theme.mp3'), 'mp3', (out) => ['-f', 'lavfi', '-i', 'aevalsrc=0.3*sin(2*PI*196*(1+0.25*floor(mod(t*2\\,4)))*t)*(0.6+0.4*sin(2*PI*t/4)):s=44100:d=20', '-af', 'afade=t=in:d=1,afade=t=out:st=18:d=2', '-c:a', 'libmp3lame', '-b:a', '128k', '-metadata', `title=${s.name} Theme`, out]));
    }
    const seasons = s.seasons.map((eps, i) => ({ n: i + 1, eps }));
    if (s.specials) seasons.unshift({ n: 0, eps: s.specials });
    for (const se of seasons) {
      const sdir = path.join(dir, se.n === 0 ? 'Specials' : `Season ${p2(se.n)}`);
      add(() => art(path.join(dir, se.n === 0 ? 'season-specials-poster.jpg' : `season${p2(se.n)}-poster.jpg`), 'season', { title: se.n === 0 ? 'Specials' : `Season ${se.n}`, sub: s.name, seed: `${seed}${se.n}`, wrapAt: 9 }));
      se.eps.forEach((title, idx) => {
        if (title === null) return; // intentional gap
        const e = idx + 1;
        const code = `S${p2(se.n)}E${p2(e)}`;
        const base = path.join(sdir, `${s.name} - ${code} - ${title}`);
        const future = title === 'Unaired Finale';
        const aired = future ? '2027-12-01' : new Date(Date.UTC(s.year + se.n, 2, 1 + e * 7)).toISOString().slice(0, 10);
        const plot = `${s.name}, ${se.n === 0 ? 'special' : 'season ' + se.n}, episode ${e}. ${title}: ${s.plot.split('.')[0]}.`;
        const guests = [GUESTS[(e + se.n) % 8], GUESTS[(e + se.n + 3) % 8]].map((g, i) => `  <actor>\n    <name>${g}</name>\n    <role>Guest ${i + 1}</role>\n    <type>GuestStar</type>\n  </actor>\n`).join('');
        const enfo = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n<episodedetails>\n${tag('title', title)}${tag('showtitle', s.name)}${tag('season', se.n)}${tag('episode', e)}${tag('plot', plot)}${tag('aired', aired)}${tag('runtime', 1)}${tag('director', 'Dee Rector')}${tag('credits', 'Wren Writer')}${guests}</episodedetails>\n`;
        add(() => writeIfMissing(`${base}.nfo`, enfo));
        add(() => art(`${base}-thumb.jpg`, 'thumb', { title: title, sub: `${code}  ${s.name}`, seed: `${seed}${se.n}${e}`, wrapAt: 20 }));
        add(async () => {
          const [vin, vf] = await videoSource({ title: `${code}\n${title}`.replace(/\n/g, ' - '), seed: `${seed}${se.n}`, w: 640, h: 360, dur: 30, titleSize: 36 });
          return job(`${base}.mp4`, 'mp4', (out) => [...vin, ...sineIn(300 + e * 40 + se.n * 15), '-vf', vf + ',format=yuv420p', '-t', '30', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-c:a', 'aac', '-b:a', '48k', '-movflags', '+faststart', '-map', '0:v', '-map', '1:a', out]);
        });
      });
    }
  }
}

// ================================================================== Music
const ARTISTS = [
  { name: 'The Glass Orchard', genre: 'Indie Rock', fmt: 'mp3', albums: [{ t: 'Hollow Light', y: 2018, tracks: ['Morning Static', 'Paper Lanterns', 'Salt and Iron', 'Hollow Light', 'Quiet Engines', 'Low Tide', 'Open Windows'] }, { t: 'Second Harvest', y: 2021, tracks: ['Bright Fields', 'Ember', 'Cartographer', 'Slow Orbit', 'Goodnight Garden', 'Harvest Moon'] }] },
  { name: 'Mira Voss', genre: 'Electronic', fmt: 'flac', albums: [{ t: 'Neon Cartography', y: 2019, tracks: ['Grid Reference', 'Night Bus', 'Afterimage', 'Vapor Trail', 'Signal Lost', 'Parallax', 'Static Bloom', 'Dawn Protocol'] }, { t: 'Live at the Tidal Hall', y: 2023, discs: 2, tracks: ['Intro', 'Grid Reference (Live)', 'Night Bus (Live)', 'Afterimage (Live)', 'Interlude', 'Vapor Trail (Live)', 'Parallax (Live)', 'Encore'] }] },
  { name: 'Quartet Nocturne', genre: 'Jazz', fmt: 'm4a', albums: [{ t: 'After Hours', y: 2016, tracks: ['Blue Hour', 'Smoke and Mirrors', 'Last Call', 'Velvet Rope', 'Midnight Ledger', 'Taxi Lights'] }, { t: 'Daybreak Sessions', y: 2020, tracks: ['First Light', 'Coffee Steam', 'Window Seat', 'Sunday Walk', 'Rooftop', 'Lullaby for Tuesday', 'Homebound'] }] },
];
const LRC = `[ti:Morning Static]\n[ar:The Glass Orchard]\n[al:Hollow Light]\n[00:00.00]Instrumental intro\n[00:03.50]Morning static on the radio\n[00:07.00]Paper lanterns in the snow\n[00:10.50]Everything we meant to say\n[00:14.00]Fades before it gets to play\n[00:18.00]Morning static, let it go\n`;

const covers = {};
function genMusic() {
  ARTISTS.forEach((a, ai) => {
    const adir = rel('Music', a.name);
    add(() => art(path.join(adir, 'folder.jpg'), 'square', { title: a.name, sub: a.genre, seed: a.name, wrapAt: 10 }));
    add(() => art(path.join(adir, 'backdrop.jpg'), 'backdrop', { title: a.name, sub: a.genre, seed: a.name }));
    add(() => writeIfMissing(path.join(adir, 'artist.nfo'), `<?xml version="1.0" encoding="utf-8" standalone="yes"?>\n<artist>\n${tag('name', a.name)}${tag('biography', `${a.name} is a fictional ${a.genre.toLowerCase()} act created for client testing.`)}${tag('genre', a.genre)}</artist>\n`));
    a.albums.forEach((al, li) => {
      const ldir = path.join(adir, `${al.t} (${al.y})`);
      const coverKey = `${ai}${li}`;
      covers[coverKey] ??= art(path.join(GEN, 'covers', `${coverKey}.jpg`), 'square', { title: al.t, sub: a.name, seed: a.name + al.t, wrapAt: 10 });
      add(() => art(path.join(ldir, 'folder.jpg'), 'square', { title: al.t, sub: a.name, seed: a.name + al.t, wrapAt: 10 }));
      al.tracks.forEach((t, ti) => {
        const no = ti + 1;
        const disc = al.discs ? (no <= al.tracks.length / 2 ? 1 : 2) : 1;
        const tno = al.discs ? (disc === 1 ? no : no - al.tracks.length / 2) : no;
        const dir = al.discs ? path.join(ldir, `Disc ${disc}`) : ldir;
        const file = path.join(dir, `${p2(tno)} - ${t}.${a.fmt}`);
        add(async () => {
          await new Promise((r) => setTimeout(r, 0));
          if (await exists(file)) return;
          await covers[coverKey];
          const base = 130 + ai * 40 + ti * 11 + li * 25;
          const codec = a.fmt === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '192k', '-id3v2_version', '3'] : a.fmt === 'flac' ? ['-c:a', 'flac'] : ['-c:a', 'aac', '-b:a', '160k'];
          const meta = ['title=' + t, 'artist=' + a.name, 'album_artist=' + a.name, 'album=' + al.t, `track=${tno}/${al.discs ? al.tracks.length / 2 : al.tracks.length}`, `date=${al.y}`, 'genre=' + a.genre, ...(al.discs ? [`disc=${disc}/2`] : [])].flatMap((m) => ['-metadata', m]);
          const vcodec = a.fmt === 'm4a' ? ['-c:v', 'mjpeg'] : ['-c:v', 'copy'];
          return job(file, a.fmt, (out) => ['-f', 'lavfi', '-i', `aevalsrc=0.3*sin(2*PI*${base}*(1+0.25*floor(mod(t*2\\,4)))*t)*(0.6+0.4*sin(2*PI*t/3)):s=44100:d=20`, '-i', `/cache/gen/covers/${ai}${li}.jpg`, '-map', '0:a', '-map', '1:v', '-af', 'afade=t=in:d=0.5,afade=t=out:st=19:d=1', ...codec, ...vcodec, '-disposition:v', 'attached_pic', ...meta, '-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)', '-t', '20', out]);
        });
        if (ai === 0 && li === 0 && no === 1) add(() => writeIfMissing(path.join(dir, `${p2(tno)} - ${t}.lrc`), LRC));
      });
    });
  });
}

// ================================================================== Photos / home videos
const SHAPES = [[1600, 1200], [1800, 1200], [1920, 1080], [1200, 1200], [1200, 1600], [1080, 1920], [3000, 1000], [1200, 1800]];
const ALBUMS = [{ dir: '2024-07 Alpine Trip', seed: 'alpine', cams: ['Wholphin Cam', 'Test One'], base: [2024, 6, 14] }, { dir: 'Autumn City Lights', seed: 'city', cams: ['PixelPhone 9', 'Pro Cam'], base: [2023, 9, 2] }];
const GTYPES = ['', ':type=radial', ':type=circular', ':type=spiral'];

function rat(n, d) { return [n, d]; }
function buildExif({ make, model, date, exp, fnum, iso, focal, orient }) {
  const enc = new TextEncoder();
  const ascii = (s) => { const b = enc.encode(s + '\0'); return b; };
  // Layout: header(8) IFD0 | strings | rationals | ExifIFD
  const ifd0 = [
    { tag: 0x010f, type: 2, data: ascii(make) }, { tag: 0x0110, type: 2, data: ascii(model) },
    { tag: 0x0112, type: 3, short: orient }, { tag: 0x0132, type: 2, data: ascii(date) }, { tag: 0x8769, type: 4, long: 'EXIF' },
  ];
  const exif = [
    { tag: 0x829a, type: 5, rats: [rat(exp[0], exp[1])] }, { tag: 0x829d, type: 5, rats: [rat(fnum[0], fnum[1])] }, { tag: 0x8827, type: 3, short: iso },
    { tag: 0x9003, type: 2, data: ascii(date) }, { tag: 0x920a, type: 5, rats: [rat(focal, 1)] },
  ];
  const sizeIfd = (e) => 2 + e.length * 12 + 4;
  let off = 8; const ifd0Off = off; off += sizeIfd(ifd0);
  const exifOff = off; off += sizeIfd(exif);
  const extra = []; // [offset, bytes]
  const place = (bytes) => { const o = off; extra.push([o, bytes]); off += bytes.length + (bytes.length % 2); return o; };
  const entryBuf = (e) => {
    const b = new DataView(new ArrayBuffer(12)); b.setUint16(0, e.tag); b.setUint16(2, e.type);
    if (e.type === 2) { b.setUint32(4, e.data.length); if (e.data.length <= 4) { new Uint8Array(b.buffer).set(e.data, 8); } else b.setUint32(8, place(e.data)); }
    else if (e.type === 3) { b.setUint32(4, 1); b.setUint16(8, e.short); }
    else if (e.type === 4) { b.setUint32(4, 1); b.setUint32(8, exifOff); }
    else if (e.type === 5) { const r = new DataView(new ArrayBuffer(8)); r.setUint32(0, e.rats[0][0]); r.setUint32(4, e.rats[0][1]); b.setUint32(4, 1); b.setUint32(8, place(new Uint8Array(r.buffer))); }
    return new Uint8Array(b.buffer);
  };
  const ifdBuf = (entries) => { const parts = entries.map(entryBuf); const out = new Uint8Array(sizeIfd(entries)); const dv = new DataView(out.buffer); dv.setUint16(0, entries.length); parts.forEach((p, i) => out.set(p, 2 + i * 12)); return out; };
  const a = ifdBuf(ifd0), b = ifdBuf(exif);
  const total = new Uint8Array(off); const dv = new DataView(total.buffer);
  total.set([0x4d, 0x4d, 0, 42], 0); dv.setUint32(4, ifd0Off);
  total.set(a, ifd0Off); total.set(b, exifOff);
  for (const [o, bytes] of extra) total.set(bytes, o);
  const app1 = new Uint8Array(2 + 2 + 6 + total.length); const d2 = new DataView(app1.buffer);
  d2.setUint16(0, 0xffe1); d2.setUint16(2, 2 + 6 + total.length); app1.set(enc.encode('Exif\0\0'), 4); app1.set(total, 10);
  return app1;
}
async function injectExif(file, opts) {
  const buf = await readFile(file);
  let p = 2; // after SOI, skip APP0 if present
  if (buf[2] === 0xff && buf[3] === 0xe0) p = 4 + ((buf[4] << 8) | buf[5]);
  const app1 = buildExif(opts);
  await wf(file, Buffer.concat([buf.subarray(0, p), Buffer.from(app1), buf.subarray(p)]));
}

function genPhotos() {
  ALBUMS.forEach((al, ai) => {
    for (let i = 1; i <= 15; i++) {
      const [w, h] = SHAPES[(i + ai) % SHAPES.length];
      const file = rel('Photos', al.dir, `${al.seed}-${p2(i)}.jpg`);
      const withExif = i % 3 !== 0;
      const d = new Date(Date.UTC(al.base[0], al.base[1], al.base[2], 8 + (i % 9), (i * 7) % 60));
      const stamp = d.toISOString().replace(/-/g, ':').replace('T', ' ').slice(0, 19);
      add(() => job(file, 'jpg', async (out) => {
        const p = palette(al.seed + i);
        const lines = `${al.dir.replace(/^\d{4}-\d{2} /, '')}\n${p2(i)}  ${w}x${h}`;
        await mk(path.join(GEN, 'txt'), { recursive: true });
        const tf = await gen('txt', `ph-${al.seed}-${i}.txt`, lines);
        const vf = `scale=${w}:${h}:flags=bicubic,drawtext=fontfile=${FONT}:textfile=${tf}:fontsize=${Math.round(Math.min(w, h) / 9)}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:line_spacing=14:shadowcolor=black@0.6:shadowx=3:shadowy=3,drawbox=x=iw*0.1:y=ih*0.1:w=iw*0.8:h=ih*0.8:color=white@0.5:t=6`;
        return ['-f', 'lavfi', '-i', `gradients=s=${Math.round(w / 6)}x${Math.round(h / 6)}:c0=${p[0]}:c1=${p[1]}:c2=${p[2]}:nb_colors=3${GTYPES[(i + ai) % 4]}:d=1:r=1:seed=${i * 13 + ai}`, '-vf', vf, '-frames:v', '1', '-q:v', '3', out];
      }, withExif ? (f) => injectExif(f, { make: al.cams[i % 2], model: `${al.cams[i % 2]} M${i}`, date: stamp, exp: [1, 60 + i * 20], fnum: [28 + i, 10], iso: 100 * (1 + (i % 6)), focal: 18 + i * 3, orient: 1 }) : undefined));
    }
    add(() => writeIfMissing(path.join(rel('Photos', al.dir), 'album.nfo'), '<?xml version="1.0" encoding="utf-8"?>\n<album></album>\n'));
  });
  ['Birthday Cake Clip', 'Beach Day Clip'].forEach((t, i) => {
    add(async () => {
      const [vin, vf] = await videoSource({ title: t, seed: t, w: 1280, h: 720, dur: 15 });
      return job(rel('Photos', 'Home Videos', `${t}.mp4`), 'mp4', (out) => [...vin, ...sineIn(330 + i * 90), '-vf', vf + ',format=yuv420p', '-t', '15', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', '-map', '0:v', '-map', '1:a', out]);
    });
  });
}

// ================================================================== Blender movie extras (local trailer + extras folder + a user avatar)
function genExtras() {
  add(() => art(path.join(DATA, 'avatars', 'casey.jpg'), 'avatar', { title: 'CR', seed: 'casey', titleSize: 220 }));
  const dir = rel('Movies', 'Big Buck Bunny (2008)');
  const src = path.join(dir, 'Big Buck Bunny (2008).mp4');
  add(async () => {
    if (!(await exists(src))) { console.warn('extras: Big Buck Bunny not downloaded yet, skipping'); return; }
    const c = '/media/Movies/Big Buck Bunny (2008)/Big Buck Bunny (2008).mp4';
    await job(path.join(dir, 'Big Buck Bunny (2008)-trailer.mp4'), 'mp4', (out) => ['-ss', '60', '-t', '30', '-i', c, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-vf', 'scale=-2:360', '-c:a', 'aac', '-b:a', '64k', out]);
    await job(path.join(dir, 'extras', 'Behind the Scenes.mp4'), 'mp4', (out) => ['-ss', '200', '-t', '45', '-i', c, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-vf', 'scale=-2:360', '-c:a', 'aac', '-b:a', '64k', out]);
    await job(path.join(dir, 'extras', 'Deleted Scene.mp4'), 'mp4', (out) => ['-ss', '300', '-t', '25', '-i', c, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-vf', 'scale=-2:360', '-c:a', 'aac', '-b:a', '64k', out]);
  });
}

// ================================================================== Live TV guide (XMLTV; channels.m3u is written by setup.mjs)
// The guide runs out (guide.mjs): `node tools/testserver/setup.mjs guide` renews the copy on the server.
function genLiveTv() {
  const dir = rel('LiveTV');
  add(async () => {
    await mk(dir, { recursive: true });
    await wf(path.join(dir, 'guide.xml'), buildGuideXml(), 'utf8');
  });
}

if (want('zoo')) genZoo();
if (want('livetv')) genLiveTv();
if (want('shows')) genShows();
if (want('music')) genMusic();
if (want('photos')) genPhotos();
if (want('extras')) genExtras();
await Promise.all(tasks);
if (want('shows') || want('segments')) await ensureChapters(); // chapters for the media-segment test data (Orbital Drift S1)
console.log('gen-media done');

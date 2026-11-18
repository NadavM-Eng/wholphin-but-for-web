#!/usr/bin/env node
// Reference screenshot capture: drives the official Wholphin Android TV app over adb.
//   node tools/refshots/capture.mjs                    run every scene
//   node tools/refshots/capture.mjs --scene movie-detail,home   run selected scenes
//   node tools/refshots/capture.mjs --list              list scene ids
//   node tools/refshots/capture.mjs --keep-going        (default) a failing scene is logged and skipped
import { ADB, OUT, ROOT, SERIAL, fs, path, run } from './common.mjs';
import { spawnSync } from 'node:child_process';
import * as ui from './adbui.mjs';
import { SCENES } from './scenes.mjs';
import { Skip, makeCtx } from './ctx.mjs';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : null; };

if (argv.includes('--list')) {
  SCENES.forEach((s, i) => console.log(String(i + 1).padStart(2, '0'), s.id.padEnd(22), s.title));
  process.exit(0);
}

const want = arg('scene') ? new Set(arg('scene').split(',')) : null;
for (const w of want || []) if (!SCENES.some((s) => s.id === w)) { console.error('unknown scene', w); process.exit(1); }

fs.mkdirSync(OUT, { recursive: true });
const manifestPath = path.join(OUT, 'manifest.json');
let manifest = { generated: null, device: '1920x1080@320dpi (960x540dp)', app: null, shots: [], failures: {} };
try { manifest = { ...manifest, ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')) }; } catch { /* first run */ }
manifest.shots ||= []; manifest.failures ||= {};
manifest.shots = manifest.shots.filter((s) => fs.existsSync(path.join(OUT, s.file))); // drop entries whose PNG is gone
const save = () => { manifest.generated = new Date().toISOString(); fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)); };

function ensureEmulator() {
  const up = () => new RegExp(SERIAL + '\\s+device').test(run(ADB(), ["devices"]).stdout || "");
  if (up() && (run(ADB(), ["-s", SERIAL, "shell", "getprop", "sys.boot_completed"]).stdout || "").trim() === "1") return;
  console.log("emulator not running: starting it");
  spawnSync(process.execPath, [path.join(ROOT, "tools", "refshots", "emulator.mjs"), "start"], { stdio: "inherit" });
}
ensureEmulator();
const ctx = await makeCtx({ manifest, save });
manifest.app = ctx.appVersion;

for (let i = 0; i < SCENES.length; i++) {
  const scene = SCENES[i];
  if (want && !want.has(scene.id)) continue;
  const nn = String(i + 1).padStart(2, '0');
  console.log(`\n=== ${nn} ${scene.id}: ${scene.title}`);
  // drop stale shots of this scene so a re-run replaces them
  manifest.shots = manifest.shots.filter((s) => s.scene !== scene.id);
  for (const f of fs.readdirSync(OUT)) if (f.startsWith(nn + '-') && f.endsWith('.png') && f.slice(3).startsWith(scene.id)) fs.unlinkSync(path.join(OUT, f));
  for (const k of Object.keys(manifest.failures)) if (k === scene.id || k.startsWith(scene.id + ':')) delete manifest.failures[k]; // stale notes
  ensureEmulator();
  ctx.begin(scene, nn);
  try {
    await scene.run(ctx);
    try { fs.unlinkSync(path.join(OUT, `_fail-${scene.id}.png`)); } catch { /* none */ }
  } catch (e) {
    const skipped = e instanceof Skip;
    manifest.failures[scene.id] = (skipped ? 'SKIPPED: ' : '') + String(e && e.message || e);
    console.log(`  !! ${skipped ? 'SKIPPED' : 'FAILED'}: ${manifest.failures[scene.id]}`);
    if (!skipped) try { fs.writeFileSync(path.join(OUT, `_fail-${scene.id}.png`), await ui.settle({ timeout: 2000 })); } catch { /* ignore */ }
  }
  manifest.shots.sort((a, b) => a.file.localeCompare(b.file));
  save();
}
console.log(`\nDone. ${manifest.shots.length} shots, ${Object.keys(manifest.failures).length} failed scenes. Manifest: ${path.relative(ROOT, manifestPath)}`);

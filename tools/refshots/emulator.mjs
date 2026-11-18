#!/usr/bin/env node
// Android TV emulator management for reference screenshots.
// Usage: node tools/refshots/emulator.mjs <create|start|stop|install|status> [--window] [--wipe]
import {
  ADB, AVD_HOME, AVD_NAME, EMULATOR, EMU_PORT, IMAGE, OUT, PKG, SDK, SERIAL,
  adb, adbShell, env, fs, path, run, sdkCmdlineTool, sleep, spawn,
} from './common.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest);

function log(...a) { console.log('[emulator]', ...a); }

function apkPath() {
  const dir = path.join(OUT, 'apk');
  return ['Wholphin-x86_64.apk', 'Wholphin.apk'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
}

function accelCheck() {
  const r = run(EMULATOR(), ['-accel-check']);
  return { ok: /usable|available/i.test(r.stdout + r.stderr) && r.status === 0, text: (r.stdout + r.stderr).trim() };
}

async function create() {
  const acc = accelCheck();
  log('accel:', acc.text.replace(/\s+/g, ' '));
  if (!acc.ok) { console.error('Hardware acceleration unavailable; refusing to continue (enable Windows Hypervisor Platform).'); process.exit(2); }
  fs.mkdirSync(AVD_HOME, { recursive: true });
  if (!fs.existsSync(path.join(SDK, ...IMAGE.split(';')))) {
    log('installing', IMAGE, '(~1.5 GB download, ~8.5 GB on disk)');
    const sdkm = sdkCmdlineTool('sdkmanager');
    await new Promise((res) => {
      const r = spawn(`"${sdkm}"`, [`--sdk_root=${SDK}`, `"${IMAGE}"`], { shell: true, stdio: ['pipe', 'inherit', 'inherit'], env: env() });
      r.stdin.write('y\ny\ny\ny\n'); r.stdin.end();
      r.on('exit', res);
    });
  }
  const avdm = sdkCmdlineTool('avdmanager');
  if (!fs.existsSync(path.join(AVD_HOME, AVD_NAME + '.avd'))) {
    const r = run(avdm, ['create', 'avd', '-n', AVD_NAME, '-k', IMAGE, '-d', 'tv_1080p', '--force'], { input: 'no\n' });
    log((r.stdout + r.stderr).trim());
  }
  const cfgPath = path.join(AVD_HOME, AVD_NAME + '.avd', 'config.ini');
  let cfg = fs.readFileSync(cfgPath, 'utf8');
  const set = (k, v) => {
    const re = new RegExp('^' + k.replace(/\./g, '\\.') + '\\s*=.*$', 'm');
    cfg = re.test(cfg) ? cfg.replace(re, `${k}=${v}`) : cfg.trimEnd() + `\n${k}=${v}\n`;
  };
  // 1920x1080 @ 320dpi => 960x540dp (the standard TV layout canvas)
  set('hw.lcd.width', 1920); set('hw.lcd.height', 1080); set('hw.lcd.density', 320);
  set('hw.ramSize', 2048); set('vm.heapSize', 384);
  set('disk.dataPartition.size', '4G');
  set('hw.gpu.enabled', 'yes'); set('hw.gpu.mode', 'swiftshader_indirect');
  set('hw.keyboard', 'yes'); set('showDeviceFrame', 'no');
  set('hw.audioInput', 'no'); set('hw.audioOutput', 'no');
  fs.writeFileSync(cfgPath, cfg);
  log('AVD ready at', path.join(AVD_HOME, AVD_NAME + '.avd'));
}

function running() {
  const r = run(ADB(), ['devices']);
  return new RegExp(SERIAL + '\\s+device').test(r.stdout || '');
}
function booted() {
  const r = run(ADB(), ['-s', SERIAL, 'shell', 'getprop', 'sys.boot_completed']);
  return (r.stdout || '').trim() === '1';
}

async function start() {
  if (running() && booted()) { log('already running'); return; }
  const args = ['-avd', AVD_NAME, '-port', String(EMU_PORT), '-no-audio', '-no-boot-anim', '-no-snapshot', '-gpu', 'swiftshader_indirect', '-memory', '2048'];
  if (!flags.has('--window')) args.push('-no-window');
  if (flags.has('--wipe')) args.push('-wipe-data');
  fs.mkdirSync(OUT, { recursive: true });
  const logFd = fs.openSync(path.join(OUT, 'emulator.log'), 'a');
  const child = spawn(EMULATOR(), args, { detached: true, stdio: ['ignore', logFd, logFd], env: env(), windowsHide: true });
  child.unref();
  log('launched pid', child.pid, '- waiting for boot (first boot can take several minutes)');
  const t0 = Date.now();
  while (Date.now() - t0 < 15 * 60 * 1000) {
    await sleep(5000);
    if (running() && booted()) break;
  }
  if (!booted()) { console.error('boot timeout; see', path.join(OUT, 'emulator.log')); process.exit(1); }
  await sleep(3000);
  // disable animations (stable screenshots) and keep the screen on
  for (const k of ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale']) adbShell(`settings put global ${k} 0`);
  adbShell('settings put system screen_off_timeout 2147483647');
  adbShell('svc power stayon true');
  log('booted in', Math.round((Date.now() - t0) / 1000), 's;', adbShell('wm size').trim().replace(/\n/g, ' '), adbShell('wm density').trim().replace(/\n/g, ' '));
}

function stop() {
  if (running()) { run(ADB(), ['-s', SERIAL, 'emu', 'kill']); log('kill sent'); }
  else log('not running');
}

function install() {
  const apk = apkPath();
  if (!apk) { console.error('No APK in refshots/out/apk. Run: gh release download -R damontecres/Wholphin --pattern "Wholphin-x86_64.apk" -D refshots/out/apk'); process.exit(1); }
  const r = adb(['install', '-r', '-g', apk]);
  log((r.stdout + r.stderr).trim());
  if (r.status !== 0) process.exit(1);
}

function status() {
  const acc = accelCheck();
  const out = {
    accel: acc.ok, avdHome: AVD_HOME, avdExists: fs.existsSync(path.join(AVD_HOME, AVD_NAME + '.avd')),
    imageInstalled: fs.existsSync(path.join(SDK, ...IMAGE.split(';'))), apk: apkPath() || null,
    running: running(), booted: running() && booted(),
  };
  if (out.booted) {
    out.size = adbShell('wm size').trim(); out.density = adbShell('wm density').trim();
    out.wholphinInstalled = /package:/.test(adbShell(`pm list packages ${PKG}`));
    out.version = (adbShell(`dumpsys package ${PKG} | grep versionName`).match(/versionName=(\S+)/) || [])[1] || null;
  }
  console.log(JSON.stringify(out, null, 2));
}

const table = { create, start, stop, install, status };
if (!table[cmd]) { console.error('usage: emulator.mjs <create|start|stop|install|status> [--window] [--wipe]'); process.exit(1); }
await table[cmd]();

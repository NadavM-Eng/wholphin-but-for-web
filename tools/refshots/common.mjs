// Shared paths/helpers for the reference-screenshot tooling (plain Node ESM, no deps).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT = path.join(ROOT, 'refshots', 'out');
// The Android SDK is found through the standard environment variables only: ANDROID_HOME, then the older
// ANDROID_SDK_ROOT. There is no built-in default.
function sdkRoot() {
  const dir = (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '').trim();
  if (!dir) {
    console.error(
      'refshots: the Android SDK location is not set. Set ANDROID_HOME (or ANDROID_SDK_ROOT) to the folder that ' +
        'holds cmdline-tools, emulator and platform-tools, then run the command again.',
    );
    process.exit(1);
  }
  if (!fs.existsSync(dir)) {
    console.error(`refshots: the Android SDK folder named by ANDROID_HOME / ANDROID_SDK_ROOT does not exist: ${dir}`);
    process.exit(1);
  }
  return dir;
}
export const SDK = sdkRoot();
export const AVD_NAME = 'wholphin_tv';
export const AVD_HOME = path.join(OUT, 'avd');
export const IMAGE = 'system-images;android-36;android-tv;x86_64';
export const PKG = 'com.github.damontecres.wholphin';
export const EMU_PORT = 5570; // console port; adb serial is emulator-5570
export const SERIAL = `emulator-${EMU_PORT}`;
const EXT = process.platform === 'win32' ? '.exe' : '';
export const exe = (rel) => path.join(SDK, ...rel.split('/')) + EXT;
export const ADB = () => exe('platform-tools/adb');
export const EMULATOR = () => exe('emulator/emulator');

export function sdkCmdlineTool(name) {
  const dir = path.join(SDK, 'cmdline-tools');
  const vers = fs.readdirSync(dir).sort().reverse();
  for (const v of vers) {
    const p = path.join(dir, v, 'bin', name + (process.platform === 'win32' ? '.bat' : ''));
    if (fs.existsSync(p)) return p;
  }
  throw new Error('cmdline-tools/' + name + ' not found under ' + dir);
}

export function env() {
  return { ...process.env, ANDROID_SDK_ROOT: SDK, ANDROID_HOME: SDK, ANDROID_AVD_HOME: AVD_HOME };
}

export function run(cmd, args, opts = {}) {
  const shell = /\.bat$/i.test(cmd); // .bat files need a shell on Windows
  const q = (a) => (/[\s;]/.test(a) ? `"${a}"` : a);
  return spawnSync(shell ? q(cmd) : cmd, shell ? args.map(q) : args, {
    encoding: opts.binary ? 'buffer' : 'utf8',
    env: env(),
    shell,
    maxBuffer: 256 * 1024 * 1024,
    ...opts,
  });
}

export function adb(args, opts = {}) {
  return run(ADB(), ['-s', SERIAL, ...args], opts);
}
export function adbShell(cmd) {
  const r = adb(['shell', cmd]);
  return (r.stdout || '').replace(/\r/g, '');
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { spawn, fs, path };

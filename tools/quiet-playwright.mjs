// Keeps automated browser tests out of the way on a machine someone is using:
//   1. every Chromium/Edge/Chrome that Playwright launches gets --mute-audio (Playwright only mutes
//      headless browsers by default, and playback tests run real media);
//   2. every Playwright launch (Chromium, Firefox, WebKit) is forced headless, so no window opens or
//      steals focus, even if a script asks for `headless: false`. Set WW_ALLOW_HEADED=1 in the
//      environment to allow a visible window for a manual debugging session.
// Decoding and Web Audio analysis still work when muted, so audio assertions are unaffected.
// Runs automatically after `npm install` (postinstall); safe to run repeatedly; no-op without Playwright.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const file = resolve(root, 'node_modules/playwright-core/lib/coreBundle.js')

const PATCHES = [
  {
    name: 'mute audio',
    mark: 'wholphin-web: never play test audio',
    find: 'const chromeArguments = [...chromiumSwitches()];',
    replace: 'const chromeArguments = [...chromiumSwitches(), "--mute-audio" /* wholphin-web: never play test audio */];',
  },
  {
    name: 'force headless',
    mark: 'wholphin-web: no test windows',
    find: 'let { headless = true, downloadsPath, proxy } = options;',
    replace:
      'let { headless = true, downloadsPath, proxy } = options;\n        if (!process.env.WW_ALLOW_HEADED) headless = true; /* wholphin-web: no test windows */',
  },
]

if (!existsSync(file)) {
  console.log('quiet-playwright: playwright-core not installed, nothing to do')
} else {
  let src = readFileSync(file, 'utf8')
  let changed = false
  for (const p of PATCHES) {
    if (src.includes(p.mark)) {
      console.log(`quiet-playwright: ${p.name}: already applied`)
    } else if (!src.includes(p.find)) {
      // Playwright changed its launch code. Fail loudly: a silent miss means sound or windows on someone's desktop.
      console.error(`quiet-playwright: ${p.name}: launch code not recognized; update tools/quiet-playwright.mjs`)
      process.exitCode = 1
    } else {
      src = src.split(p.find).join(p.replace)
      changed = true
      console.log(`quiet-playwright: ${p.name}: applied`)
    }
  }
  if (changed) writeFileSync(file, src)
}

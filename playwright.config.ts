// End-to-end regression suite (Playwright Test). How to run and extend it: e2e/README.md.
// Every launch is headless and muted (tools/quiet-playwright.mjs patches Playwright; the options below say it too).
import path from 'node:path'
import { defineConfig } from '@playwright/test'
import { E2E_BASE_URL, E2E_PORT } from './e2e/fixtures/env'
import type { SuiteOptions } from './e2e/fixtures'
import { DESKTOP, FIREFOX, IPHONE, OUTPUT_DIR, PHONE, WEBKIT, storageStatePath } from './e2e/projects'

const CI = !!process.env.CI
/** E2E_ENGINES_ALL=1: Firefox / WebKit run every desktop test and the iPhone profile every phone test (a full
 *  compatibility pass) instead of the tagged smoke subset. */
const ENGINES_ALL = !!process.env.E2E_ENGINES_ALL
const ENGINE_GREP = ENGINES_ALL ? /@desktop|@engines/ : /@engines/
const IPHONE_GREP = ENGINES_ALL ? /@phone|@iphone/ : /@iphone/

export default defineConfig<SuiteOptions>({
  testDir: './e2e',
  outputDir: path.join(OUTPUT_DIR, 'test-results'),
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // Shares the machine with people: 4 workers by default, E2E_WORKERS to change it.
  workers: Number(process.env.E2E_WORKERS ?? 4),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: path.join(OUTPUT_DIR, 'report'), open: 'never' }]],
  use: {
    baseURL: E2E_BASE_URL,
    headless: true,
    launchOptions: { args: ['--mute-audio'] },
    // the app skips its JS animations (page fade, smooth scrolling); CSS animations are removed by the fixture
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: `npx vite --port ${E2E_PORT} --strictPort`,
    url: E2E_BASE_URL,
    env: { WW_VITE_CACHE: `node_modules/.vite-${E2E_PORT}` },
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts$/, use: { ...DESKTOP } },
    {
      name: 'desktop',
      grep: /@desktop/,
      dependencies: ['setup'],
      use: { ...DESKTOP, storageState: storageStatePath('desktop') },
    },
    {
      name: 'keyboard',
      grep: /@keyboard/,
      dependencies: ['setup'],
      use: { ...DESKTOP, storageState: storageStatePath('keyboard'), keyboardOnly: true },
    },
    {
      name: 'phone',
      grep: /@phone/,
      dependencies: ['setup'],
      use: { ...PHONE, storageState: storageStatePath('phone') },
    },
    {
      // Tests that change server state (favourites, watched). They restore what they change, but run in their
      // own project and session so the read-only projects never see a half-changed item.
      name: 'writes',
      grep: /@writes/,
      dependencies: ['setup'],
      use: { ...DESKTOP, storageState: storageStatePath('writes') },
    },
    // Other engines: a smoke subset (sign-in, Home, a library, a detail page, search, menus) so the default run
    // stays fast. Headless and muted there too (Firefox has no --mute-audio: its volume pref instead).
    {
      name: 'firefox',
      grep: ENGINE_GREP,
      dependencies: ['setup'],
      use: {
        ...FIREFOX,
        browserName: 'firefox',
        storageState: storageStatePath('firefox'),
        launchOptions: { firefoxUserPrefs: { 'media.volume_scale': '0.0' } },
      },
    },
    {
      name: 'webkit',
      grep: ENGINE_GREP,
      dependencies: ['setup'],
      use: { ...WEBKIT, browserName: 'webkit', storageState: storageStatePath('webkit'), launchOptions: {} },
    },
    {
      name: 'iphone',
      grep: IPHONE_GREP,
      dependencies: ['setup'],
      use: { ...IPHONE, browserName: 'webkit', storageState: storageStatePath('iphone'), launchOptions: {} },
    },
  ],
})

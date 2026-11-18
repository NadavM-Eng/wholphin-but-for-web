// Browser profiles of the suite's projects, shared by playwright.config.ts and the sign-in setup.
import path from 'node:path'
import { devices, type BrowserContextOptions } from '@playwright/test'
import { E2E_RUN_ID, REPO_ROOT } from './fixtures/env'

/** Git-ignored folder for everything a run produces (storage states, traces, screenshots, report). */
export const OUTPUT_DIR = path.join(REPO_ROOT, 'e2e', '.output', ...(E2E_RUN_ID ? [E2E_RUN_ID] : []))

const { defaultBrowserType: _browser, ...desktopChrome } = devices['Desktop Chrome']

export const DESKTOP: BrowserContextOptions = {
  ...desktopChrome,
  viewport: { width: 1440, height: 900 },
}

export const PHONE: BrowserContextOptions = {
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
}

const { defaultBrowserType: _ff, ...desktopFirefox } = devices['Desktop Firefox']
const { defaultBrowserType: _sf, ...desktopSafari } = devices['Desktop Safari']
const { defaultBrowserType: _ip, ...iPhone } = devices['iPhone 13']

/** Other engines (smoke subset, tag @engines / @iphone): same 1440x900 window, the engine's own user agent. */
export const FIREFOX: BrowserContextOptions = { ...desktopFirefox, viewport: { width: 1440, height: 900 } }
export const WEBKIT: BrowserContextOptions = { ...desktopSafari, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
/**
 * iPhone Safari profile (WebKit) at the phone project's 390x844: touch, iOS user agent, hover: none. Without
 * isMobile: Playwright's WebKit on a Windows desktop with display scaling would lay out wider than it shows
 * (tools/shots/capture.ts matchCssViewport compensates only without mobile viewport emulation).
 */
export const IPHONE: BrowserContextOptions = { ...iPhone, isMobile: false, viewport: { width: 390, height: 844 } }

/** Signed-in projects: each gets its own session (own device id) so their tokens never revoke each other. */
export const SIGNED_IN_PROJECTS = {
  desktop: DESKTOP,
  keyboard: DESKTOP,
  phone: PHONE,
  writes: DESKTOP,
  firefox: FIREFOX,
  webkit: WEBKIT,
  iphone: IPHONE,
} as const

export type SignedInProject = keyof typeof SIGNED_IN_PROJECTS

export const storageStatePath = (project: SignedInProject) => path.join(OUTPUT_DIR, 'auth', `${project}.json`)

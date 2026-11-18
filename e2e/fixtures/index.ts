// The suite's `test`: Playwright's, plus
//   app      helpers for the app's conventions (settle, landmarks, focus, preferences)        fixtures/app.ts
//   api      the throwaway Jellyfin as the test user; user data it snapshots is restored     fixtures/api.ts
//   guard    (automatic) fails the test on console errors / failed requests                  fixtures/guard.ts
// and, for every context: a stable per-worker device id (so the server's device list stays bounded), no CSS
// animations (same stylesheet as the screenshot crawler), and on the keyboard-only project a check that the
// test never used a pointer.
import { test as base, expect } from '@playwright/test'
import { matchCssViewport } from '../../tools/shots/capture.ts'
import { NO_ANIMATION_CSS } from '../../tools/shots/settle.ts'
import { JellyfinApi } from './api'
import { App } from './app'
import { e2eDeviceId } from './env'
import { PageGuard } from './guard'

export { expect }

/** Project options (set per project in playwright.config.ts). */
export interface SuiteOptions {
  /** The project must be driven with the keyboard only: any pointer event fails the test. */
  keyboardOnly: boolean
}

interface Fixtures {
  app: App
  api: JellyfinApi
  guard: PageGuard
  /** device id the app reports for a context that starts without one (signed-out tests) */
  deviceId: string
  _keyboardOnlyCheck: void
}

interface WorkerFixtures {
  workerApi: JellyfinApi
}

/** `test.use(SIGNED_OUT)`: start with empty storage (no saved server, no session). */
export const SIGNED_OUT = { storageState: { cookies: [], origins: [] } }

/** Tags. Every test names the projects it runs in; see e2e/README.md. */
export const TAG = {
  desktop: '@desktop',
  keyboard: '@keyboard',
  phone: '@phone',
  writes: '@writes',
  /** smoke subset that also runs in Firefox and WebKit at 1440x900 (projects firefox, webkit) */
  engines: '@engines',
  /** touch subset that also runs in WebKit with the iPhone profile (project iphone) */
  iphone: '@iphone',
} as const

export const test = base.extend<Fixtures & SuiteOptions, WorkerFixtures>({
  keyboardOnly: [false, { option: true }],

  // Playwright reads fixture dependencies from the destructuring pattern: `{}` = none.
  // oxlint-disable-next-line no-empty-pattern
  deviceId: async ({}, provide, info) => {
    await provide(e2eDeviceId(`${info.project.name}-w${info.parallelIndex}`))
  },

  context: async ({ context, deviceId }, provide) => {
    await context.addInitScript(
      ({ css, id }) => {
        try {
          if (!localStorage.getItem('wholphin.deviceId')) localStorage.setItem('wholphin.deviceId', id)
        } catch {
          // about:blank and opaque origins have no storage
        }
        const add = () => {
          const el = document.createElement('style')
          el.setAttribute('data-e2e', 'no-animation')
          el.textContent = css
          document.documentElement.appendChild(el)
        }
        if (document.documentElement) add()
        else document.addEventListener('DOMContentLoaded', add, { once: true })
      },
      { css: NO_ANIMATION_CSS, id: deviceId },
    )
    await provide(context)
  },

  // WebKit on a Windows host with display scaling lays out a smaller CSS viewport than requested
  // (tools/shots/capture.ts matchCssViewport): give the page the project's CSS size.
  page: async ({ page, browserName, viewport }, provide) => {
    if (browserName === 'webkit' && viewport) await matchCssViewport(page, viewport.width, viewport.height)
    await provide(page)
  },

  guard: [
    async ({ page }, provide, info) => {
      const guard = new PageGuard()
      guard.watch(page)
      await provide(guard)
      guard.dispose()
      for (const [line, reason] of guard.matched) info.annotations.push({ type: 'allowed', description: `${line} (${reason})` })
      // Report background failures only for tests that otherwise passed (a failing test already has its cause).
      if (info.status === info.expectedStatus) {
        expect(guard.issues, 'console errors / failed requests on the visited pages').toEqual([])
      }
    },
    { auto: true },
  ],

  _keyboardOnlyCheck: [
    async ({ page, keyboardOnly }, provide) => {
      if (!keyboardOnly) return provide()
      const events: string[] = []
      await page.exposeFunction('__e2ePointerEvent', (type: string) => events.push(type))
      await page.addInitScript(() => {
        const report = (e: Event) => {
          if (e.isTrusted) (window as unknown as { __e2ePointerEvent: (t: string) => void }).__e2ePointerEvent(e.type)
        }
        for (const type of ['pointerdown', 'pointermove', 'wheel', 'touchstart']) window.addEventListener(type, report, { capture: true, passive: true })
      })
      await provide()
      expect(events, 'keyboard-only project: the test used a pointer').toEqual([])
    },
    { auto: true },
  ],

  app: async ({ page }, provide, info) => {
    const app = new App(page, info)
    await provide(app)
    app.dispose()
  },

  workerApi: [
    // oxlint-disable-next-line no-empty-pattern
    async ({}, provide, info) => {
      const api = await JellyfinApi.signIn(e2eDeviceId(`api-w${info.parallelIndex}`))
      await provide(api)
      await api.dispose()
    },
    { scope: 'worker' },
  ],

  api: async ({ workerApi }, provide) => {
    try {
      await provide(workerApi)
    } finally {
      await workerApi.restoreAll()
    }
  },
})

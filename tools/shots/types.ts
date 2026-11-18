/// <reference lib="dom" />
import type { Page } from '@playwright/test'
import type { JfClient } from './jellyfin.ts'
import type { CrawlLang } from './uiText.ts'

export const THEMES = ['PURPLE', 'BLUE', 'GREEN', 'ORANGE', 'BOLD_BLUE', 'OLED_BLACK', 'RED', 'BROWN'] as const
export type ThemeName = (typeof THEMES)[number]

export interface ViewportDef {
  name: string
  width: number
  height: number
  touch: boolean
  /** mobile user agent */
  mobile: boolean
}

export const VIEWPORTS: readonly ViewportDef[] = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080, touch: false, mobile: false },
  { name: 'laptop-1280x720', width: 1280, height: 720, touch: false, mobile: false },
  { name: 'tablet-820x1180', width: 820, height: 1180, touch: true, mobile: false },
  { name: 'phone-390x844', width: 390, height: 844, touch: true, mobile: true },
]

/** Viewports that run only when named in --viewport (not part of the default set or of `all`). */
export const EXTRA_VIEWPORTS: readonly ViewportDef[] = [
  { name: 'wide-1440x900', width: 1440, height: 900, touch: false, mobile: false },
]

export const ENGINES = ['chromium', 'firefox', 'webkit'] as const
export type EngineName = (typeof ENGINES)[number]

/**
 * auth modes:
 *  - in:    signed in (default)
 *  - out:   empty browser profile, no servers saved (first launch)
 *  - saved: server and user remembered, but no access token and no "most recent" user (what the setup screens show)
 */
export type AuthMode = 'in' | 'out' | 'saved'

/** What a scene's prepare callback gets to work with. */
export interface SceneCtx {
  /** Jellyfin client for the session the crawler obtained, with cached lookups */
  jf: JfClient
  /** the app origin, e.g. http://localhost:5184 */
  origin: string
  viewport: ViewportDef
  /** interface language of the run (find controls by name with ./uiText.ts) */
  lang: CrawlLang
}

export interface Scene {
  /** unique, kebab-case: becomes the PNG file name */
  name: string
  /** grouping in the contact sheet; default = prefix before the first "-" */
  group?: string
  /**
   * App path (with query). A function resolves real ids at run time (once per run, before any picture is taken);
   * return null when the server has no suitable item and the scene is skipped.
   */
  path: string | ((jf: JfClient) => Promise<string | null> | string | null)
  /** default 'in' */
  auth?: AuthMode
  /** history.state.usr for the first load (for pages driven by navigation state, e.g. /grid) */
  state?: unknown
  /** interaction after the page settled (hover, click, open a dialog, scroll...). Settle runs again after it. */
  prepare?: (page: Page, ctx: SceneCtx) => Promise<void>
  /** selector (state visible) or callback awaited before the first settle check */
  waitFor?: string | ((page: Page) => Promise<void>)
  /** keep CSS animations and transitions running (default false: they are disabled for determinism) */
  animations?: boolean
  /** restrict to these servers (e.g. scenes that write to the server run on the throwaway one only) */
  servers?: ('real' | 'test')[]
  /** take a full-page picture instead of the viewport (default false) */
  fullPage?: boolean
  /** viewport names (prefix match) this scene is limited to */
  viewports?: string[]
  /** failed requests / console messages matching these are expected for this scene and not reported as errors */
  allow?: RegExp[]
  /** the page is expected to show an empty state or an error message (silences the empty-page warning) */
  allowEmpty?: boolean
  /** the page is expected to replace its URL with a path matching this (e.g. a Season item opens the series overview) */
  redirectsTo?: RegExp
  /** an extra settle delay in ms for scenes that keep painting after the network is idle */
  extraWaitMs?: number
  /**
   * App preferences merged into the profile for this scene (after the run's theme), e.g. `{ webInterfaceScale: 160 }`
   * or `{ themeColors: 'BLUE' }`. The TV-canvas scenes of ./tvScenes.ts use it.
   */
  prefs?: Record<string, unknown>
  /**
   * The frozen wall clock for this scene (ISO string), instead of today 20:00 local. A function resolves it from
   * the server (Live TV: a moment inside the guide data).
   */
  clock?: string | ((jf: JfClient) => Promise<string | null> | string | null)
  /** only crawled in compare mode or when named in --scene: the reference-picture states (./tvScenes.ts) */
  compareOnly?: boolean
}

export type Severity = 'error' | 'warn'
export interface Issue {
  kind:
    | 'console-error'
    | 'console-warning'
    | 'pageerror'
    | 'request-failed'
    | 'http-error'
    | 'route-stub'
    | 'overflow'
    | 'broken-image'
    | 'zero-size-image'
    | 'settle-timeout'
    | 'navigation'
    | 'prepare-failed'
    | 'empty-page'
  severity: Severity
  message: string
}

export interface ShotEntry {
  scene: string
  group: string
  viewport: string
  theme: string
  /** path relative to the run folder, forward slashes; null when no picture was taken */
  file: string | null
  /** app URL actually requested */
  url: string | null
  status: 'ok' | 'warn' | 'error' | 'skipped'
  skipReason?: string
  ms: number
  issues: Issue[]
  /** document.scrollWidth vs clientWidth when it overflowed */
  overflow?: { scrollWidth: number; clientWidth: number }
  /** api requests count seen */
  requests: number
}

export interface RunReport {
  run: string
  startedAt: string
  finishedAt: string
  server: 'real' | 'test'
  origin: string
  rtl: boolean
  /** browser engine of the run (absent in older reports: chromium) */
  engine?: EngineName
  args: string[]
  totals: { shots: number; ok: number; warn: number; error: number; skipped: number }
  entries: ShotEntry[]
}

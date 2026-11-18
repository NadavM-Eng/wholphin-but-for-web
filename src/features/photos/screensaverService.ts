// Port of W/services/ScreensaverService.kt (in-app part): the idle timer that shows the screensaver and the dim
// layer after `startDelay`, `pulse()` on every input, `keepScreenOn()` for pages that must not be interrupted.
import { create } from 'zustand'
import { getPrefs, usePrefsStore } from '../../stores/preferences'
import { holdScreenOn } from './screenWakeLock'

export interface ScreensaverState {
  enabled: boolean
  enabledTemp: boolean
  active: boolean
  paused: boolean
  dimEnabled: boolean
  dimActive: boolean
}

export const useScreensaverStore = create<ScreensaverState>()(() => ({
  enabled: false,
  enabledTemp: false,
  active: false,
  paused: false,
  dimEnabled: false,
  dimActive: false,
}))

/** `ScreensaverState.show`. */
export const screensaverShown = (s: ScreensaverState) => (s.enabled || s.enabledTemp) && s.active && !s.paused
/** `ScreensaverState.showDim`. */
export const dimShown = (s: ScreensaverState) => s.dimEnabled && s.dimActive && !s.paused

let waitTimer: ReturnType<typeof setTimeout> | null = null
let dimTimer: ReturnType<typeof setTimeout> | null = null
/** Names of the pages currently keeping the screen on (keepScreenOn(true)). */
const keepers = new Set<string>()

const set = (patch: Partial<ScreensaverState>) => useScreensaverStore.setState(patch)
const get = () => useScreensaverStore.getState()
const startDelay = () => getPrefs().screensaverStartDelay

/** Players whose media element is not in the document (the music service's detached Audio objects). */
const mediaProbes = new Set<() => boolean>()

/** Registers a "is it playing" check for media outside the document; returns the unregister function. */
export function addMediaPlayingProbe(probe: () => boolean): () => void {
  mediaProbes.add(probe)
  return () => mediaProbes.delete(probe)
}

/**
 * Web: whether a <video> or <audio> in the page (or a registered detached player) is playing. Upstream pages call keepScreenOn(isPlaying); the web
 * player and music do not know this service, so the timer also checks the page's media elements.
 */
export function mediaPlaying(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  for (const probe of mediaProbes) if (probe()) return true
  if (!doc) return false
  for (const m of doc.querySelectorAll<HTMLMediaElement>('video, audio')) {
    if (!m.paused && !m.ended && m.readyState > 2) return true
  }
  return false
}

/** `pulse()`: reset the timers before showing the in-app screensaver / the dim layer. */
export function pulse() {
  if (waitTimer) clearTimeout(waitTimer)
  waitTimer = null
  if (get().enabled) {
    if (!get().active) set({ active: false, dimActive: false })
    if (!get().paused) {
      waitTimer = setTimeout(() => {
        waitTimer = null
        if (mediaPlaying()) {
          pulse()
          return
        }
        set({ active: true, dimActive: get().dimEnabled })
      }, startDelay())
    }
  }
  if (dimTimer) clearTimeout(dimTimer)
  dimTimer = null
  if (get().dimEnabled) {
    set({ dimActive: false })
    if (!get().paused) {
      dimTimer = setTimeout(() => {
        dimTimer = null
        if (mediaPlaying()) return
        set({ dimActive: !get().paused })
      }, startDelay())
    }
  }
}

/** `start()`: show it now, even when the screensaver is not enabled ("Start screensaver" in settings). */
export function start() {
  set({ enabledTemp: true, active: true, dimActive: true })
}

/** `stop(cancelJob)`. */
export function stop(cancelJob: boolean) {
  set({ enabledTemp: false, active: false, dimActive: false })
  if (cancelJob) {
    if (waitTimer) clearTimeout(waitTimer)
    if (dimTimer) clearTimeout(dimTimer)
    waitTimer = null
    dimTimer = null
  }
}

/**
 * `keepScreenOn(keep)`: a page that must not be interrupted (the running slideshow). With the in-app screensaver
 * or dimming enabled it pauses them; without the in-app screensaver it holds the screen on (Wake Lock).
 * `holder` names the caller so two pages do not release each other's request.
 */
export function keepScreenOn(keep: boolean, holder = 'page') {
  if (keep) keepers.add(holder)
  else keepers.delete(holder)
  const any = keepers.size > 0
  const { enabled, dimEnabled } = get()
  if (enabled || dimEnabled) {
    set({ active: false, dimActive: false, paused: any })
    if (!any) pulse()
  }
  // upstream asks the OS only when the in-app screensaver is off; while it is on the screen is held anyway
  holdScreenOn('keepScreenOn', any)
}

/** Applies the screensaver preferences (the `userPreferencesService.flow` collector in the constructor). */
function applyPrefs() {
  const p = getPrefs()
  const enabled = p.screensaverEnabled
  // keepScreenOnInternal(enabled): with the in-app screensaver on, the device screen stays on so it can run
  holdScreenOn('screensaver', enabled)
  set({ enabled, enabledTemp: false, active: false, paused: keepers.size > 0, dimEnabled: p.screensaverDimToggle, dimActive: false })
}

let installed = 0
let unsubscribe: (() => void) | null = null

/** Starts following the preferences; returns the stop function. Reference counted (StrictMode mounts twice). */
export function installScreensaverService(): () => void {
  installed++
  if (installed === 1) {
    applyPrefs()
    let last = JSON.stringify(watched())
    unsubscribe = usePrefsStore.subscribe(() => {
      const next = JSON.stringify(watched())
      if (next === last) return
      last = next
      applyPrefs()
      pulse()
    })
    pulse()
  }
  return () => {
    installed--
    if (installed > 0) return
    unsubscribe?.()
    unsubscribe = null
    stop(true)
    holdScreenOn('screensaver', false)
  }
}

function watched() {
  const p = getPrefs()
  return [p.screensaverEnabled, p.screensaverDimToggle, p.screensaverStartDelay]
}

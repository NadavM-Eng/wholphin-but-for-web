import { useSyncExternalStore } from 'react'

/**
 * Window event fired by "Start screensaver" (ScreensaverService.start(): show it now, even when the
 * screensaver is not enabled).
 */
export const SCREENSAVER_START_EVENT = 'wholphin:screensaver-start'

const handlers = new Set<() => void>()
const listeners = new Set<() => void>()

/**
 * The screensaver registers here while it is mounted. The "Start screensaver" row is shown only while a
 * handler exists, so it is never a dead control. Returns the unregister function.
 */
export function onScreensaverStart(handler: () => void): () => void {
  handlers.add(handler)
  listeners.forEach((l) => l())
  return () => {
    handlers.delete(handler)
    listeners.forEach((l) => l())
  }
}

export function screensaverAvailable(): boolean {
  return handlers.size > 0
}

export function useScreensaverAvailable(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    screensaverAvailable,
    screensaverAvailable,
  )
}

export function startScreensaver() {
  handlers.forEach((h) => h())
  window.dispatchEvent(new CustomEvent(SCREENSAVER_START_EVENT))
}

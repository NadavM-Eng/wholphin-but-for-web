// Screen Wake Lock for the slideshow and the in-app screensaver (upstream ScreensaverService.keepScreenOn ->
// FLAG_KEEP_SCREEN_ON). Holders are named, so the slideshow releasing its lock does not drop the screensaver's.
// Re-acquired when the tab becomes visible again (the browser releases it on hide).

const holders = new Set<string>()
let sentinel: WakeLockSentinel | null = null
let pending = false
let bound = false

async function acquire() {
  if (holders.size === 0 || sentinel || pending) return
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return
  pending = true
  try {
    const s = await navigator.wakeLock.request('screen')
    s.addEventListener('release', () => {
      if (sentinel === s) sentinel = null
    })
    sentinel = s
    if (holders.size === 0) release()
  } catch {
    sentinel = null
  } finally {
    pending = false
  }
}

function release() {
  const s = sentinel
  sentinel = null
  if (s && !s.released) void s.release().catch(() => undefined)
}

export function holdScreenOn(holder: string, on: boolean) {
  if (!bound && typeof document !== 'undefined') {
    bound = true
    document.addEventListener('visibilitychange', () => void acquire())
  }
  if (on) holders.add(holder)
  else holders.delete(holder)
  if (holders.size > 0) void acquire()
  else release()
}

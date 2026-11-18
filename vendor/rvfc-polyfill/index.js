// requestVideoFrameCallback / cancelVideoFrameCallback for browsers without them
// (WICG "HTMLVideoElement.requestVideoFrameCallback()" specification). Written for Wholphin Web; it replaces
// the GPL-3.0 package of the same name that jassub imports for its side effect. Every current browser has the
// native API, so this only installs a fallback: a requestAnimationFrame loop that reports a "presented frame"
// whenever the video's current time has moved (or once, for a paused video that has data).
const proto = typeof HTMLVideoElement === 'undefined' ? null : HTMLVideoElement.prototype

if (proto && typeof proto.requestVideoFrameCallback !== 'function') {
  const state = new WeakMap()
  let nextHandle = 0

  const stateOf = (video) => {
    let s = state.get(video)
    if (!s) {
      s = { callbacks: new Map(), raf: 0, lastTime: -1, presented: 0 }
      state.set(video, s)
    }
    return s
  }

  const tick = (video, s, now) => {
    s.raf = 0
    if (s.callbacks.size === 0) return
    const time = video.currentTime
    const changed = time !== s.lastTime
    if (video.readyState >= 2 && (changed || video.paused)) {
      s.lastTime = time
      s.presented += 1
      const metadata = {
        presentationTime: now,
        expectedDisplayTime: now,
        width: video.videoWidth,
        height: video.videoHeight,
        mediaTime: time,
        presentedFrames: s.presented,
        processingDuration: 0,
      }
      // callbacks registered while running these belong to the next frame (spec: take the list first)
      const due = [...s.callbacks]
      s.callbacks.clear()
      for (const [, cb] of due) {
        try {
          cb(now, metadata)
        } catch (e) {
          setTimeout(() => {
            throw e
          })
        }
      }
    }
    if (s.callbacks.size > 0) s.raf = requestAnimationFrame((t) => tick(video, s, t))
  }

  proto.requestVideoFrameCallback = function requestVideoFrameCallback(callback) {
    if (typeof callback !== 'function') throw new TypeError('requestVideoFrameCallback: callback must be a function')
    const s = stateOf(this)
    const handle = ++nextHandle
    s.callbacks.set(handle, callback)
    if (!s.raf) s.raf = requestAnimationFrame((t) => tick(this, s, t))
    return handle
  }

  proto.cancelVideoFrameCallback = function cancelVideoFrameCallback(handle) {
    const s = state.get(this)
    if (!s) return
    s.callbacks.delete(handle)
    if (s.callbacks.size === 0 && s.raf) {
      cancelAnimationFrame(s.raf)
      s.raf = 0
    }
  }
}

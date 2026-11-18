// Fullscreen and picture-in-picture for the player (web additions, spec 05 §B4).
import { useCallback, useEffect, useState } from 'react'
import { getPlaybackEngine, usePlaybackStore } from '../engine'

interface WebkitVideo extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void
  webkitSupportsFullscreen?: boolean
}

type LockableOrientation = ScreenOrientation & {
  lock?: (o: 'landscape') => Promise<void>
  unlock?: () => void
}

export interface ScreenMode {
  supported: boolean
  active: boolean
  toggle: () => void
}

const isTouch = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

/**
 * Fullscreen of the whole document (not the <video>), so the controls, subtitles, dialogs and toasts stay visible.
 * On touch devices a landscape video also locks the orientation to landscape while fullscreen. iPhone Safari has
 * no element fullscreen: there the native video fullscreen is used (without our overlay).
 */
export function useFullscreen(): ScreenMode {
  const [active, setActive] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const on = () => setActive(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const video = getPlaybackEngine().video as WebkitVideo
  const elementFs = typeof document !== 'undefined' && !!document.fullscreenEnabled
  const supported = elementFs || typeof video.webkitEnterFullscreen === 'function'

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      try {
        ;(screen.orientation as LockableOrientation | undefined)?.unlock?.()
      } catch {
        // not locked
      }
      void document.exitFullscreen().catch(() => undefined)
      return
    }
    if (!document.fullscreenEnabled) {
      video.webkitEnterFullscreen?.()
      return
    }
    void document.documentElement
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() => {
        const { videoWidth: w, videoHeight: h } = usePlaybackStore.getState()
        const o = screen.orientation as LockableOrientation | undefined
        if (isTouch() && w >= h && o?.lock) void o.lock('landscape').catch(() => undefined)
      })
      .catch(() => undefined)
  }, [video])

  // leaving the player leaves fullscreen
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    },
    [],
  )
  return { supported, active, toggle }
}

/** Picture-in-picture of the <video> (our subtitles and controls are not part of the PiP window). */
export function usePictureInPicture(): ScreenMode {
  const video = getPlaybackEngine().video
  const [active, setActive] = useState(() => typeof document !== 'undefined' && document.pictureInPictureElement === video)
  useEffect(() => {
    const on = () => setActive(document.pictureInPictureElement === video)
    video.addEventListener('enterpictureinpicture', on)
    video.addEventListener('leavepictureinpicture', on)
    return () => {
      video.removeEventListener('enterpictureinpicture', on)
      video.removeEventListener('leavepictureinpicture', on)
      if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => undefined)
    }
  }, [video])
  const supported = typeof document !== 'undefined' && !!document.pictureInPictureEnabled && !video.disablePictureInPicture
  const toggle = useCallback(() => {
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined)
    else void video.requestPictureInPicture().catch(() => undefined)
  }, [video])
  return { supported, active, toggle }
}

const VOLUME_KEY = 'wholphin.player.volume.v1'

/** Remembers volume and mute per browser (a per-viewer convenience; the TV has hardware volume). */
export function usePersistentVolume() {
  useEffect(() => {
    const engine = getPlaybackEngine()
    try {
      const raw = localStorage.getItem(VOLUME_KEY)
      if (raw) {
        const v = JSON.parse(raw) as { volume?: number; muted?: boolean }
        if (typeof v.volume === 'number') engine.setVolume(v.volume)
        if (typeof v.muted === 'boolean') engine.setMuted(v.muted)
      }
    } catch {
      // storage unavailable
    }
    return usePlaybackStore.subscribe((s, prev) => {
      if (s.volume === prev.volume && s.muted === prev.muted) return
      try {
        localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume: s.volume, muted: s.muted }))
      } catch {
        // storage unavailable
      }
    })
  }, [])
}

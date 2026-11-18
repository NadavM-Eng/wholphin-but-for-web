// W/services/ThemeSongPlayer.kt: a random theme song of the item at the preference's volume, stopped when
// the page goes away (which also covers starting playback: the detail page unmounts). It is the app's only theme
// player: the music service stops it when the queue starts, and it does not start while music plays.
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useEffect } from 'react'
import { getSession, getDeviceId } from '../../../api/session'
import { useMusicQueue } from '../../../stores/musicQueue'
import { usePrefs } from '../../../stores/preferences'

export type ThemeSongVolume = 'DISABLED' | 'LOWEST' | 'LOW' | 'MEDIUM' | 'HIGH' | 'HIGHEST'

/**
 * Volume per level. Upstream codes HIGHEST as `75f`, which the player clamps to 1.0
 * (W/services/ThemeSongPlayer.kt); fixed to 0.75 as the preference description intends.
 */
export const THEME_VOLUME: Record<ThemeSongVolume, number | null> = {
  DISABLED: null,
  LOWEST: 0.05,
  LOW: 0.1,
  MEDIUM: 0.25,
  HIGH: 0.5,
  HIGHEST: 0.75,
}

let audio: HTMLAudioElement | null = null
let generation = 0
let pendingGesture: (() => void) | null = null

function clearGestureRetry() {
  if (!pendingGesture) return
  window.removeEventListener('pointerdown', pendingGesture, true)
  window.removeEventListener('keydown', pendingGesture, true)
  pendingGesture = null
}

/** Stops the theme song (ThemeSongPlayer.stop). */
export function stopThemeSong() {
  generation++
  clearGestureRetry()
  if (audio) {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
}

/** `playThemeFor(itemId)`: fetches the theme songs, picks one at random and plays it. */
export async function playThemeSongFor(itemId: string, volume: number) {
  stopThemeSong()
  const gen = generation
  const s = getSession()
  if (!s) return
  let songs
  try {
    songs = (await getLibraryApi(s.api).getThemeSongs({ itemId, userId: s.user.id })).data.Items ?? []
  } catch {
    return
  }
  // web: never over the music queue (upstream's MusicService and ThemeSongPlayer share audio focus)
  if (gen !== generation || songs.length === 0 || useMusicQueue.getState().status !== 'idle') return
  const song = songs[Math.floor(Math.random() * songs.length)]
  if (!song?.Id) return
  const q = new URLSearchParams({
    container: 'opus,mp3,aac,flac',
    userId: s.user.id,
    deviceId: getDeviceId(),
    api_key: s.api.accessToken,
  })
  audio ??= new Audio()
  audio.volume = volume
  audio.loop = false
  audio.src = `${s.api.basePath}/Audio/${encodeURIComponent(song.Id)}/universal?${q.toString()}`
  const el = audio
  // Browsers refuse audible autoplay before the first user gesture: try once more on the next one, quietly.
  const retryOnGesture = () => {
    if (gen !== generation || pendingGesture) return
    pendingGesture = () => {
      clearGestureRetry()
      start()
    }
    window.addEventListener('pointerdown', pendingGesture, true)
    window.addEventListener('keydown', pendingGesture, true)
  }
  const start = () => {
    if (gen !== generation) return
    // Where supported (Firefox), the browser says up front that autoplay is refused; asking first avoids
    // Firefox's console warning for every refused play().
    const policy = (navigator as Navigator & { getAutoplayPolicy?: (type: 'mediaelement') => string }).getAutoplayPolicy?.('mediaelement')
    if (policy === 'disallowed') {
      retryOnGesture()
      return
    }
    el.play().catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'NotAllowedError') retryOnGesture()
    })
  }
  start()
}

/** Plays the theme song of `itemId` while the calling page is mounted (null = none). */
export function useThemeSong(itemId: string | null | undefined) {
  const level = usePrefs('playThemeMusic') as ThemeSongVolume
  const volume = THEME_VOLUME[level] ?? null
  useEffect(() => {
    if (!itemId || volume == null) return
    void playThemeSongFor(itemId, volume)
    return () => stopThemeSong()
  }, [itemId, volume])
}

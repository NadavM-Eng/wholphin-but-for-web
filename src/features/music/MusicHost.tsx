import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { setNowPlaying } from '../../app/shell/shellFlags'
import { useSessionStore } from '../../stores/session'
import { useMusicQueue } from '../../stores/musicQueue'
import { setItemMenuHandlers } from '../common/itemMenuHandlers'
import { MiniPlayer } from './MiniPlayer'
import { addToQueue, pause, playItem, stop } from './service/musicService'
import { stopThemeSong } from './service/themeSongs'

/** NavDrawerService.kt: a paused queue keeps the drawer entry for 2 hours. */
export const NOW_PLAYING_PAUSED_MS = 2 * 60 * 60_000

/** Routes of the video player (PlaybackViewModel.init stops the music service). */
const VIDEO_ROUTE = /^\/play\//

/**
 * App-wide music wiring, mounted once for signed-in routes: drives the drawer's "Now playing" entry
 * (NavDrawerService.kt:88-121), stops the music when a video starts or the user changes (NavDrawer.kt:204),
 * pauses it while another unmuted video plays (audio focus),
 * installs the item menu's "Add to queue" and audio-playlist Play / Shuffle and renders the web mini player.
 */
export function MusicHost() {
  const location = useLocation()
  const userKey = useSessionStore((s) => (s.current ? `${s.current.server.id}:${s.current.user.id}` : null))

  useEffect(
    () =>
      setItemMenuHandlers({
        addToQueue: (item) => void addToQueue(item),
        playMusic: (item, opts) => void playItem(item, opts),
      }),
    [],
  )

  // Drawer entry: PLAYING -> shown with the title; IDLE -> hidden; PAUSED -> unchanged for 2 h, then hidden.
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null
    const apply = () => {
      const s = useMusicQueue.getState()
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = null
      if (s.status === 'playing') {
        setNowPlaying(true, s.entries[s.currentIndex]?.title ?? null)
      } else if (s.status === 'idle') {
        setNowPlaying(false)
      } else {
        const left = NOW_PLAYING_PAUSED_MS - (Date.now() - (s.pausedAt ?? Date.now()))
        if (left <= 0) setNowPlaying(false)
        else hideTimer = setTimeout(() => setNowPlaying(false), left)
      }
    }
    apply()
    const unsub = useMusicQueue.subscribe((s, prev) => {
      if (s.status !== prev.status || s.currentIndex !== prev.currentIndex || s.pausedAt !== prev.pausedAt || s.entries !== prev.entries) apply()
    })
    return () => {
      unsub()
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [])

  // Any video playback stops the music (and theme songs) first.
  const videoRoute = VIDEO_ROUTE.test(location.pathname)
  useEffect(() => {
    if (!videoRoute) return
    if (useMusicQueue.getState().status !== 'idle') stop()
    stopThemeSong()
  }, [videoRoute])

  // Audio focus: other video players (the slideshow's clips) take focus with handleAudioFocus = true
  // (PlayerFactory.createVideoPlayer), so the music pauses when an unmuted <video> in the page starts playing.
  useEffect(() => {
    const onPlay = (e: Event) => {
      const v = e.target
      if (!(v instanceof HTMLVideoElement) || v.muted || v.volume === 0) return
      if (useMusicQueue.getState().status === 'playing') pause()
      stopThemeSong()
    }
    document.addEventListener('play', onPlay, true)
    return () => document.removeEventListener('play', onPlay, true)
  }, [])

  // User or server switch stops the music.
  useEffect(
    () => () => {
      if (useMusicQueue.getState().status !== 'idle') stop()
    },
    [userKey],
  )

  return <MiniPlayer />
}

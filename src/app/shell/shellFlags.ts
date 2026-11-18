// Feature switches the nav drawer reads but other features own. Defaults are off; later waves drive them.
import { create } from 'zustand'

interface ShellFlags {
  /** Seerr is configured and signed in (upstream SeerrServerRepository.active): shows "Discover". */
  discoverEnabled: boolean
  /** A music queue exists (MusicService PLAYING, or PAUSED for < 2 h): shows "Now playing". */
  nowPlayingEnabled: boolean
  /** Title of the current track, shown as the "Now playing" subtext. */
  nowPlayingTitle: string | null
  /** Number of mounted AppShells: 0 on the full-screen routes (player, settings, Now Playing, slideshow...). */
  shellMounted: number
}

export const useShellFlags = create<ShellFlags>()(() => ({
  discoverEnabled: false,
  nowPlayingEnabled: false,
  nowPlayingTitle: null,
  shellMounted: 0,
}))

/** AppShell mount marker: UI that only belongs beside the drawer (the mini player) reads `shellMounted > 0`. */
export function markShellMounted(): () => void {
  useShellFlags.setState((s) => ({ shellMounted: s.shellMounted + 1 }))
  return () => useShellFlags.setState((s) => ({ shellMounted: s.shellMounted - 1 }))
}

export function setDiscoverEnabled(enabled: boolean) {
  useShellFlags.setState({ discoverEnabled: enabled })
}

/** `nowPlayingEnabled/nowPlayingTitle` of NavDrawerService. Pass `false` to hide the entry. */
export function setNowPlaying(enabled: boolean, title: string | null = null) {
  useShellFlags.setState({ nowPlayingEnabled: enabled, nowPlayingTitle: enabled ? title : null })
}

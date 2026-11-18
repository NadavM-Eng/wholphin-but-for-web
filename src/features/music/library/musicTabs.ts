// Tabs of the music library page (CollectionFolderMusic.kt).
export const MUSIC_TABS = ['recommended', 'albums', 'artists', 'genres', 'songs'] as const
export type MusicTab = (typeof MUSIC_TABS)[number]

export const MUSIC_TAB_LABEL: Record<MusicTab, string> = {
  recommended: 'recommended',
  albums: 'albums',
  artists: 'artists',
  genres: 'genres',
  songs: 'songs',
}

/** `?tab=` accepts the tab key or its index (upstream TabbedPage remembers the index). */
export function parseMusicTab(value: string | null): MusicTab {
  if (!value) return 'recommended'
  const n = Number(value)
  if (Number.isInteger(n) && n >= 0 && n < MUSIC_TABS.length) return MUSIC_TABS[n]
  return (MUSIC_TABS as readonly string[]).includes(value) ? (value as MusicTab) : 'recommended'
}

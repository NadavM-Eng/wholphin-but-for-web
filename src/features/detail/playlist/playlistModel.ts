// Pure rules of the playlist page (W/ui/detail/PlaylistDetails.kt).
import type { BaseItemDto, MediaType } from '@jellyfin/sdk/lib/generated-client/models'

export type PlayMediaType = 'Video' | 'Audio' | 'Unknown'

/** `determineMediaType` (PlaylistDetails.kt:195-238): the server's type, else (<= 50 items) one shared kind. */
export function playlistMediaType(server: MediaType | null | undefined, total: number | null, items: readonly BaseItemDto[]): PlayMediaType {
  if (server === 'Video' || server === 'Audio') return server
  if (total == null || total > 50) return 'Unknown'
  const kinds = new Set(
    items.slice(0, 50).map((i) => (i.Type === 'Audio' ? 'Audio' : i.Type === 'Video' || i.Type === 'Episode' || i.Type === 'Movie' || i.Type === 'BoxSet' ? 'Video' : 'Unknown')),
  )
  return kinds.size === 1 ? ([...kinds][0] as PlayMediaType) : 'Unknown'
}

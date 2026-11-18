// Pure helpers of the music pages.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'

/**
 * `isVariousArtists` (AlbumDetailsPage.kt): any artist / album artist named "various artists", or more than
 * one entry in `artists`. Song rows then show their artist line.
 */
export function isVariousArtists(album: Pick<BaseItemDto, 'Artists' | 'AlbumArtists' | 'AlbumArtist'>): boolean {
  const names = [...(album.Artists ?? []), ...(album.AlbumArtists ?? []).map((a) => a.Name ?? ''), album.AlbumArtist ?? '']
  if (names.some((n) => n.toLowerCase() === 'various artists')) return true
  return (album.Artists?.length ?? 0) > 1
}

export type DiscGroup = { disc: number | null; items: { item: BaseItemDto; index: number }[] }

/**
 * Songs grouped by disc (`ParentIndexNumber`), keeping list order and each song's index in the full list. The
 * album request already sorts by disc then track. Web addition: upstream draws one flat list.
 */
export function discGroups(songs: readonly BaseItemDto[]): DiscGroup[] {
  const out: DiscGroup[] = []
  songs.forEach((item, index) => {
    const disc = item.ParentIndexNumber ?? null
    const last = out[out.length - 1]
    if (last && last.disc === disc) last.items.push({ item, index })
    else out.push({ disc, items: [{ item, index }] })
  })
  return out
}

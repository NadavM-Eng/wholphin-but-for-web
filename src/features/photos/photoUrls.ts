// Media URLs of the viewer and the screensaver.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { buildItemImageUrl, IMAGE_QUALITY } from '../../api/images'
import { directStreamUrl, withApiKey } from '../../api/playback/urls'

const trim = (base: string) => base.replace(/\/+$/, '')

/**
 * The photo resized by the server to fit an `edge` x `edge` box (web default; upstream always downloads the
 * original). The Primary image of a Photo item is the photo itself; the tag keeps it cacheable.
 */
export function resizedPhotoUrl(base: string, item: BaseItemDto, edge: number): string | null {
  if (!item.Id) return null
  return buildItemImageUrl(base, item.Id, 'Primary', {
    maxWidth: edge,
    maxHeight: edge,
    quality: IMAGE_QUALITY,
    tag: item.ImageTags?.Primary ?? null,
  })
}

/** `libraryApi.getDownloadUrl(id)`: `/Items/{id}/Download` with the access token. */
export function originalPhotoUrl(base: string, itemId: string, token: string | null | undefined): string {
  return withApiKey(`${trim(base)}/Items/${encodeURIComponent(itemId)}/Download`, token)
}

/** `videoApi.getVideoStreamUrl(itemId)` (direct, no transcoding; upstream: "assumes direct play"). */
export function slideshowVideoUrl(base: string, item: BaseItemDto, token: string | null | undefined): string {
  return directStreamUrl(base, { itemId: item.Id ?? '', mediaSourceId: item.MediaSources?.[0]?.Id ?? null }, token)
}

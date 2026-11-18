// `AudioItem.from(item, imageUrl)` (W/data/model/AudioItem.kt) and the item rules the queue applies.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { buildItemImageUrl } from '../../../api/images'
import { ticksToMs } from '../../../lib/format'
import type { AudioItem } from '../../../stores/musicQueue'

let seq = 0
/** Unique per queue entry (the same song may be queued twice). */
export function newEntryKey(): string {
  seq += 1
  return `q${Date.now().toString(36)}${seq.toString(36)}`
}

/** Album art requested at this width (device px); Now Playing draws it at 240dp. */
const ART_WIDTH = 640

export function toAudioItem(item: BaseItemDto, baseUrl: string | null): AudioItem {
  const source = item.MediaSources?.[0]
  const stream = source?.MediaStreams?.find((s) => s.Type === 'Audio')
  const albumId = item.AlbumId ?? null
  return {
    key: newEntryKey(),
    id: item.Id ?? '',
    albumId,
    artistId: item.ArtistItems?.[0]?.Id ?? null,
    artistIds: (item.ArtistItems ?? []).map((a) => a.Id ?? '').filter(Boolean),
    title: item.Name ?? null,
    albumTitle: item.Album ?? null,
    artistNames: item.Artists?.length ? item.Artists.join(', ') : null,
    runtimeMs: item.RunTimeTicks ? ticksToMs(item.RunTimeTicks) : null,
    imageUrl:
      albumId && item.AlbumPrimaryImageTag
        ? buildItemImageUrl(baseUrl, albumId, 'Primary', { tag: item.AlbumPrimaryImageTag, fillWidth: ART_WIDTH, fillHeight: ART_WIDTH })
        : item.ImageTags?.Primary && item.Id
          ? buildItemImageUrl(baseUrl, item.Id, 'Primary', { tag: item.ImageTags.Primary, fillWidth: ART_WIDTH, fillHeight: ART_WIDTH })
          : null,
    hasLyrics: item.HasLyrics ?? false,
    container: source?.Container ?? item.Container ?? null,
    codec: stream?.Codec ?? null,
  }
}

/** `setQueue`/`addToQueue` keep only AUDIO items (others are logged and ignored upstream). */
export function audioOnly(items: readonly (BaseItemDto | null | undefined)[]): BaseItemDto[] {
  return items.filter((i): i is BaseItemDto => i?.Type === 'Audio' && !!i.Id)
}

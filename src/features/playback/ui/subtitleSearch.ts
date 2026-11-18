// Remote subtitle search and download (W/ui/playback/SubtitleSearchUtils.kt, spec 05 §4.5, 08 PB-4).
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, MediaSourceInfo, RemoteSubtitleInfo } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getSubtitleApi } from '@jellyfin/sdk/lib/utils/api/subtitle-api'

/** Sorted by hash match, then community rating, then download count, all descending. */
export function sortRemoteSubtitles(list: readonly RemoteSubtitleInfo[]): RemoteSubtitleInfo[] {
  const n = (v: number | null | undefined) => v ?? -Infinity
  return [...list].sort(
    (a, b) =>
      Number(!!b.IsHashMatch) - Number(!!a.IsHashMatch) ||
      n(b.CommunityRating) - n(a.CommunityRating) ||
      n(b.DownloadCount) - n(a.DownloadCount),
  )
}

/** `GET /Items/{itemId}/RemoteSearch/Subtitles/{language}`. */
export async function searchRemoteSubtitles(api: Api, itemId: string, language: string, signal?: AbortSignal): Promise<RemoteSubtitleInfo[]> {
  const res = await getSubtitleApi(api).searchRemoteSubtitles({ itemId, language }, { signal })
  return sortRemoteSubtitles(res.data ?? [])
}

export type DownloadResult =
  | { kind: 'switched'; item: BaseItemDto; subtitleIndex: number; audioIndex: number | null }
  /** the server had not added the stream after 4 polls */
  | { kind: 'too-long' }
  /** the refreshed item no longer has the playing media source */
  | { kind: 'source-gone' }
  /** the count changed but no new external stream could be identified */
  | { kind: 'not-found' }

export interface DownloadParams {
  api: Api
  userId: string
  itemId: string
  /** the playing media source; the download goes to it when known (upstream uses sourceId ?: itemId) */
  source: MediaSourceInfo
  subtitleId: string
  /** the active audio index, shifted when the new subtitle is inserted before it */
  audioIndex: number | null
  pollDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

const norm = (id: string | null | undefined) => id?.replace(/-/g, '').toLowerCase() ?? null

/**
 * `downloadAndSwitchSubtitles`: POST the download, then poll the item (at most 4 times, 1.5 s apart) until its
 * subtitle count changes, and identify the new external stream. Upstream checks `maxAttempts == 0` after the loop,
 * so a stream that appears on the 4th poll is reported as "too long" and not switched to; fixed here by checking
 * whether the count changed (spec 08 PB-4).
 */
export async function downloadAndFindSubtitle(p: DownloadParams): Promise<DownloadResult> {
  const sleep = p.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  await getSubtitleApi(p.api).downloadRemoteSubtitles({ itemId: p.source.Id ?? p.itemId, subtitleId: p.subtitleId })
  const before = (p.source.MediaStreams ?? []).filter((s) => s.Type === 'Subtitle')
  const oldPaths = new Set(before.map((s) => s.Path))
  let attempts = 4
  let count = before.length
  let item: BaseItemDto | null = null
  let source: MediaSourceInfo | null = null
  while (attempts > 0 && count === before.length) {
    attempts--
    await sleep(p.pollDelayMs ?? 1500)
    item = (await getLibraryApi(p.api).getItem({ itemId: p.itemId, userId: p.userId })).data
    source = item.MediaSources?.find((s) => norm(s.Id) === norm(p.source.Id)) ?? null
    if (!source) return { kind: 'source-gone' }
    count = (source.MediaStreams ?? []).filter((s) => s.Type === 'Subtitle').length
  }
  if (count === before.length || !item || !source) return { kind: 'too-long' }
  const added = (source.MediaStreams ?? []).find((s) => s.Type === 'Subtitle' && s.IsExternal && !oldPaths.has(s.Path))
  if (added?.Index == null) return { kind: 'not-found' }
  let audioIndex = p.audioIndex
  // server indexes after the inserted external stream shift by one
  if (audioIndex != null && audioIndex >= 0 && audioIndex >= added.Index) audioIndex += 1
  return { kind: 'switched', item, subtitleIndex: added.Index, audioIndex }
}

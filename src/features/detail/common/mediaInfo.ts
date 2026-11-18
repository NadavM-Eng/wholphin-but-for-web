import type { BaseItemDto, MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models'

/** Upstream `ItemDetailsDialogInfo`: what the dialog shows. */
export type MediaInfo = {
  title: string
  overview?: string | null
  genres: string[]
  files: MediaSourceInfo[]
  studios?: string[]
  lastPlayed?: string | null
}

export function mediaInfoOf(item: BaseItemDto): MediaInfo {
  return {
    title: item.Name ?? '',
    overview: item.Overview,
    genres: item.Genres ?? [],
    files: item.MediaSources ?? [],
    studios: (item.Studios ?? []).map((s) => s.Name).filter((n): n is string => !!n),
    lastPlayed: item.UserData?.LastPlayedDate ?? null,
  }
}

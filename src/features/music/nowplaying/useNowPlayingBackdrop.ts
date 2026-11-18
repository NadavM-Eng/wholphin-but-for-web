// NowPlayingViewModel.listenForBackdrop (MU-10): the song's backdrops (tags sorted, sorted position = image
// index) then every artist's, each group shuffled, cycled every 2 minutes; a change is skipped when less than
// 15 s of the track remain (unless nothing shows yet). Cleared when the preference is off, on errors, or when
// there is nothing to show. Colours are extracted per image for the dynamic background.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect, useMemo, useState } from 'react'
import { buildItemImageUrl } from '../../../api/images'
import { useSession } from '../../../api/session'
import { BACKDROP_NONE, usePageBackdrop, type BackdropResult } from '../../../app/shell/backdropService'
import { extractBackdropColors } from '../../../app/shell/extractColors'
import { useMusicQueue } from '../../../stores/musicQueue'
import { shuffled } from '../queue/queueOps'
import { useNowPlayingBackdropItems } from '../data/musicQueries'

export const BACKDROP_ROTATE_MS = 2 * 60_000
export const BACKDROP_MIN_REMAINING_MS = 15_000

/** `widthPx` null: the image as stored, upstream's request (NowPlayingViewModel.backdropImageUrls has no size). */
export function backdropUrls(baseUrl: string | null, item: BaseItemDto, widthPx: number | null): string[] {
  const tags = [...(item.BackdropImageTags ?? [])].sort()
  return tags
    .map((tag, imageIndex) => (item.Id ? buildItemImageUrl(baseUrl, item.Id, 'Backdrop', { tag, imageIndex, fillWidth: widthPx }) : null))
    .filter((u): u is string => !!u)
}

/**
 * Each backdrop as the rendition drawn on screen and the stored image the colours are taken from: the palette
 * of a resized JPEG differs from the original's, which is what the TV reads (see backdropColorSourceFor).
 */
function backdrops(baseUrl: string | null, item: BaseItemDto, widthPx: number) {
  const stored = backdropUrls(baseUrl, item, null)
  return backdropUrls(baseUrl, item, widthPx).map((url, i) => ({ url, colorSource: stored[i] }))
}

export function useNowPlayingBackdrop(songId: string | null, enabled: boolean) {
  const session = useSession()
  const baseUrl = session?.api.basePath ?? null
  const q = useNowPlayingBackdropItems(songId, enabled)
  const list = useMemo(() => {
    if (!q.data) return []
    const width = Math.round(Math.min(3840, window.innerWidth * (window.devicePixelRatio || 1) * 0.7))
    const song = shuffled(backdrops(baseUrl, q.data.song, width))
    const artists = shuffled(q.data.artists.flatMap((a) => backdrops(baseUrl, a, width)))
    return [...song, ...artists]
  }, [q.data, baseUrl])
  // the step restarts with every track
  const [stepState, setStepState] = useState({ songId, step: 0 })
  const step = stepState.songId === songId ? stepState.step : 0
  const [loaded, setLoaded] = useState<BackdropResult>(BACKDROP_NONE)
  const current = enabled && songId && !q.isError && list.length > 0 ? list[step % list.length] : null
  const url = current?.url ?? null
  const colorSource = current?.colorSource ?? null

  useEffect(() => {
    if (!url || !songId) return
    let cancelled = false
    void extractBackdropColors(colorSource).then((colors) => {
      if (!cancelled) setLoaded({ itemId: songId, imageUrl: url, colors: colors ?? null })
    })
    return () => {
      cancelled = true
    }
  }, [url, colorSource, songId])

  // keep the previous image while the next one's colours are extracted; nothing when there is no URL
  const result = url ? loaded : BACKDROP_NONE

  useEffect(() => {
    if (!enabled || list.length < 2) return
    const id = setInterval(() => {
      const s = useMusicQueue.getState()
      if (s.durationMs - s.positionMs >= BACKDROP_MIN_REMAINING_MS) setStepState((x) => ({ songId, step: (x.songId === songId ? x.step : 0) + 1 }))
    }, BACKDROP_ROTATE_MS)
    return () => clearInterval(id)
  }, [enabled, list.length, songId])

  usePageBackdrop(result)
  return result
}

// Episode strip geometry (W/ui/detail/series/SeriesOverviewContent.kt:243-307). Pure.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'

/** `cardHeight = 120.dp`. */
export const EPISODE_CARD_HEIGHT = 120

/** `aspectRatio = max(item.aspectRatio, 4:3)`, 16:9 when unknown. */
export function episodeAspect(ep: Pick<BaseItemDto, 'PrimaryImageAspectRatio'> | undefined): number {
  const a = ep?.PrimaryImageAspectRatio
  return a && a > 0 ? Math.max(a, 4 / 3) : 16 / 9
}

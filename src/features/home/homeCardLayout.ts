import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { aspectValue } from '../common/viewOptions'
import type { HomeRowViewOptions } from './model/homeRowConfig'

/** Position marker read by the page's focus/hover tracking: "row:column". */
export const POS_ATTR = 'data-home-pos'

/** The episode-specific options apply to items of type Episode (`HomePageCardContent`). */
export function cardShape(item: BaseItemDto | undefined, o: HomeRowViewOptions) {
  const ep = item?.Type === 'Episode'
  return {
    aspectRatio: ep ? o.episodeAspectRatio : o.aspectRatio,
    contentScale: ep ? o.episodeContentScale : o.contentScale,
    imageType: ep ? o.episodeImageType : o.imageType,
  }
}

/** Card width in dp, for sizing the row before it renders. */
export function cardWidthDp(item: BaseItemDto | undefined, o: HomeRowViewOptions): number {
  if (item?.Type === 'Genre' || item?.Type === 'Studio') return (o.heightDp * 16) / 9
  const ratio = aspectValue(cardShape(item, o).aspectRatio)
  return o.heightDp * (o.showTitles ? Math.max(ratio, 2 / 3) : ratio)
}

export function viewMoreWidthDp(lastItem: BaseItemDto | undefined, o: HomeRowViewOptions): number {
  return o.heightDp * aspectValue(lastItem?.Type === 'Episode' ? o.episodeAspectRatio : o.aspectRatio)
}

import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { itemDestination } from '../../../app/nav'
import { ItemRow, PosterCard } from '../../../ui'
import { posterCardProps, useCardContext } from '../../common/cardAdapters'
import type { ItemMenuOptions } from '../../common/itemMenu'
import { useLinkClick } from '../../common/links'
import type { ItemContextMenu } from '../../common/useItemContextMenu'
import { useTranslate } from '../../common/useTranslate'

/**
 * A row of `SeasonCard`s (detail-page / person rows): Primary image at `height`, width from the item's own
 * aspect ratio, title + subtitle, overlay on demand; right-click opens the item menu when `menu` is given.
 */
export function PosterItemsRow({
  title,
  items,
  count,
  getItem,
  height,
  aspectRatio,
  showOverlay = true,
  menu,
  menuOptions,
  restoreKey,
  gap,
}: {
  title: string
  items?: BaseItemDto[]
  /** Paged rows: total count and an index getter (undefined = still loading, a blank card shows). */
  count?: number
  getItem?: (index: number) => BaseItemDto | undefined
  height: number
  aspectRatio?: (item: BaseItemDto) => number | undefined
  showOverlay?: boolean
  menu?: ItemContextMenu
  menuOptions?: ItemMenuOptions
  restoreKey: string
  gap?: number
}) {
  const { t } = useTranslate()
  const ctx = useCardContext()
  const linkClick = useLinkClick()
  const n = count ?? items?.length ?? 0
  const at = (i: number) => (getItem ? getItem(i) : items?.[i])
  if (n === 0) return null
  return (
    <ItemRow
      title={title}
      count={n}
      gap={gap}
      itemWidth={(i) => {
        const it = at(i)
        const a = it ? (aspectRatio?.(it) ?? it.PrimaryImageAspectRatio) : undefined
        return height * Math.max(a && a > 0 ? a : 2 / 3, 2 / 3)
      }}
      restoreKey={restoreKey}
      previousLabel={t('web_previous')}
      nextLabel={t('web_next')}
      getItemKey={(i) => `${at(i)?.Id ?? 'p'}:${i}`}
      renderItem={(i) => {
        const it = at(i)
        if (!it) {
          return <PosterCard title=" " height={height} aspectRatio={2 / 3} label="" />
        }
        const p = posterCardProps(it, ctx, { height, aspectRatio: aspectRatio?.(it), showOverlay })
        const href = itemDestination(it)
        return (
          <div data-focus-key={`${restoreKey}:${i}`}>
            <PosterCard {...p} href={href} onClick={linkClick(href)} {...(menu ? menu.cardActions(it, menuOptions) : {})} />
          </div>
        )
      }}
    />
  )
}

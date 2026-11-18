import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { BannerCardWithTitle, ItemRow, type CardActions } from '../../../ui'
import { clampAspect } from '../../../ui/lib/gridMath'
import { itemHref, useCardContext } from '../../common/cardAdapters'
import { useLinkClick } from '../../common/links'

/** Default `BannerCard` height (cardHeight 120dp). */
export const MUSIC_CARD_HEIGHT = 120

export type MusicCardRowProps = {
  title: string
  items: readonly BaseItemDto[]
  /** SQUARE (albums, artists, similar) or the item's own aspect (music videos, default WIDE) */
  shape: 'square' | 'item'
  /** card overlays (watched / progress / favorite) for video items */
  overlays?: boolean
  /** long-press / more menu, when the row has one */
  menu?: (item: BaseItemDto, index: number) => Pick<CardActions, 'onContextMenu' | 'onMore' | 'moreLabel'>
  /** remembered horizontal scroll */
  restoreKey: string
  focusKeyPrefix: string
}

/** An `ItemRow` of `BannerCardWithTitle` cards: title = name, subtitle = production year (album/artist pages). */
export function MusicCardRow({ title, items, shape, overlays, menu, restoreKey, focusKeyPrefix }: MusicCardRowProps) {
  const { t } = useTranslation()
  const ctx = useCardContext()
  const linkClick = useLinkClick()
  const aspectOf = useCallback(
    (item: BaseItemDto) => (shape === 'square' ? 1 : item.PrimaryImageAspectRatio && item.PrimaryImageAspectRatio > 0 ? item.PrimaryImageAspectRatio : 16 / 9),
    [shape],
  )
  const widthOf = useCallback((i: number) => MUSIC_CARD_HEIGHT * clampAspect(aspectOf(items[i])), [items, aspectOf])
  if (items.length === 0) return null
  return (
    <ItemRow
      title={title}
      count={items.length}
      itemWidth={widthOf}
      restoreKey={restoreKey}
      previousLabel={t('web_previous')}
      nextLabel={t('web_next')}
      getItemKey={(i) => items[i].Id ?? i}
      renderItem={(i) => {
        const item = items[i]
        const href = itemHref(item)
        const ud = item.UserData
        return (
          <BannerCardWithTitle
            title={item.Name ?? null}
            subtitle={item.ProductionYear != null ? String(item.ProductionYear) : null}
            name={item.Name}
            label={item.Name ?? ''}
            imageSrc={ctx.image(item, 'Primary', { heightDp: MUSIC_CARD_HEIGHT })}
            height={MUSIC_CARD_HEIGHT}
            aspectRatio={aspectOf(item)}
            fit={shape === 'square' ? 'fill' : 'contain'}
            played={overlays ? (ud?.Played ?? false) : false}
            playedPercent={overlays ? (ud?.PlayedPercentage ?? 0) : 0}
            favorite={overlays ? (ud?.IsFavorite ?? false) : false}
            href={href}
            onClick={linkClick(href)}
            {...menu?.(item, i)}
            surfaceProps={{ 'data-focus-key': `${focusKeyPrefix}:${item.Id}` }}
          />
        )
      }}
    />
  )
}

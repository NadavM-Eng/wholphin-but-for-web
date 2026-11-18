import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { BannerCardWithTitle, PersonCard, PosterCard, type CardActions } from '../../ui'
import { posterCardProps, type CardContext } from '../common/cardAdapters'
import { cardFallbackName, itemSubtitle, itemTitle } from '../common/itemText'
import { programDateRange } from './programDateRange'
import type { SearchCardKind } from './searchTypes'
import styles from './SearchPage.module.css'

type Props = CardActions & {
  item: BaseItemDto
  kind: SearchCardKind
  ctx: CardContext
  /** Exact focus restore on Back. */
  focusKey: string
}

/**
 * Row card of the search page (W/ui/search/SearchPageCard.kt): episodes as a 128dp 16:9 banner with the
 * series name and "S# E# - name" (no overlays); albums, artists and songs as 128dp squares; people as
 * 108dp circles; channels and programs 96dp 16:9; everything else a 172dp 2:3 poster with overlay.
 */
export function SearchPageCard({ item, kind, ctx, focusKey, href, onClick, onContextMenu, onMore, moreLabel }: Props) {
  const actions = { href, onClick, onContextMenu, onMore, moreLabel }
  const surfaceProps = { 'data-focus-key': focusKey }
  switch (kind) {
    case 'episode':
      return (
        <div className={styles.episodeCard}>
          <BannerCardWithTitle
            {...actions}
            title={itemTitle(item)}
            subtitle={itemSubtitle(ctx.t, item)}
            name={cardFallbackName(item)}
            imageSrc={ctx.image(item, 'Primary', { heightDp: 128, useSeries: false })}
            height={128}
            aspectRatio={16 / 9}
            surfaceProps={surfaceProps}
          />
        </div>
      )
    case 'person': {
      // PersonCard: Primary image, name only, no heart (showOverlay=false)
      return (
        <PersonCard
          {...actions}
          name={item.Name ?? ''}
          role={null}
          imageSrc={ctx.image(item, 'Primary', { widthDp: 108 })}
          width={108}
          surfaceProps={surfaceProps}
        />
      )
    }
    case 'square':
    case 'channel':
    case 'program':
    case 'poster': {
      const height = kind === 'poster' ? 172 : kind === 'square' ? 128 : 96
      const aspectRatio = kind === 'poster' ? 2 / 3 : kind === 'square' ? 1 : 16 / 9
      const { href: _href, ...card } = posterCardProps(item, ctx, { height, aspectRatio, showOverlay: true, useSeries: false })
      const subtitle = kind === 'program' ? programDateRange(item, ctx.locale) : card.subtitle
      return <PosterCard {...card} {...actions} subtitle={subtitle} surfaceProps={surfaceProps} />
    }
  }
}

import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { memo, type KeyboardEvent, type MouseEvent } from 'react'
import { BannerCard, BannerCardWithTitle, GenreCard, StudioCard, ViewMoreCard, type CardActions } from '../../ui'
import { bannerCardProps, type CardContext } from '../common/cardAdapters'
import { aspectValue } from '../common/viewOptions'
import { cardShape, cardWidthDp, POS_ATTR } from './homeCardLayout'
import type { HomeRowViewOptions } from './model/homeRowConfig'

type Click = (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void

type HomeCardProps = {
  item: BaseItemDto
  pos: string
  viewOptions: HomeRowViewOptions
  ctx: CardContext
  /** Omitted for the inert customization preview (a non-link card). */
  href?: string
  imageOverride?: string | null
  onClick: Click
  menu: Pick<CardActions, 'onContextMenu' | 'onMore' | 'moreLabel'>
  focusDefault?: boolean
  /** The row's one Tab stop; the other cards are reached with the arrow keys (tabIndex -1). */
  tabStop?: boolean
}

/** `HomePageCardContent` (HomePage.kt:637-737): genre/studio tiles, else BannerCard with or without titles. */
export const HomeCard = memo(function HomeCard({ item, pos, viewOptions, ctx, href, imageOverride, onClick, menu, focusDefault, tabStop }: HomeCardProps) {
  const surfaceProps = {
    [POS_ATTR]: pos,
    'data-focus-key': `home:${pos}`,
    'data-focus-default': focusDefault || undefined,
    tabIndex: tabStop ? 0 : -1,
  }
  const actions = { href, onClick, ...menu, surfaceProps }
  const width = cardWidthDp(item, viewOptions)
  if (item.Type === 'Genre') {
    return <GenreCard id={item.Id} name={item.Name} imageSrc={imageOverride} width={width} {...actions} />
  }
  if (item.Type === 'Studio') {
    return <StudioCard id={item.Id} name={item.Name} imageSrc={imageOverride} width={width} {...actions} />
  }
  const shape = cardShape(item, viewOptions)
  const props = bannerCardProps(item, ctx, {
    height: viewOptions.heightDp,
    aspectRatio: shape.aspectRatio,
    contentScale: shape.contentScale,
    imageType: shape.imageType,
    useSeries: viewOptions.useSeries,
    imageOverride,
  })
  const { title, subtitle, href: _ignored, ...banner } = props
  return viewOptions.showTitles ? (
    <BannerCardWithTitle {...banner} title={title} subtitle={subtitle} {...actions} />
  ) : (
    <BannerCard {...banner} {...actions} />
  )
})

type ViewMoreProps = {
  lastItem: BaseItemDto | undefined
  viewOptions: HomeRowViewOptions
  label: string
  href: string
  pos: string
  onClick: Click
  tabStop?: boolean
}

/** `HomePageViewMoreCard`: same height / aspect as the row (episode aspect after an episode). */
export function HomeViewMoreCard({ lastItem, viewOptions, label, href, pos, onClick, tabStop }: ViewMoreProps) {
  const aspect = lastItem?.Type === 'Episode' ? viewOptions.episodeAspectRatio : viewOptions.aspectRatio
  return (
    <ViewMoreCard
      label={label}
      href={href}
      onClick={onClick}
      height={viewOptions.heightDp}
      aspectRatio={aspectValue(aspect)}
      showTitle={viewOptions.showTitles}
      surfaceProps={{ [POS_ATTR]: pos, 'data-focus-key': `home:${pos}`, tabIndex: tabStop ? 0 : -1 }}
    />
  )
}

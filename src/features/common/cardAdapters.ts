// BaseItemDto -> UI kit card props. Pure functions; pass a CardContext from `useCardContext()`.
// Click targets come from `itemDestination` (BaseItem.destination()); the caller adds the menu handlers
// (see useItemContextMenu().cardActions).
import type { BaseItemDto, BaseItemPerson, ChapterInfo } from '@jellyfin/sdk/lib/generated-client/models'
import { useMemo } from 'react'
import { getChapterImageUrl, getPersonImageUrl, imagePx } from '../../api/images'
import { itemDestination } from '../../app/nav'
import { formatClock, ticksToMs, abbreviateNumber, type Translate } from '../../lib/format'
import { useSessionStore } from '../../stores/session'
import type {
  BannerCardProps,
  CardOverlayProps,
  ChapterCardProps,
  GenreCardProps,
  GridCardProps,
  ImageFit,
  PersonCardProps,
  PosterCardProps,
  StudioCardProps,
} from '../../ui'
import { useImageResolver, type ImageResolver } from './imageResolver'
import { useTranslate } from './useTranslate'
import { cardFallbackName, itemSubtitle, itemTitle, unplayedCornerText } from './itemText'
import { aspectValue, contentScaleFit, imageTypeOf, type AspectRatioName, type ContentScale, type ViewImageType } from './viewOptions'

export type CardContext = {
  t: Translate
  locale: string
  image: ImageResolver
  /** Server base URL (person / chapter images). */
  baseUrl: string | null
}

/** Everything the adapters need, bound to the current language, server and screen. */
export function useCardContext(): CardContext {
  const { t, locale } = useTranslate()
  const image = useImageResolver()
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  return useMemo(() => ({ t, locale, image, baseUrl }), [t, locale, image, baseUrl])
}

/** Where a click on the card goes (upstream `BaseItem.destination()`). */
export function itemHref(item: BaseItemDto): string {
  return itemDestination(item)
}

/** `ItemCardImage` overlay data: favorite, played, unplayed count, progress, versions. */
export function cardOverlay(item: BaseItemDto, locale?: string): CardOverlayProps {
  const ud = item.UserData
  const unplayed = ud?.UnplayedItemCount ?? 0
  return {
    favorite: ud?.IsFavorite ?? false,
    watched: ud?.Played ?? false,
    unplayedCount: unplayed > 0 ? abbreviateNumber(unplayed, locale) : undefined,
    playedPercent: ud?.PlayedPercentage ?? null,
    versionCount: item.MediaSourceCount ?? 0,
  }
}

/** Row image options (upstream `HomeRowViewOptions` subset that drives one card). */
export type RowImageOptions = {
  /** Card height in dp. */
  height: number
  aspectRatio: AspectRatioName
  contentScale: ContentScale
  imageType: ViewImageType
  useSeries: boolean
}

export type BannerAdapterResult = BannerCardProps & { title: string | null; subtitle: string | null; href: string }

/**
 * Home-row card (`HomePageCardContent` -> `BannerCard` / `BannerCardWithTitle`). `imageOverride` is
 * upstream's `imageUrlOverride` (genre/studio art).
 */
export function bannerCardProps(
  item: BaseItemDto,
  ctx: CardContext,
  o: RowImageOptions & { imageOverride?: string | null },
): BannerAdapterResult {
  const ud = item.UserData
  return {
    name: cardFallbackName(item),
    title: itemTitle(item),
    subtitle: itemSubtitle(ctx.t, item),
    label: itemTitle(item) ?? item.Name ?? '',
    imageSrc:
      o.imageOverride !== undefined
        ? o.imageOverride
        : ctx.image(item, imageTypeOf(o.imageType), { heightDp: o.height, useSeries: o.useSeries }),
    cornerText: unplayedCornerText(ctx.t, item, ctx.locale),
    played: ud?.Played ?? false,
    favorite: ud?.IsFavorite ?? false,
    playedPercent: ud?.PlayedPercentage ?? 0,
    height: o.height,
    aspectRatio: aspectValue(o.aspectRatio),
    fit: contentScaleFit(o.contentScale),
    href: itemHref(item),
  }
}

/** Library-grid card (`GridCard`): full overlay, title + subtitle, image sized to the cell width. */
export function gridCardProps(
  item: BaseItemDto,
  ctx: CardContext,
  o: { widthCss: number; aspectRatio?: number; fit?: ImageFit; imageType?: ViewImageType; useSeries?: boolean; showTitle?: boolean },
): GridCardProps & { href: string } {
  return {
    title: itemTitle(item),
    subtitle: itemSubtitle(ctx.t, item),
    name: item.Name,
    imageSrc: ctx.image(item, imageTypeOf(o.imageType), { widthCss: o.widthCss, useSeries: o.useSeries ?? true }),
    aspectRatio: o.aspectRatio ?? 2 / 3,
    fit: o.fit ?? 'contain',
    showTitle: o.showTitle ?? true,
    ...cardOverlay(item, ctx.locale),
    href: itemHref(item),
  }
}

/**
 * Detail-page / search row card (`SeasonCard`): Primary image at `height`, width from the item's own
 * aspect ratio (min 2:3) unless given, overlay only when asked.
 */
export function posterCardProps(
  item: BaseItemDto,
  ctx: CardContext,
  o: { height: number; aspectRatio?: number; showOverlay?: boolean; useSeries?: boolean },
): PosterCardProps & { href: string } {
  const ratio = o.aspectRatio ?? (item.PrimaryImageAspectRatio && item.PrimaryImageAspectRatio > 0 ? item.PrimaryImageAspectRatio : 2 / 3)
  return {
    title: itemTitle(item),
    subtitle: itemSubtitle(ctx.t, item),
    name: item.Name,
    imageSrc: ctx.image(item, 'Primary', { heightDp: o.height, useSeries: o.useSeries ?? false }),
    height: o.height,
    aspectRatio: ratio,
    showOverlay: o.showOverlay ?? false,
    ...cardOverlay(item, ctx.locale),
    href: itemHref(item),
  }
}

/** Cast/crew card from a `BaseItemPerson` (detail pages) or a Person item (favorites rows). */
export function personCardProps(
  person: BaseItemPerson | BaseItemDto,
  ctx: CardContext,
  /** Rendered card width (the image is a square of it); default `PersonCard`'s 108dp. */
  o: { widthDp?: number; widthCss?: number } = {},
): PersonCardProps & { href: string } {
  const px = o.widthCss != null ? imagePx(o.widthCss, 'css') : imagePx(o.widthDp ?? 108)
  const isDto = 'ImageTags' in person || 'UserData' in person
  const tag = isDto ? ((person as BaseItemDto).ImageTags?.Primary ?? null) : ((person as BaseItemPerson).PrimaryImageTag ?? null)
  const role = isDto ? null : ((person as BaseItemPerson).Role ?? (person as BaseItemPerson).Type ?? null)
  return {
    name: person.Name ?? null,
    role,
    imageSrc: person.Id ? getPersonImageUrl(ctx.baseUrl, { Id: person.Id, PrimaryImageTag: tag }, { fillWidth: px, fillHeight: px }) : null,
    href: itemDestination({ Id: person.Id ?? '', Type: 'Person' }),
  }
}

/** Chapter thumbnail (`ChapterCard`): Chapter image by index, start time "m:ss". */
export function chapterCardProps(
  itemId: string,
  chapter: ChapterInfo,
  index: number,
  ctx: CardContext,
  o: { height?: number } = {},
): ChapterCardProps {
  return {
    name: chapter.Name ?? null,
    time: formatClock(ticksToMs(chapter.StartPositionTicks ?? 0)),
    imageSrc: chapter.ImageTag ? getChapterImageUrl(ctx.baseUrl, itemId, index, chapter.ImageTag) : null,
    height: o.height ?? 120,
  }
}

/** Genre tile: `imageSrc` is a random item's backdrop (see genreImages.ts). */
export function genreCardProps(genre: BaseItemDto, imageSrc: string | null | undefined, href: string): GenreCardProps & { href: string } {
  return { id: genre.Id, name: genre.Name, imageSrc: imageSrc ?? null, href }
}

/** Studio tile: the studio's Thumb image. */
export function studioCardProps(studio: BaseItemDto, ctx: CardContext, href: string, widthDp?: number): StudioCardProps & { href: string } {
  return {
    id: studio.Id,
    name: studio.Name,
    imageSrc: studio.ImageTags?.Thumb ? ctx.image(studio, 'Thumb', { widthDp }) : null,
    href,
  }
}

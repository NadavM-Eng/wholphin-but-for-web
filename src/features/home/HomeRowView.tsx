import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useCallback, useMemo } from 'react'
import { nav } from '../../app/nav'
import type { Translate } from '../../lib/format'
import { ItemRow, LoadingRow } from '../../ui'
import type { CardContext } from '../common/cardAdapters'
import { itemHref } from '../common/cardAdapters'
import { resumeMs } from '../common/itemMenu'
import type { ItemMenuOptions } from '../common/itemMenu'
import { useLinkClick } from '../common/links'
import type { ItemContextMenu } from '../common/useItemContextMenu'
import type { HomeRowState } from './data/useHomeData'
import { configTitle } from './data/rowFetchers'
import { rowTitleText } from './data/rowTitle'
import { HomeCard, HomeViewMoreCard } from './HomeCard'
import { cardWidthDp, viewMoreWidthDp } from './homeCardLayout'
import { isWatchingRow } from './model/homeRowConfig'
import type { Library } from '../common/libraries'

type Props = {
  row: HomeRowState
  libraries: readonly Library[]
  t: Translate
  ctx: CardContext
  /** Long-press menu; not used by the preview. */
  menu?: ItemContextMenu
  /** Upstream `click_to_play` for the watching rows. */
  clickToPlay: boolean
  /** Key for the remembered horizontal scroll (per history entry). */
  restoreKey: string
  /** Column of the remembered card in this row (marked data-focus-default), or -1. */
  focusColumn: number
  /** Column that is this row's single Tab stop (roving tabindex; the row's remembered card). */
  tabColumn: number
  /**
   * Home customization preview (HomeSettingsPage.kt:350-369): inert cards (no navigation, no menu), empty
   * rows shown with "No results", no View more card.
   */
  preview?: boolean
}

const NO_MENU = {}
const noop = () => {}

/** Upstream shows the exception's `localizedMessage` as the row subtitle. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function HomeRowView({ row, libraries, t, ctx, menu, clickToPlay, restoreKey, focusColumn, tabColumn, preview }: Props) {
  const { config, index, query } = row
  const linkClick = useLinkClick()
  const data = query.data
  const watching = isWatchingRow(config)
  const menuOptions: ItemMenuOptions = {
    canRemoveContinueWatching: config.type === 'ContinueWatching' || config.type === 'ContinueWatchingCombined',
    canRemoveNextUp: config.type === 'NextUp' || config.type === 'ContinueWatchingCombined',
  }
  const items: BaseItemDto[] = useMemo(() => data?.items ?? [], [data])
  const o = config.viewOptions
  const showViewMore = !preview && (data?.showViewMore ?? false)
  const count = items.length + (showViewMore ? 1 : 0)
  const widthOf = useCallback((i: number) => (i < items.length ? cardWidthDp(items[i], o) : viewMoreWidthDp(items[items.length - 1], o)), [items, o])

  if (!data) {
    const title = rowTitleText(t, configTitle(config, libraries))
    if (query.isError) {
      return <LoadingRow title={title} message={errorMessage(query.error)} error focusable />
    }
    return <LoadingRow title={title} message={t('loading')} focusable />
  }
  if (items.length === 0) {
    return preview ? <LoadingRow title={rowTitleText(t, data.title)} message={t('no_results')} focusable /> : null
  }
  const tabStop = Math.min(tabColumn, count - 1)

  const hrefFor = (item: BaseItemDto) => {
    const id = item.Id ?? ''
    if (data.hrefOverrides?.[id]) return data.hrefOverrides[id]
    if (clickToPlay && watching) return nav.play(id, { t: resumeMs(item) })
    return itemHref(item)
  }

  return (
    <ItemRow
      title={rowTitleText(t, data.title)}
      count={count}
      gap={o.spacing}
      itemWidth={widthOf}
      restoreKey={restoreKey}
      previousLabel={t('web_previous')}
      nextLabel={t('web_next')}
      getItemKey={(i) => (i < items.length ? `${items[i].Id}:${i}` : 'view-more')}
      renderItem={(i) => {
        if (i >= items.length) {
          const href = nav.moreHomeRow(index, { position: items.length })
          return (
            <HomeViewMoreCard
              lastItem={items[items.length - 1]}
              viewOptions={o}
              label={t('view_more')}
              href={href}
              pos={`${index}:${i}`}
              onClick={linkClick(href)}
              tabStop={i === tabStop}
            />
          )
        }
        const item = items[i]
        const href = hrefFor(item)
        const id = item.Id ?? ''
        return (
          <HomeCard
            item={item}
            pos={`${index}:${i}`}
            viewOptions={o}
            ctx={ctx}
            href={preview ? undefined : href}
            imageOverride={data.imageOverrides ? (data.imageOverrides[id] ?? null) : undefined}
            onClick={preview ? noop : linkClick(href)}
            menu={preview || !menu ? NO_MENU : menu.cardActions(item, { ...menuOptions, goToHref: data.hrefOverrides?.[id] })}
            focusDefault={i === focusColumn}
            tabStop={i === tabStop}
          />
        )
      }}
    />
  )
}

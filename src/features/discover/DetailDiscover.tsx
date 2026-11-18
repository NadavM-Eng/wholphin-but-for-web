// The Seerr pieces of the Jellyfin detail pages (spec 04 §D.4): the "Discover" row on movie, series and person
// pages (MovieDetails.kt:480, SeriesDetails.kt DISCOVER_ROW, PersonPage.kt:266-300) and the series page's
// "Discover" button (SeriesDetails.kt:488-506). Both render nothing while Seerr is not linked.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { discoverPersonFor, useSeerrSeriesFor, useSeerrSimilarFor } from '../../api/seerr'
import { useNav } from '../../app/nav'
import { usePrefs } from '../../stores/preferences'
import { ExpandableButton, FaIcon } from '../../ui'
import { DiscoverRow } from './DiscoverRow'
import { discoveredItemHref, itemDestinationHref } from './links'

/**
 * `SeerrService.similar(item)` as a row titled "Discover": similar titles for a movie or series, the combined
 * credits for a person. A person's row is cut at the Home "items per row" preference with a "View more" card
 * leading to the Seerr person page at that index (PersonPage.kt:266-300).
 */
export function DetailDiscoverRow({ item, restoreKey }: { item: BaseItemDto; restoreKey?: string }) {
  const { t } = useTranslation()
  const q = useSeerrSimilarFor(item)
  const maxItems = usePrefs('homePageItems')
  const isPerson = item.Type === 'Person'
  const all = q.data
  const data = useMemo(() => (isPerson && all ? all.slice(0, maxItems) : all), [isPerson, all, maxItems])
  const person = isPerson ? discoverPersonFor(item) : null
  const viewMoreHref = person && all && all.length > maxItems ? discoveredItemHref(person, maxItems) : undefined
  return (
    <DiscoverRow
      title={t('discover')}
      query={{ data, error: q.error, isPending: q.isPending, isError: q.isError }}
      hrefOf={itemDestinationHref}
      viewMoreHref={viewMoreHref}
      restoreKey={restoreKey}
      hideWhenEmpty
    />
  )
}

/** The series page's "Discover" button: the series' Seerr page, shown once Seerr knows the series. */
export function SeriesDiscoverButton({ series }: { series: BaseItemDto }) {
  const { t } = useTranslation()
  const go = useNav()
  const q = useSeerrSeriesFor(series)
  if (!q.data) return null
  const target = q.data
  return (
    <ExpandableButton
      icon={<FaIcon name="magnifying_glass_plus" />}
      iconKind="fa"
      label={t('discover')}
      onClick={() => go.to(discoveredItemHref(target))}
    />
  )
}

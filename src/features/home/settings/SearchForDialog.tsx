import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { qk } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'
import type { Translate } from '../../../lib/format'
import { Dialog, ItemRow, PosterCard, SearchField } from '../../../ui'
import { posterCardProps, useCardContext } from '../../common/cardAdapters'
import { SLIM_ITEM_FIELDS } from '../../common/itemFields'
import styles from './HomeSettings.module.css'

export type SearchForKind = 'BoxSet' | 'Playlist'

type Props = { kind: SearchForKind | null; t: Translate; onPick: (item: BaseItemDto) => void; onClose: () => void }

/** SeasonCard at episode height (`Cards.heightEpisode`, 128dp), no image overlay (SeasonCard default). */
const CARD_HEIGHT = 128

/** PosterCard width: height x the item's aspect ratio, clamped to >= 2:3 like the card itself. */
function cardWidth(item: BaseItemDto): number {
  const r = item.PrimaryImageAspectRatio && item.PrimaryImageAspectRatio > 0 ? item.PrimaryImageAspectRatio : 2 / 3
  return Math.round(CARD_HEIGHT * Math.max(r, 2 / 3))
}

/**
 * `SearchForDialog` (W/ui/search/SearchForDialog.kt): "Search {Collections|Playlists}", a search box
 * (750 ms debounce, Enter searches at once), a "Results" row and a "Suggestions" row (25 most recently
 * added of that kind). Clicking a card picks it. Web: no voice button, and the box is a normal input (no
 * TV "activate to type" step).
 */
export function SearchForDialog({ kind, t, onPick, onClose }: Props) {
  const api = useApi()
  const session = useSession()
  const ctx = useCardContext()
  const userId = session?.user.id ?? ''
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setQuery(text.trim()), 750)
    return () => clearTimeout(id)
  }, [text])

  const results = useQuery({
    queryKey: qk('home', 'searchFor', kind, query),
    enabled: !!kind && query !== '',
    queryFn: async ({ signal }) =>
      (await getLibraryApi(api).getItems({ userId, searchTerm: query, includeItemTypes: [kind!], recursive: true, fields: SLIM_ITEM_FIELDS }, { signal }))
        .data.Items ?? [],
  })
  const suggestions = useQuery({
    queryKey: qk('home', 'searchForSuggestions', kind),
    enabled: !!kind,
    queryFn: async ({ signal }) =>
      (
        await getLibraryApi(api).getItems(
          { userId, includeItemTypes: [kind!], recursive: true, sortBy: ['DateLastContentAdded'], sortOrder: ['Descending'], limit: 25, fields: SLIM_ITEM_FIELDS },
          { signal },
        )
      ).data.Items ?? [],
  })

  const title = t('search_for', { p1: t(kind === 'Playlist' ? 'playlists' : 'collections') })

  // SearchForResultsRow: while searching, or with no query / no results, only an ItemRowTitle with
  // "Searching..." / "No results" is shown (no "Results" / "Suggestions" heading).
  const row = (label: string, items: BaseItemDto[] | undefined, pending: boolean, key: string) => {
    if (pending) return <p className={styles.searchForRowTitle} role="status">{t('searching')}</p>
    if (!items?.length) return <p className={styles.searchForRowTitle} role="status">{t('no_results')}</p>
    return (
      <ItemRow
        title={label}
        count={items.length}
        itemWidth={(i) => cardWidth(items[i])}
        restoreKey={`searchFor:${key}`}
        previousLabel={t('web_previous')}
        nextLabel={t('web_next')}
        getItemKey={(i) => items[i].Id ?? i}
        renderItem={(i) => {
          const { href: _href, ...card } = posterCardProps(items[i], ctx, { height: CARD_HEIGHT, showOverlay: false })
          return <PosterCard {...card} onClick={() => onPick(items[i])} />
        }}
      />
    )
  }

  return (
    <Dialog
      open={!!kind}
      onClose={onClose}
      variant="basic"
      elevation={3}
      label={title}
      // usePlatformDefaultWidth = false: the content's 80% x 66% sets the size, not the basic dialog's 560dp cap
      style={{ maxWidth: '100%' }}
    >
      <div className={styles.searchFor}>
        <h2 className={styles.searchForTitle}>{title}</h2>
        <SearchField value={text} onChange={setText} onSearch={(q) => setQuery(q.trim())} label={title} placeholder={t('search')} />
        {row(t('results'), query ? results.data : [], query !== '' && (results.isPending || text.trim() !== query), 'results')}
        <hr className={styles.divider} />
        {row(t('suggestions'), suggestions.data, suggestions.isPending, 'suggestions')}
      </div>
    </Dialog>
  )
}

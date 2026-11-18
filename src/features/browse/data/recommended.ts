// "Recommended" tab rows (W/ui/components/RecommendedMovie.kt, RecommendedTvShow.kt) with their exact
// requests. Each row is fetched with startIndex 0, limit = max items per row, no total count.
import type { ItemDep } from '../../common/itemCache'
import { SLIM_ITEM_FIELDS } from '../../common/itemFields'
import type { GridQuery } from './gridRequestKinds'

export type RecommendedRow = { titleKey: string } & GridQuery

/** `maxPremiereDate = LocalDateTime.now()` (sent when the row is fetched). */
const now = () => new Date().toISOString()

export function movieRecommendedRows(parentId: string, userId: string): RecommendedRow[] {
  const base = { userId, parentId, fields: SLIM_ITEM_FIELDS, includeItemTypes: ['Movie' as const], enableUserData: true }
  return [
    { titleKey: 'continue_watching', request: 'resume', query: { ...base } },
    {
      titleKey: 'recently_released',
      request: 'items',
      query: { ...base, recursive: true, sortBy: ['PremiereDate', 'SortName'], sortOrder: ['Descending', 'Ascending'], maxPremiereDate: now() },
    },
    { titleKey: 'recently_added', request: 'items', query: { ...base, recursive: true, sortBy: ['DateCreated'], sortOrder: ['Descending'] } },
    {
      titleKey: 'top_unwatched',
      request: 'items',
      query: { ...base, recursive: true, isPlayed: false, sortBy: ['CommunityRating'], sortOrder: ['Descending'] },
    },
  ]
}

export function tvRecommendedRows(parentId: string, userId: string, enableRewatching: boolean): RecommendedRow[] {
  const base = { userId, parentId, fields: SLIM_ITEM_FIELDS, enableUserData: true }
  return [
    { titleKey: 'continue_watching', request: 'resume', query: { ...base, includeItemTypes: ['Episode'] } },
    {
      titleKey: 'next_up',
      request: 'nextUp',
      query: { userId, parentId, fields: SLIM_ITEM_FIELDS, imageTypeLimit: 1, enableResumable: false, enableUserData: true, enableRewatching },
    },
    {
      titleKey: 'recently_released',
      request: 'items',
      query: {
        ...base,
        includeItemTypes: ['Episode'],
        recursive: true,
        sortBy: ['PremiereDate', 'SeriesSortName', 'AiredEpisodeOrder'],
        sortOrder: ['Descending', 'Ascending', 'Descending'],
        maxPremiereDate: now(),
        isUnaired: false,
      },
    },
    {
      titleKey: 'recently_added',
      request: 'items',
      query: { ...base, includeItemTypes: ['Episode'], recursive: true, sortBy: ['DateCreated'], sortOrder: ['Descending'] },
    },
    {
      titleKey: 'top_unwatched',
      request: 'items',
      query: { ...base, includeItemTypes: ['Series'], recursive: true, isPlayed: false, sortBy: ['CommunityRating'], sortOrder: ['Descending'] },
    },
  ]
}

/**
 * Item changes that make a row's membership stale (Home's rowDeps): resume / next up drop watched items,
 * the item rows filter or badge by played state (Top unwatched sends isPlayed=false).
 */
export function recommendedRowDeps(row: RecommendedRow): ItemDep[] {
  return row.request === 'items' ? ['played', 'deleted'] : ['played', 'nextUp', 'deleted']
}

export type RowStatus = { pending: boolean; nonEmpty: boolean }

/**
 * When the tab leaves its loading page (RecommendedContent.kt:116-151): rows are joined in order and the
 * first one that finished non-empty shows the page. Upstream spins forever when every row is empty or
 * failed; here the page also shows once all rows settled (then Suggestions, or "No results").
 */
export function recommendedReady(rows: readonly RowStatus[]): boolean {
  for (const r of rows) {
    if (r.pending) return false
    if (r.nonEmpty) return true
  }
  return true
}

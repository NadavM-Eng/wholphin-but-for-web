// Sort options and labels (W/ui/data/SortAndDirection.kt).
import type { ItemSortBy, SortOrder } from '@jellyfin/sdk/lib/generated-client/models'

export type SortAndDirection = { sort: ItemSortBy; direction: SortOrder }

/** `MovieSortOptions` (W/ui/data/SortAndDirection.kt), used by the box-set page. */
export const MOVIE_SORT_OPTIONS: readonly ItemSortBy[] = [
  'SortName',
  'PremiereDate',
  'DateCreated',
  'DatePlayed',
  'CommunityRating',
  'CriticRating',
  'OfficialRating',
  'Runtime',
  'PlayCount',
  'Random',
]

/**
 * Invalidation tags for a sorted list of items: always 'deleted' (membership); 'played' only when the sort
 * itself depends on it. Watched / favorite marks are patched into the cached items in place (useItemActions),
 * so refetching every loaded page on each toggle (and reshuffling a Random sort) is not needed.
 */
export function sortedListDeps(sort: ItemSortBy): ('played' | 'deleted')[] {
  return sort === 'DatePlayed' || sort === 'SeriesDatePlayed' || sort === 'PlayCount' ? ['played', 'deleted'] : ['deleted']
}

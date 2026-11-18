// Box-set view options and sort (W/ui/detail/collection/CollectionViewOptionsDialog.kt `CollectionViewOptions`,
// CollectionViewModel.kt). Upstream keeps the view options per user under "{userId}_CollectionViewOptions"
// (shared by every box set) and the sort per collection in LibraryDisplayInfo; here both live in localStorage
// for the signed-in user.
import type { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'
import { BaseItemKind as Kinds } from '@jellyfin/sdk/lib/generated-client/models'
import { useCallback, useSyncExternalStore } from 'react'
import { readJson, writeJson } from '../../../lib/storage'
import { useSessionStore, userKey } from '../../../stores/session'
import type { AspectRatioName, ContentScale, ViewImageType } from '../../common/viewOptions'
import type { GetItemsFilter } from '../../browse/model/filter'
import type { SortAndDirection } from '../common/sortOptions'

export type CollectionCardOptions = {
  showDetails: boolean
  showTitles: boolean
  columns: number
  spacing: number
  contentScale: ContentScale
  aspectRatio: AspectRatioName
  imageType: ViewImageType
}

export type CollectionViewOptions = { separateTypes: boolean; cardViewOptions: CollectionCardOptions }

/** `CollectionViewOptions()`: separate types on, details and titles on, 6 columns, 16 spacing, FIT, TALL, PRIMARY. */
export const DEFAULT_COLLECTION_OPTIONS: CollectionViewOptions = {
  separateTypes: true,
  cardViewOptions: { showDetails: true, showTitles: true, columns: 6, spacing: 16, contentScale: 'FIT', aspectRatio: 'TALL', imageType: 'PRIMARY' },
}

/** Default sort of a collection without a saved one: server order ("Default"), ascending. */
export const DEFAULT_COLLECTION_SORT: SortAndDirection = { sort: 'Default', direction: 'Ascending' }

/** `typesInCollection`, also the row order in separate mode. */
export const TYPES_IN_COLLECTION: readonly BaseItemKind[] = ['Movie', 'Series', 'Episode', 'Video', 'BoxSet', 'MusicArtist', 'MusicAlbum', 'MusicVideo']

/** Row title per type (`formatTypeName`). */
export const TYPE_TITLE_KEY: Partial<Record<BaseItemKind, string>> = {
  Movie: 'movies_title',
  Series: 'tv_shows_title',
  Episode: 'episodes',
  Video: 'videos',
  BoxSet: 'collections',
  MusicArtist: 'artists',
  MusicAlbum: 'albums',
  MusicVideo: 'music_videos',
}

/**
 * Server bug jellyfin#16454 workaround (CollectionViewModel): for the box-set row, no includeItemTypes and every
 * other kind excluded.
 */
export const ALL_BUT_BOXSET: BaseItemKind[] = (Object.values(Kinds) as BaseItemKind[]).filter((k) => k !== 'BoxSet')

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

function currentUser(): string {
  const c = useSessionStore.getState().current
  return c ? userKey(c.server.id, c.user.id) : 'anon'
}

const optionsKey = () => `wholphin.collectionViewOptions.v1.${currentUser()}`
const sortKey = (collectionId: string) => `wholphin.collectionSort.v1.${currentUser()}.${collectionId}`
const filterKey = (collectionId: string) => `wholphin.collectionFilter.v1.${currentUser()}.${collectionId}`

let optionsCache: { key: string; value: CollectionViewOptions } | null = null

export function getCollectionOptions(): CollectionViewOptions {
  const key = optionsKey()
  if (optionsCache?.key === key) return optionsCache.value
  const saved = readJson<Partial<CollectionViewOptions>>(key)
  const value: CollectionViewOptions = {
    separateTypes: saved?.separateTypes ?? DEFAULT_COLLECTION_OPTIONS.separateTypes,
    cardViewOptions: { ...DEFAULT_COLLECTION_OPTIONS.cardViewOptions, ...saved?.cardViewOptions },
  }
  optionsCache = { key, value }
  return value
}

/** Saved at once (upstream writes on every change). */
export function setCollectionOptions(value: CollectionViewOptions) {
  const key = optionsKey()
  optionsCache = { key, value }
  writeJson(key, value)
  emit()
}

export function useCollectionOptions(): CollectionViewOptions {
  return useSyncExternalStore(subscribe, getCollectionOptions, getCollectionOptions)
}

const sortCache = new Map<string, SortAndDirection>()

export function getCollectionSort(collectionId: string): SortAndDirection {
  const key = sortKey(collectionId)
  const hit = sortCache.get(key)
  if (hit) return hit
  const value = readJson<SortAndDirection>(key) ?? DEFAULT_COLLECTION_SORT
  sortCache.set(key, value)
  return value
}

export function useCollectionSort(collectionId: string): [SortAndDirection, (s: SortAndDirection) => void] {
  const get = useCallback(() => getCollectionSort(collectionId), [collectionId])
  const value = useSyncExternalStore(subscribe, get, get)
  const set = useCallback(
    (s: SortAndDirection) => {
      const key = sortKey(collectionId)
      sortCache.set(key, s)
      writeJson(key, s)
      emit()
    },
    [collectionId],
  )
  return [value, set]
}

const NO_FILTER: GetItemsFilter = {}
const filterCache = new Map<string, GetItemsFilter>()

export function getCollectionFilter(collectionId: string): GetItemsFilter {
  const key = filterKey(collectionId)
  const hit = filterCache.get(key)
  if (hit) return hit
  const value = readJson<GetItemsFilter>(key) ?? NO_FILTER
  filterCache.set(key, value)
  return value
}

/** The collection's filter (upstream LibraryDisplayInfo.filter, saved with the sort per collection). */
export function useCollectionFilter(collectionId: string): [GetItemsFilter, (f: GetItemsFilter) => void] {
  const get = useCallback(() => getCollectionFilter(collectionId), [collectionId])
  const value = useSyncExternalStore(subscribe, get, get)
  const set = useCallback(
    (f: GetItemsFilter) => {
      const key = filterKey(collectionId)
      filterCache.set(key, f)
      writeJson(key, f)
      emit()
    },
    [collectionId],
  )
  return [value, set]
}

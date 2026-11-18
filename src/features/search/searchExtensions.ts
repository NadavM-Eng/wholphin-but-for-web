// Extension points of the search page for features that are not in this folder.
//
// 1. Seerr ("Discover" results). Upstream SearchViewModel.searchSeerr adds Seerr search results when a
//    Seerr server is active and the per-user "Discover" include switch is on: a "Discover" row after the
//    type rows in category mode, a Library | Discover tab pair in combined mode. The Seerr feature
//    registers a provider once, app-wide:
//
//      registerSearchDiscoverProvider({ subscribe, isActive, cacheKey, search })
//
//    `search` returns ready card props; the page keeps only MOVIE and TV results (upstream filter).
//
// 2. Live TV programs. Upstream opens a program dialog (Watch / Record) on a program card. Until the
//    Live TV feature registers `registerSearchProgramHandler`, a program card plays its channel
//    (`BaseItem.destination()` for a program).
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useSyncExternalStore } from 'react'
import type { DiscoverItemCardProps } from '../../ui'

export type SearchDiscoverResult = {
  /** Stable key within one result list (e.g. `movie:603`). */
  key: string
  /** Where a click goes: the Jellyfin item when Seerr reports one, else the discovered-item page. */
  href: string
  /** Card content; actions and sizing are added by the search page. */
  card: Pick<DiscoverItemCardProps, 'title' | 'subtitle' | 'posterSrc' | 'mediaType' | 'typeLabel' | 'availability' | 'availabilityLabel'>
}

export type SearchDiscoverProvider = {
  /** Notifies when `isActive()` or `cacheKey()` may have changed. */
  subscribe: (onChange: () => void) => () => void
  /** Seerr is configured and signed in (upstream `SeerrService.active`). */
  isActive: () => boolean
  /** Distinguishes cached results per Seerr server/user. */
  cacheKey: () => string
  search: (query: string, signal: AbortSignal) => Promise<SearchDiscoverResult[]>
}

export type SearchProgramHandler = (program: BaseItemDto, navigate: (path: string) => void) => void

let discoverProvider: SearchDiscoverProvider | null = null
let programHandler: SearchProgramHandler | null = null
const listeners = new Set<() => void>()
let unsubscribeProvider: (() => void) | null = null
let version = 0

function emit() {
  version++
  listeners.forEach((l) => l())
}

/** Installs the Seerr provider (replaces any previous one). Returns an uninstaller. */
export function registerSearchDiscoverProvider(provider: SearchDiscoverProvider): () => void {
  unsubscribeProvider?.()
  discoverProvider = provider
  unsubscribeProvider = provider.subscribe(emit)
  emit()
  return () => {
    if (discoverProvider !== provider) return
    unsubscribeProvider?.()
    unsubscribeProvider = null
    discoverProvider = null
    emit()
  }
}

/** Installs the program-card handler (Live TV's program dialog). Returns an uninstaller. */
export function registerSearchProgramHandler(handler: SearchProgramHandler): () => void {
  programHandler = handler
  return () => {
    if (programHandler === handler) programHandler = null
  }
}

export function getSearchProgramHandler(): SearchProgramHandler | null {
  return programHandler
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** The provider while Seerr is active, else null. Re-renders when the provider or its state changes. */
export function useActiveDiscoverProvider(): { provider: SearchDiscoverProvider; cacheKey: string } | null {
  useSyncExternalStore(subscribe, () => version, () => version)
  if (!discoverProvider || !discoverProvider.isActive()) return null
  return { provider: discoverProvider, cacheKey: discoverProvider.cacheKey() }
}

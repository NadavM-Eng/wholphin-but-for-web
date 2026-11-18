// Port of W/services/TrailerService.kt (spec 05 §11). Local trailers are ordinary items played by the engine
// (`nav.play(trailerId)`); remote ones (YouTube etc.) cannot play in a <video> and are opened in a new tab.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'

export interface RemoteTrailer {
  kind: 'remote'
  /** trailer name, or null when the server has none (UI shows the singular "Trailer" string) */
  name: string | null
  url: string
  /** "YouTube" only for youtube.com / www.youtube.com hosts, like upstream */
  subtitle: string | null
}

export interface LocalTrailer {
  kind: 'local'
  item: BaseItemDto
}

function host(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function rank(name: string): number {
  const n = name.toLowerCase()
  if (n.includes('official trailer') || n.includes('official theatrical trailer')) return 0
  if (n.includes('teaser')) return 10
  if (n.includes('trailer')) return 1
  return 5
}

/** Remote trailers sorted official first, teasers last, then by name. `fallbackName` replaces a null name. */
export function getRemoteTrailers(item: Pick<BaseItemDto, 'RemoteTrailers'>, fallbackName: string): RemoteTrailer[] {
  return (item.RemoteTrailers ?? [])
    .filter((t) => !!t.Url)
    .map((t) => {
      const url = t.Url as string
      const h = host(url)
      return { kind: 'remote' as const, name: t.Name ?? null, url, subtitle: h === 'youtube.com' || h === 'www.youtube.com' ? 'YouTube' : null, sortName: t.Name ?? fallbackName }
    })
    .sort((a, b) => rank(a.sortName) - rank(b.sortName) || (a.sortName < b.sortName ? -1 : a.sortName > b.sortName ? 1 : 0))
    .map(({ sortName: _s, ...t }) => t)
}

export async function getLocalTrailers(api: Api, item: Pick<BaseItemDto, 'Id' | 'LocalTrailerCount'>, userId?: string): Promise<LocalTrailer[]> {
  if (!item.Id || !item.LocalTrailerCount || item.LocalTrailerCount <= 0) return []
  const res = await getLibraryApi(api).getLocalTrailers({ itemId: item.Id, userId })
  return res.data.map((t) => ({ kind: 'local' as const, item: t }))
}

/** Opens a remote trailer the way the web can: a new tab (upstream fires ACTION_VIEW). */
export function openRemoteTrailer(t: RemoteTrailer) {
  window.open(t.url, '_blank', 'noopener,noreferrer')
}

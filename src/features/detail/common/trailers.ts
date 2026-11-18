// W/services/TrailerService.kt: local trailers (items, played by the app) and remote ones (URLs). Pure.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { nav } from '../../../app/nav'

export type Trailer =
  | { kind: 'local'; item: BaseItemDto; name: string }
  | { kind: 'remote'; name: string; url: string; subtitle: string | null }

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

/** `getRemoteTrailers`: name ?: "Trailer"; "YouTube" subtitle for youtube.com hosts; official first, teasers last, then by name. */
export function remoteTrailers(item: Pick<BaseItemDto, 'RemoteTrailers'>, fallbackName: string): Trailer[] {
  return (item.RemoteTrailers ?? [])
    .filter((r) => !!r.Url)
    .map((r) => {
      const url = r.Url as string
      const h = host(url)
      return { kind: 'remote' as const, name: r.Name ?? fallbackName, url, subtitle: h === 'youtube.com' || h === 'www.youtube.com' ? 'YouTube' : null }
    })
    .sort((a, b) => rank(a.name) - rank(b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

export function localTrailers(items: readonly BaseItemDto[], fallbackName: string): Trailer[] {
  return items.map((item) => ({ kind: 'local' as const, item, name: item.Name ?? fallbackName }))
}

/**
 * `TrailerService.onClick`: a local trailer plays in the app; a remote one opens in a new tab (the TV fires
 * ACTION_VIEW, which opens YouTube or a browser).
 */
export function openTrailer(trailer: Trailer, navigate: (path: string) => void) {
  if (trailer.kind === 'local') navigate(nav.play(trailer.item.Id ?? ''))
  else window.open(trailer.url, '_blank', 'noopener,noreferrer')
}

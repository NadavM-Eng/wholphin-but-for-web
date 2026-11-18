// Localized text helpers shared by the Discover components.
import type { TFunction } from 'i18next'
import type { Availability, SeerrLink } from '../../api/seerr'

export type T = (k: string, o?: Record<string, unknown>) => string

/** "Username: <name> (Jellyfin user|Local user)" or "Username: API Key" (`rememberSeerrDialogBody`). */
export function seerrUserLine(link: SeerrLink | null, t: T): string {
  if (!link) return ''
  if (link.method === 'apiKey') return t('web_seerr_username_line', { p1: t('api_key') })
  const kind = t(link.method === 'jellyfin' ? 'seerr_jellyfin_user' : 'seerr_local_user')
  return t('web_seerr_username_line', {
    p1: `${link.username ?? t('unknown')} (${kind})`,
  })
}

/** Accessible name of an availability badge. */
export function availabilityLabel(a: Availability, t: T): string | undefined {
  switch (a) {
    case 'PENDING':
      return t('pending')
    case 'PROCESSING':
      return t('processing')
    case 'PARTIALLY_AVAILABLE':
      return t('web_seerr_partially_available')
    case 'AVAILABLE':
      return t('web_seerr_available')
    default:
      return undefined
  }
}

/** i18next's `t` as the plain `(key, options) => string` the helpers (and src/lib/format) take. */
export function plainT(t: TFunction): T {
  return (k, o) => (o ? t(k, o) : t(k))
}

/** Wraps user text (often Hebrew) in Unicode first-strong isolates before it goes into a UI-language template. */
export const isolate = (s: string) => `\u2068${s}\u2069`

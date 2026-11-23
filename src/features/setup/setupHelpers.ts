import type { TFunction } from 'i18next'
import { SessionError } from '../../api/session'

/** Only same-app relative paths are accepted as post-login redirect targets. */
/**
 * True for a user the server lists as having no password (`GET /Users/Public`: `HasPassword` false).
 * Only an explicit `false` counts: a server that does not say is treated as asking for one.
 */
export function hasNoPassword(user: { HasPassword?: boolean | null }): boolean {
  return user.HasPassword === false
}

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/setup')) return null
  // Browsers read "/\host" as "//host": a backslash in the path, or anything off this origin, is refused.
  if (raw.split(/[?#]/)[0].includes('\\')) return null
  try {
    const base = 'http://same.invalid'
    if (new URL(raw, base).origin !== base) return null
  } catch {
    return null
  }
  return raw
}

const issueKey: Record<string, string> = {
  'invalid-url': 'web_error_invalid_url',
  unreachable: 'web_error_unable_to_connect',
  'invalid-server-info': 'web_error_invalid_server_info',
  'unsupported-version': 'web_error_unsupported_version',
  'invalid-response': 'web_error_invalid_response',
  'invalid-credentials': 'web_error_invalid_credentials',
  expired: 'login_credentials_expired',
  forbidden: 'login_not_authorized',
}

/** User-facing message for a SessionError (upstream SwitchServerViewModel / SwitchUserViewModel texts). */
export function sessionErrorMessage(t: TFunction, err: unknown): string {
  if (!(err instanceof SessionError)) return err instanceof Error ? err.message : String(err)
  const key = issueKey[err.kind]
  const head = key ? t(key) : `${t('web_error_login')}: ${err.message}`
  if (!err.tried.length) return head
  return `${head}\n${triedLines(t, err)}`
}

function triedLines(t: TFunction, err: SessionError): string {
  const lines = err.tried.map((a) => {
    // Upstream lists only the first issue of each address (SwitchServerViewModel.kt:226-245).
    const first = a.issues[0]
    // The address is a left-to-right token: isolated, so an RTL line keeps its trailing slash in place.
    return `\u2066${a.address}\u2069 - ${first ? t(issueKey[first] ?? first) : String(null)}`
  })
  return `${t('web_error_tried_addresses')}\n${lines.join('\n')}`
}

/**
 * Inline error of the manual add-server form (SwitchServerViewModel.addServer): "Error, tried addresses:"
 * plus one line per candidate, "Server returned invalid response", or the exception text.
 */
export function addServerErrorMessage(t: TFunction, err: unknown): string {
  if (err instanceof SessionError) {
    if (err.kind === 'invalid-response') return t('web_error_invalid_response')
    if (err.tried.length) return triedLines(t, err)
    if (err.kind === 'invalid-url') return t('web_error_invalid_url')
  }
  return errorDetail(t, err) ?? t('web_error_title')
}

/** The exception line under an error message (upstream shows `exception.localizedMessage`). */
export function errorDetail(t: TFunction, err: unknown): string | null {
  if (err instanceof SessionError) {
    // Errors built without a message carry their kind as message: show the readable text instead.
    if (err.message === err.kind) return issueKey[err.kind] ? t(issueKey[err.kind]) : null
    return err.message || null
  }
  if (err instanceof Error) return err.message || null
  return err == null ? null : String(err)
}

/**
 * Initial focus for the setup pickers. TV-like (keyboard/remote) devices get the first card focused, as
 * upstream; touch-only devices (no hover) get none, because there is no focus to show there (same rule as Home).
 */
export function focusInitialCard(container: HTMLElement | null) {
  if (typeof matchMedia === 'function' && matchMedia('(hover: none)').matches) return
  container?.querySelector<HTMLElement>('[data-card-surface]')?.focus({ preventScroll: true })
}

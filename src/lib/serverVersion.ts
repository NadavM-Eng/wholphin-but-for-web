// The one place that decides whether a server's version is supported and what the notice says. Upstream shows
// the notice on the server picker (SwitchServerContent.kt), the user picker (SwitchUserContent.kt) and at the top
// of every settings screen (PreferencesContent.kt); the setup and settings features both use this module.
import type { TFunction } from 'i18next'
import { MINIMUM_VERSION } from '@jellyfin/sdk/lib/versions'

/** `WholphinApplication.minimumServerVersion` (= the SDK's minimum, Jellyfin.minimumVersion). */
export const MINIMUM_SERVER_VERSION = MINIMUM_VERSION

/**
 * Upstream `ServerVersionSupported` (SwitchServerViewModel.kt:308-313) without NOT_SUPPORTED_IN_FUTURE, which
 * the web never classifies a server as (see classifyServerVersion).
 */
export type ServerVersionSupported = 'SUPPORTED' | 'NOT_SUPPORTED' | 'UNKNOWN'

/** `ServerVersion.fromString`: "major.minor.patch" with an optional 4th build part; anything else is null. */
export function parseServerVersion(raw: string | null | undefined): number[] | null {
  if (!raw) return null
  const parts = raw.trim().split('.')
  if (parts.length < 3 || parts.length > 4) return null
  const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN))
  return nums.some(Number.isNaN) ? null : nums
}

export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Version support tier. A missing/unparseable version is NOT_SUPPORTED on the server picker
 * (SwitchServerViewModel.kt:96-99) and on the settings screens (PreferencesViewModel.kt:82-92), and UNKNOWN on
 * the user picker (SwitchUserViewModel.kt:306-308).
 */
export function classifyServerVersion(
  version: string | null | undefined,
  whenMissing: 'NOT_SUPPORTED' | 'UNKNOWN',
): ServerVersionSupported {
  const v = parseServerVersion(version)
  if (!v) return whenMissing
  if (compareVersions(v, parseServerVersion(MINIMUM_SERVER_VERSION)!) < 0) return 'NOT_SUPPORTED'
  // Deviation (web): upstream also returns NOT_SUPPORTED_IN_FUTURE below its newMinimumServerVersion
  // (12.0.0, WholphinApplication.kt), i.e. "will not be supported soon" for every current Jellyfin server, in all three places. That
  // announces a future requirement of the Android app's SDK, which means nothing for this port, so only the
  // hard minimum above is enforced here.
  return 'SUPPORTED'
}

/** `Resources.serverSupportedMessage` (Formatting.kt:333-380) for the tiers the web has; null when supported. */
export function serverSupportedMessage(
  t: TFunction,
  supported: ServerVersionSupported,
  version: string | null | undefined,
): string | null {
  if (supported === 'SUPPORTED') return null
  const parsed = parseServerVersion(version)
  const shown = parsed ? parsed.join('.') : t('unknown')
  return `${t('server_version_not_supported')}: ${shown}\n${t('server_version_required', { p1: MINIMUM_SERVER_VERSION })}`
}

/** The notice at the top of the settings screens (PreferencesViewModel.serverSupported), or null. */
export function settingsServerNotice(t: TFunction, version: string | null | undefined): string | null {
  return serverSupportedMessage(t, classifyServerVersion(version, 'NOT_SUPPORTED'), version)
}

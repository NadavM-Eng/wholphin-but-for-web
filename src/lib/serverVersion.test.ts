import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { classifyServerVersion, parseServerVersion, serverSupportedMessage, settingsServerNotice } from './serverVersion'

// Echo translator: "key" or "key(p1)".
const t = ((key: string, opts?: { p1?: string }) => (opts?.p1 != null ? `${key}(${opts.p1})` : key)) as unknown as TFunction

describe('server version', () => {
  it('parses ServerVersion strings', () => {
    expect(parseServerVersion('10.11.11')).toEqual([10, 11, 11])
    expect(parseServerVersion('10.9.0.1')).toEqual([10, 9, 0, 1])
    expect(parseServerVersion('10.9')).toBeNull()
    expect(parseServerVersion('abc')).toBeNull()
    expect(parseServerVersion(null)).toBeNull()
  })

  it('classifies like SwitchServerViewModel / SwitchUserViewModel', () => {
    expect(classifyServerVersion('10.9.11', 'UNKNOWN')).toBe('NOT_SUPPORTED')
    // web: no "will not be supported soon" tier (see serverVersion.ts)
    expect(classifyServerVersion('10.10.0', 'UNKNOWN')).toBe('SUPPORTED')
    expect(classifyServerVersion('10.11.11', 'UNKNOWN')).toBe('SUPPORTED')
    expect(classifyServerVersion('12.0.0', 'UNKNOWN')).toBe('SUPPORTED')
    expect(classifyServerVersion(null, 'NOT_SUPPORTED')).toBe('NOT_SUPPORTED')
    expect(classifyServerVersion(undefined, 'UNKNOWN')).toBe('UNKNOWN')
  })

  it('builds serverSupportedMessage', () => {
    expect(serverSupportedMessage(t, 'SUPPORTED', '12.0.0')).toBeNull()
    expect(serverSupportedMessage(t, 'NOT_SUPPORTED', '10.9.11')).toBe(
      'server_version_not_supported: 10.9.11\nserver_version_required(10.10.0)',
    )
    expect(serverSupportedMessage(t, 'UNKNOWN', null)).toBe(
      'server_version_not_supported: unknown\nserver_version_required(10.10.0)',
    )
  })

  it('settings notice: the same tiers as the setup screens, none for a current server', () => {
    // every Jellyfin below 12.0.0 got the red "will not be supported soon" notice here before
    expect(settingsServerNotice(t, '10.10.0')).toBeNull()
    expect(settingsServerNotice(t, '10.11.2')).toBeNull()
    expect(settingsServerNotice(t, '12.1.0')).toBeNull()
    // the real tier still shows: a server below the minimum, and a version that cannot be read
    const tooOld = 'server_version_not_supported: 10.9.11\nserver_version_required(10.10.0)'
    const unknown = 'server_version_not_supported: unknown\nserver_version_required(10.10.0)'
    expect(settingsServerNotice(t, '10.9.11')).toBe(tooOld)
    expect(settingsServerNotice(t, null)).toBe(unknown)
    expect(settingsServerNotice(t, 'nightly')).toBe(unknown)
  })
})

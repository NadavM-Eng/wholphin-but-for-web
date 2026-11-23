import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { SessionError } from '../../api/session'
import { isPinLongEnough, pinKeyFor, profileProtectionOf } from './pin'
import { addServerErrorMessage, errorDetail, hasNoPassword, safeNext } from './setupHelpers'

// Echo translator: "key" or "key(p1)".
const t = ((key: string, opts?: { p1?: string }) => (opts?.p1 != null ? `${key}(${opts.p1})` : key)) as unknown as TFunction

describe('pin', () => {
  it('maps keys to PIN characters', () => {
    expect(pinKeyFor('ArrowUp')).toBe('U')
    expect(pinKeyFor('ArrowRight')).toBe('R')
    expect(pinKeyFor('ArrowDown')).toBe('D')
    expect(pinKeyFor('ArrowLeft')).toBe('L')
    expect(pinKeyFor('7')).toBe('7')
    expect(pinKeyFor('a')).toBeNull()
    expect(pinKeyFor('Enter')).toBeNull()
  })

  it('requires 4 keys', () => {
    expect(isPinLongEnough('12U')).toBe(false)
    expect(isPinLongEnough('12UL')).toBe(true)
  })

  it('derives protection login > pin > none', () => {
    expect(profileProtectionOf({ pin: '1234', requireLogin: true })).toBe('LOGIN')
    expect(profileProtectionOf({ pin: '1234', requireLogin: false })).toBe('PIN')
    expect(profileProtectionOf({ pin: '  ', requireLogin: false })).toBe('NONE')
  })
})

describe('setup helpers', () => {
  it('a user has no password only when the server says so', () => {
    expect(hasNoPassword({ HasPassword: false })).toBe(true)
    expect(hasNoPassword({ HasPassword: true })).toBe(false)
    // an older or stripped-down answer: assume a password, the login dialog opens
    expect(hasNoPassword({})).toBe(false)
    expect(hasNoPassword({ HasPassword: null })).toBe(false)
  })

  it('accepts only in-app next targets', () => {
    expect(safeNext('/item/1?x=2')).toBe('/item/1?x=2')
    expect(safeNext('//evil.example')).toBeNull()
    expect(safeNext('https://evil.example')).toBeNull()
    expect(safeNext('/setup/users')).toBeNull()
    expect(safeNext('/\\evil.example/x')).toBeNull()
    expect(safeNext('/\t/evil.example')).toBeNull()
    expect(safeNext('/search?q=a\\b')).toBe('/search?q=a\\b')
    expect(safeNext(null)).toBeNull()
  })

  it('formats add-server errors as upstream', () => {
    const err = new SessionError('unreachable', undefined, {
      tried: [
        { address: 'https://x:8920', issues: ['unreachable', 'invalid-server-info'] },
        { address: 'http://x:8096', issues: ['invalid-server-info'] },
      ],
    })
    expect(addServerErrorMessage(t, err)).toBe(
      'web_error_tried_addresses\n\u2066https://x:8920\u2069 - web_error_unable_to_connect\n\u2066http://x:8096\u2069 - web_error_invalid_server_info',
    )
    expect(addServerErrorMessage(t, new SessionError('invalid-response'))).toBe('web_error_invalid_response')
  })

  it('shows readable details for message-less errors', () => {
    expect(errorDetail(t, new SessionError('invalid-response'))).toBe('web_error_invalid_response')
    expect(errorDetail(t, new SessionError('unreachable', 'Network Error'))).toBe('Network Error')
  })
})

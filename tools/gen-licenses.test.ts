import { describe, expect, it } from 'vitest'
import { authorName } from './gen-licenses.ts'

describe('authorName', () => {
  it('drops the e-mail and URL of an npm person string', () => {
    expect(authorName('Yusuke Wada <yusuke@example.com> (https://github.com/yusukebe)')).toBe('Yusuke Wada')
    expect(authorName('Josh Junon (https://github.com/qix-)')).toBe('Josh Junon')
    expect(authorName({ name: 'Fonticons, Inc.' })).toBe('Fonticons, Inc.')
  })

  it('returns null when only contact details are given', () => {
    expect(authorName('<someone@example.com>')).toBeNull()
    expect(authorName(undefined)).toBeNull()
  })
})

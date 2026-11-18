import { describe, expect, it } from 'vitest'
import { resolveCustomEndpointUrl } from './rowFetchers'

const href = (base: string, ep: string) => resolveCustomEndpointUrl(base, ep)?.toString() ?? null

describe('resolveCustomEndpointUrl', () => {
  it('resolves relative paths under the base path', () => {
    expect(href('http://localhost:8096', '/Items')).toBe('http://localhost:8096/Items')
    expect(href('http://localhost:8096/jf/', 'Items/Latest')).toBe('http://localhost:8096/jf/Items/Latest')
    expect(href('http://localhost:8096/jf', '/Items')).toBe('http://localhost:8096/jf/Items')
  })

  it('never resolves outside the server and its base path', () => {
    for (const ep of [
      'http://evil.example/Items',
      ' https://evil.example/Items',
      '//evil.example/Items',
      ' //evil.example/Items',
      '\t//evil.example/Items',
      '\\evil.example/Items',
      '/\\evil.example/Items',
      '../other/Items',
      '%2e%2e/other',
      'javascript:alert(1)',
    ]) {
      const url = href('http://localhost:8096/jf/', ep)
      expect(url === null || url.startsWith('http://localhost:8096/jf/'), `${ep} -> ${url}`).toBe(true)
    }
  })

  it('rejects absolute and protocol-relative forms', () => {
    for (const ep of ['http://evil.example/Items', ' https://evil.example/Items', '\\\\evil.example/Items', '/\\\\evil.example/Items']) {
      expect(href('http://localhost:8096', ep), ep).toBeNull()
    }
  })
})

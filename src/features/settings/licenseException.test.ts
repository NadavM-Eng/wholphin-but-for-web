import { describe, expect, it } from 'vitest'
import { LICENSE_EXCEPTION, parseExceptionText } from './licenseException'

describe('license exception text', () => {
  it('reduces the markdown to headings and paragraphs', () => {
    expect(parseExceptionText('# Title\n\nOne `code`\nline two.\n\n## Sub\n\nLast.\n')).toEqual([
      { kind: 'paragraph', text: 'One code line two.' },
      { kind: 'heading', text: 'Sub' },
      { kind: 'paragraph', text: 'Last.' },
    ])
  })

  it('carries the text of the root LICENSE-EXCEPTION.md', () => {
    const text = LICENSE_EXCEPTION.map((b) => b.text).join('\n')
    expect(LICENSE_EXCEPTION.length).toBeGreaterThan(2)
    expect(text).toContain('As a special exception')
    expect(text).toContain('Apache License, Version 2.0')
    expect(text).not.toMatch(/[`#]/)
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// The oldest supported engines (Chrome/Edge 119, Firefox 128) know neither :dir() nor text-box. A selector list
// with :dir() in it is dropped whole by Chrome 119, and Firefox 128 skips text-box, so the app's stylesheets use the
// document's dir attribute and the exact trimming helpers of src/theme/global.css (t-line, t-trim) instead.
// vitest runs from the repository root (the jsdom environment gives import.meta.url an http scheme)
const SRC = join(process.cwd(), 'src')

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return cssFiles(p)
    return e.name.endsWith('.css') ? [p] : []
  })
}

const sheets = cssFiles(SRC).map((file) => ({
  file: relative(SRC, file).replaceAll('\\', '/'),
  css: readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
}))

describe('stylesheets for the oldest supported engines', () => {
  it('finds the stylesheets', () => {
    expect(sheets.length).toBeGreaterThan(50)
  })

  it('use no :dir() selector', () => {
    expect(sheets.filter((s) => /:dir\(/.test(s.css)).map((s) => s.file)).toEqual([])
  })

  it('trim text with text-box only in the kit helper (t-trimBox) and its resets', () => {
    const uses = sheets.flatMap((s) =>
      [...s.css.matchAll(/text-box(?:-trim|-edge)?\s*:\s*([^;}]+)/g)].filter((m) => m[1].trim() !== 'normal').map(() => s.file),
    )
    expect(uses).toEqual(['theme/global.css'])
  })
})

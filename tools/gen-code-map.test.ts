import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('docs/CODE-MAP.md', () => {
  // The map is only worth having while it is true. When this fails: run `npm run map` (a file was added, moved or
  // its comment changed), or correct the entry of tools/code-map/ that names a file that is gone.
  it('is up to date, and every file its hand-kept lists name exists', () => {
    let output = ''
    let ok = true
    try {
      output = execFileSync(process.execPath, ['tools/gen-code-map.mjs', '--check'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      ok = false
      const err = e as { stdout?: string; stderr?: string }
      output = `${err.stdout ?? ''}${err.stderr ?? ''}`
    }
    expect(ok, output).toBe(true)
  })
})

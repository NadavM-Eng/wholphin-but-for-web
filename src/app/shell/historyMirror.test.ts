import { describe, expect, it } from 'vitest'
import { planDrawerNav, planGoHome, stackPaths, updateStack, type StackEntry } from './historyMirror'

function run(steps: Array<[path: string, type: 'PUSH' | 'REPLACE' | 'POP', idx?: number]>) {
  let entries: (StackEntry | null)[] = []
  let idx = 0
  for (const [path, type, at] of steps) {
    if (type === 'PUSH') idx = idx + 1
    if (at != null) idx = at
    entries = updateStack(entries, idx, path, type)
  }
  return { entries, idx }
}

describe('updateStack', () => {
  it('tracks depth above Home', () => {
    const { entries, idx } = run([
      ['/', 'POP', 0],
      ['/library/a', 'PUSH'],
      ['/item/1', 'PUSH'],
    ])
    expect(entries.map((e) => e?.depth)).toEqual([0, 1, 2])
    expect(stackPaths(entries, idx)).toEqual(['/', '/library/a', '/item/1'])
  })

  it('treats a deep link as one level above an implied Home', () => {
    const { entries } = run([['/item/1', 'POP', 0]])
    expect(entries[0]).toEqual({ path: '/item/1', depth: 1 })
  })

  it('PUSH truncates forward entries', () => {
    const { entries } = run([
      ['/', 'POP', 0],
      ['/a', 'PUSH'],
      ['/b', 'PUSH'],
      ['/a', 'POP', 1],
      ['/c', 'PUSH'],
    ])
    expect(entries.map((e) => e?.path)).toEqual(['/', '/a', '/c'])
  })

  it('REPLACE keeps the depth', () => {
    const { entries } = run([
      ['/', 'POP', 0],
      ['/library/a', 'PUSH'],
      ['/library/b', 'REPLACE'],
    ])
    expect(entries[1]).toEqual({ path: '/library/b', depth: 1 })
  })
})

describe('plans', () => {
  it('drawer navigation from Home pushes, from a drawer page replaces, from deeper pops back first', () => {
    const home = run([['/', 'POP', 0]])
    expect(planDrawerNav(home.entries, home.idx)).toEqual({ kind: 'push' })
    const lib = run([
      ['/', 'POP', 0],
      ['/library/a', 'PUSH'],
    ])
    expect(planDrawerNav(lib.entries, lib.idx)).toEqual({ kind: 'replace' })
    const deep = run([
      ['/', 'POP', 0],
      ['/library/a', 'PUSH'],
      ['/item/1', 'PUSH'],
      ['/item/2', 'PUSH'],
    ])
    expect(planDrawerNav(deep.entries, deep.idx)).toEqual({ kind: 'popThenReplace', delta: -2 })
  })

  it('home pops to the Home entry or reloads when already there', () => {
    const deep = run([
      ['/', 'POP', 0],
      ['/library/a', 'PUSH'],
      ['/item/1', 'PUSH'],
    ])
    expect(planGoHome(deep.entries, deep.idx)).toEqual({ kind: 'pop', delta: -2 })
    expect(planGoHome(deep.entries, 0)).toEqual({ kind: 'reload' })
    const deepLink = run([['/item/1', 'POP', 0]])
    expect(planGoHome(deepLink.entries, 0)).toEqual({ kind: 'push' })
  })
})

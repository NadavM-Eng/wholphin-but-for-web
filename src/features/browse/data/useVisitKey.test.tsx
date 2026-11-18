import { act, cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import { useVisitKey } from './visit'

let seen: { visit: string; key: string }[] = []
let mounts = 0

/** Stands for what the visit key re-creates (the library grid). */
function Keyed() {
  useEffect(() => {
    mounts++
  }, [])
  return null
}

function Probe() {
  const visit = useVisitKey()
  const { key } = useLocation()
  seen.push({ visit, key })
  return <Keyed key={visit} />
}

function setup() {
  seen = []
  mounts = 0
  const router = createMemoryRouter([{ path: '/favorites', element: <Probe /> }], { initialEntries: ['/favorites'] })
  render(<RouterProvider router={router} />)
  const last = () => seen[seen.length - 1]
  return { router, last }
}

describe('useVisitKey', () => {
  afterEach(cleanup)

  it('starts as the location key', () => {
    const { last } = setup()
    expect(last().visit).toBe(last().key)
  })

  it('keeps the key over replace navigations (a tab page writing ?tab=)', async () => {
    const { router, last } = setup()
    const first = last().key
    await act(() => router.navigate('/favorites?tab=Movie', { replace: true }))
    expect(last().key).not.toBe(first)
    expect(last().visit).toBe(first)
    await act(() => router.navigate('/favorites?tab=Series', { replace: true }))
    expect(last().visit).toBe(first)
    // no render saw another visit key in between, and what is keyed by it was built once
    expect(new Set(seen.map((s) => s.visit))).toEqual(new Set([first]))
    expect(mounts).toBe(1)
  })

  it('takes the new key on a push and the entry key on Back', async () => {
    const { router, last } = setup()
    const first = last().key
    await act(() => router.navigate('/favorites?tab=Movie', { replace: true }))
    const replaced = last().key
    await act(() => router.navigate('/favorites?tab=Movie'))
    const pushed = last().key
    expect(pushed).not.toBe(replaced)
    expect(last().visit).toBe(pushed)
    expect(mounts).toBe(2)
    await act(() => router.navigate(-1))
    // Back lands on the entry as the replace left it: its key is the replaced one
    expect(last().key).toBe(replaced)
    expect(last().visit).toBe(replaced)
    expect(last().visit).not.toBe(first)
  })
})

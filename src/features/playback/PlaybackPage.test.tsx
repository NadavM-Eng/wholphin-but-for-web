// The /play address follows the queue without restarting playback: a chain of Next, Next, Next, Previous keeps one session.
import { act, cleanup, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlaybackStore, type PlaybackDestination } from './engine'
import PlaybackPage from './PlaybackPage'

const sessions = vi.hoisted(() => ({ keys: [] as (string | null)[] }))
vi.mock('./engine/usePlaybackSession', () => ({
  usePlaybackSession: (dest: PlaybackDestination | null) => {
    const key = dest ? JSON.stringify(dest) : null
    if (sessions.keys[sessions.keys.length - 1] !== key) sessions.keys.push(key)
  },
}))
vi.mock('./PlayerView', () => ({ PlayerView: () => null }))
vi.mock('../../app/shell', () => ({ useGoBack: () => () => {}, useHideBackButton: () => {} }))

const playing = (id: string) => act(() => usePlaybackStore.setState({ entryKind: 'media', item: { Id: id, Type: 'Episode' } }))

afterEach(() => {
  cleanup()
  sessions.keys = []
  usePlaybackStore.setState({ entryKind: null, item: null })
})

describe('PlaybackPage (the address follows the queue)', () => {
  it('a chain of transitions keeps the session that started, and the address names the item playing', async () => {
    const router = createMemoryRouter([{ path: '/play/:itemId', element: <PlaybackPage /> }], { initialEntries: ['/play/e1'] })
    render(<RouterProvider router={router} />)
    const path = () => router.state.location.pathname
    await playing('e1')
    for (const id of ['e2', 'e3', 'e4', 'e3']) {
      await playing(id)
      expect(path()).toBe(`/play/${id}`)
    }
    // before the fix the second step started e2, then e1 again (back to the first episode at 0:00)
    expect(sessions.keys).toEqual([JSON.stringify({ kind: 'item', itemId: 'e1', positionMs: 0, forceTranscode: false, shuffle: false })])
  })

  it('a reload of a followed address starts that item, and the chain goes on from it', async () => {
    const router = createMemoryRouter([{ path: '/play/:itemId', element: <PlaybackPage /> }], {
      initialEntries: [{ pathname: '/play/e3', state: { playbackFollowsQueue: true } }],
    })
    render(<RouterProvider router={router} />)
    await playing('e3')
    await playing('e4')
    await playing('e5')
    expect(router.state.location.pathname).toBe('/play/e5')
    expect(sessions.keys).toHaveLength(1)
    expect(sessions.keys[0]).toContain('"itemId":"e3"')
  })
})

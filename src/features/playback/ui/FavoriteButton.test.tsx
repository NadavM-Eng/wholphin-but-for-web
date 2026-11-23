// The player's favourite button (web addition). It goes through the app's one favourite action (useItemActions),
// which patches the query caches; the playback store's own copies of the item follow those patches (engine.ts,
// onItemPatched). Here the real action and the real store, with only the server call replaced.
import type { BaseItemDto, UserItemDataDto } from '@jellyfin/sdk/lib/generated-client/models'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../../../app/toast'
import { initI18n } from '../../../i18n'
import { useSessionStore, type CurrentSession } from '../../../stores/session'
import { usePlaybackStore, type QueueEntry } from '../engine'
import { FavoriteButton } from './FavoriteButton'

const server = vi.hoisted(() => ({ markFavoriteItem: vi.fn(), unmarkFavoriteItem: vi.fn() }))
vi.mock('@jellyfin/sdk/lib/utils/api/user-data-api', () => ({ getUserDataApi: () => server }))

const setFavorite = vi.hoisted(() => vi.fn())
vi.mock('../../common/useItemActions', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../common/useItemActions')>()
  return {
    ...original,
    // the real action, with its calls recorded
    useItemActions: () => {
      const real = original.useItemActions()
      return {
        ...real,
        setFavorite: (item: BaseItemDto, favorite: boolean) => {
          setFavorite(item, favorite)
          return real.setFavorite(item, favorite)
        },
      }
    },
  }
})

const ADD = 'Favorite'
const REMOVE = 'Unfavorite'

const ud = (data: Partial<UserItemDataDto>) => data as UserItemDataDto
const movie = (fav: boolean): BaseItemDto => ({ Id: 'm1', Type: 'Movie', Name: 'Coffee Run', UserData: ud({ IsFavorite: fav, Played: true }) })
const other: BaseItemDto = { Id: 'm2', Type: 'Movie', Name: 'Night Shift', UserData: ud({ IsFavorite: true }) }
const entries = (...items: BaseItemDto[]): QueueEntry[] => items.map((item) => ({ kind: 'media', item }))

const initial = usePlaybackStore.getState()
let qc: QueryClient

beforeAll(() => initI18n('en'))
beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  useSessionStore.setState({ current: { server: { id: 'srv' }, user: { id: 'u1' }, api: {} } as unknown as CurrentSession })
  server.markFavoriteItem.mockResolvedValue({ data: { IsFavorite: true } })
  server.unmarkFavoriteItem.mockResolvedValue({ data: { IsFavorite: false } })
})
afterEach(() => {
  cleanup()
  usePlaybackStore.setState(initial, true)
  useSessionStore.setState({ current: null })
  useToastStore.setState({ toasts: [] })
  vi.clearAllMocks()
})

function play(item: BaseItemDto | null, more: Partial<ReturnType<typeof usePlaybackStore.getState>> = {}) {
  usePlaybackStore.setState({ item, entryKind: item ? 'media' : null, queue: item ? entries(item) : [], ...more })
}

function mount() {
  const onInteract = vi.fn()
  const { container } = render(
    <QueryClientProvider client={qc}>
      <FavoriteButton onInteract={onInteract} />
    </QueryClientProvider>,
  )
  const button = () => container.querySelector<HTMLButtonElement>('[data-player-button="favorite"]')
  return { container, button, onInteract }
}

const pressed = (b: HTMLButtonElement | null) => b?.getAttribute('aria-pressed')
const storeFavorite = () => usePlaybackStore.getState().item?.UserData?.IsFavorite
/** A server call that stays open until the test settles it. */
function pending() {
  let resolve!: (v: unknown) => void
  let reject!: (e: unknown) => void
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))

describe('the player favourite button', () => {
  it('is one flat strip button named by what a click will do, pressed when the item is a favourite', () => {
    play(movie(false))
    const off = mount()
    expect(off.container.querySelectorAll('button').length).toBe(1)
    expect(off.button()!.getAttribute('aria-label')).toBe(ADD)
    expect(off.button()!.getAttribute('title')).toBe(ADD)
    expect(pressed(off.button())).toBe('false')
    expect(off.button()!.className).toMatch(/flat/)
    expect(off.button()!.hasAttribute('data-focusable')).toBe(true)
    expect(off.button()!.querySelector('span')!.style.color).toBe('')
    cleanup()

    play(movie(true))
    const on = mount()
    expect(on.button()!.getAttribute('aria-label')).toBe(REMOVE)
    expect(on.button()!.getAttribute('title')).toBe(REMOVE)
    expect(pressed(on.button())).toBe('true')
    // the detail pages' heart, in their colour
    expect(on.button()!.querySelector('span')!.style.color).toBe('var(--fx-favorite-active)')
    expect(on.button()!.querySelector('span')!.textContent).toBe('')
  })

  it('a click calls the favourite action with the playing item and the opposite value, and keeps the controls up', async () => {
    play(movie(false))
    const { button, onInteract } = mount()
    fireEvent.click(button()!)
    expect(setFavorite).toHaveBeenCalledTimes(1)
    expect(setFavorite).toHaveBeenCalledWith(expect.objectContaining({ Id: 'm1' }), true)
    expect(onInteract).toHaveBeenCalledTimes(1)
    await settle()
    expect(server.markFavoriteItem).toHaveBeenCalledWith({ itemId: 'm1', userId: 'u1' })
    expect(server.unmarkFavoriteItem).not.toHaveBeenCalled()

    // and back: the value is taken from the state shown now
    fireEvent.click(button()!)
    expect(setFavorite).toHaveBeenLastCalledWith(expect.objectContaining({ Id: 'm1' }), false)
    expect(onInteract).toHaveBeenCalledTimes(2)
    await settle()
    expect(server.unmarkFavoriteItem).toHaveBeenCalledWith({ itemId: 'm1', userId: 'u1' })
    expect(pressed(button())).toBe('false')
  })

  it('flips at once, before the server answers, in the store item and in its queue entry', async () => {
    const call = pending()
    server.markFavoriteItem.mockReturnValue(call.promise)
    const item = movie(false)
    usePlaybackStore.setState({ item, entryKind: 'media', queue: entries(other, { ...item }), index: 1 })
    const before = usePlaybackStore.getState().queue
    const { button } = mount()

    fireEvent.click(button()!)
    expect(pressed(button())).toBe('true')
    expect(button()!.getAttribute('aria-label')).toBe(REMOVE)
    expect(storeFavorite()).toBe(true)
    const queue = usePlaybackStore.getState().queue
    expect(queue[1].item.UserData?.IsFavorite).toBe(true)
    // nothing else of the item is lost and the other entry is the same object
    expect(usePlaybackStore.getState().item).toMatchObject({ Id: 'm1', Name: 'Coffee Run', UserData: { Played: true } })
    expect(queue[0]).toBe(before[0])

    await act(async () => call.resolve({ data: { IsFavorite: true, Played: true, PlayCount: 3 } }))
    await settle()
    expect(pressed(button())).toBe('true')
    // the server's answer is merged in
    expect(usePlaybackStore.getState().item?.UserData).toMatchObject({ IsFavorite: true, PlayCount: 3 })
  })

  it('goes back when the server refuses, and says so', async () => {
    const call = pending()
    server.unmarkFavoriteItem.mockReturnValue(call.promise)
    const item = movie(true)
    usePlaybackStore.setState({ item, entryKind: 'media', queue: entries({ ...item }, other) })
    const { button } = mount()

    fireEvent.click(button()!)
    expect(pressed(button())).toBe('false')
    expect(storeFavorite()).toBe(false)

    await act(async () => call.reject(new Error('boom')))
    await settle()
    expect(pressed(button())).toBe('true')
    expect(button()!.getAttribute('aria-label')).toBe(REMOVE)
    expect(storeFavorite()).toBe(true)
    expect(usePlaybackStore.getState().queue[0].item.UserData?.IsFavorite).toBe(true)
    expect(useToastStore.getState().toasts.map((t) => t.message).join()).toContain('boom')
  })

  it('patches the cached copies as every other favourite button does', async () => {
    play(movie(false))
    qc.setQueryData(['srv', 'u1', 'item', 'm1'], movie(false))
    const { button } = mount()
    fireEvent.click(button()!)
    expect(qc.getQueryData<BaseItemDto>(['srv', 'u1', 'item', 'm1'])?.UserData?.IsFavorite).toBe(true)
    await settle()
  })

  it('is not there without an item, for an intro, a trailer or a guide programme; a channel has it', () => {
    const shown = (item: BaseItemDto | null, more: Parameters<typeof play>[1] = {}) => {
      play(item, more)
      const there = mount().button() != null
      cleanup()
      return there
    }
    expect(shown(null)).toBe(false)
    expect(shown({ Type: 'Movie', Name: 'No id' })).toBe(false)
    expect(shown(movie(false))).toBe(true)
    // cinema mode: the queue entry before the film
    expect(shown({ Id: 'i1', Type: 'Video' }, { entryKind: 'intro' })).toBe(false)
    expect(shown({ Id: 'i2', Type: 'Trailer' }, { entryKind: 'intro' })).toBe(false)
    // a local trailer played from the detail page
    expect(shown({ Id: 't1', Type: 'Trailer' })).toBe(false)
    expect(shown({ Id: 't2', Type: 'Video', ExtraType: 'Trailer' })).toBe(false)
    expect(shown({ Id: 'p1', Type: 'TvProgram' })).toBe(false)
    expect(shown({ Id: 'p2', Type: 'Program' })).toBe(false)
    // Live TV plays the channel, which the guide can mark too
    expect(shown({ Id: 'c1', Type: 'TvChannel' }, { isLiveTv: true })).toBe(true)
    expect(shown({ Id: 'e1', Type: 'Episode' })).toBe(true)
    expect(shown({ Id: 'r1', Type: 'Recording' })).toBe(true)
    // an item without user data counts as not a favourite
    play({ Id: 'x1', Type: 'Movie' })
    expect(pressed(mount().button())).toBe('false')
  })

  it('needs no session and no query client while nothing can be marked', () => {
    useSessionStore.setState({ current: null })
    play(null)
    const { container } = render(<FavoriteButton onInteract={() => {}} />)
    expect(container.innerHTML).toBe('')
  })

  it('follows the store: the next entry shows its own state, and coming back shows what was set', async () => {
    const first = movie(false)
    usePlaybackStore.setState({ item: first, entryKind: 'media', queue: entries({ ...first }, other), index: 0 })
    const { button } = mount()
    expect(pressed(button())).toBe('false')
    fireEvent.click(button()!)
    await settle()
    expect(pressed(button())).toBe('true')

    // the queue moves on
    act(() => usePlaybackStore.setState({ item: other, index: 1 }))
    expect(pressed(button())).toBe('true')
    expect(button()!.getAttribute('aria-label')).toBe(REMOVE)
    fireEvent.click(button()!)
    expect(setFavorite).toHaveBeenLastCalledWith(expect.objectContaining({ Id: 'm2' }), false)
    expect(pressed(button())).toBe('false')
    await settle()
    expect(server.unmarkFavoriteItem).toHaveBeenCalledWith({ itemId: 'm2', userId: 'u1' })

    // and back to the first entry, from the queue's copy (what the engine plays when its reload fails)
    act(() => usePlaybackStore.setState({ item: usePlaybackStore.getState().queue[0].item, index: 0 }))
    expect(pressed(button())).toBe('true')

    // an intro in between hides it, the film after it brings it back
    act(() => usePlaybackStore.setState({ entryKind: 'intro' }))
    expect(button()).toBeNull()
    act(() => usePlaybackStore.setState({ entryKind: 'media' }))
    expect(pressed(button())).toBe('true')
  })

  // engine.ts playEntry: `index`, `entryKind` and status 'loading' change at once, `item` when the entry's full
  // item has arrived. In between the store's item is the entry before.
  it('while the next entry loads it shows that entry, disabled: a click marks neither it nor the entry before', async () => {
    const first = movie(false)
    usePlaybackStore.setState({ item: first, entryKind: 'media', queue: entries({ ...first }, other), index: 0, status: 'playing' })
    const { button, onInteract } = mount()
    expect(button()!.hasAttribute('aria-disabled')).toBe(false)

    // Next: the engine has moved on, the full item of the second entry is on its way
    act(() => usePlaybackStore.setState({ index: 1, entryKind: 'media', status: 'loading' }))
    expect(usePlaybackStore.getState().item?.Id).toBe('m1')
    expect(button()!.getAttribute('aria-disabled')).toBe('true')
    // the second entry's own state (a favourite), not the first one's
    expect(pressed(button())).toBe('true')
    expect(button()!.getAttribute('aria-label')).toBe(REMOVE)
    fireEvent.click(button()!)
    await settle()
    expect(setFavorite).not.toHaveBeenCalled()
    expect(server.markFavoriteItem).not.toHaveBeenCalled()
    expect(server.unmarkFavoriteItem).not.toHaveBeenCalled()
    expect(onInteract).not.toHaveBeenCalled()
    expect(usePlaybackStore.getState().item?.UserData?.IsFavorite).toBe(false)

    // the item arrives (ids with dashes or without are the same item): the button works, on the second entry
    act(() => usePlaybackStore.setState({ item: { ...other, Id: 'M2', MediaSources: [] }, status: 'playing' }))
    expect(button()!.hasAttribute('aria-disabled')).toBe(false)
    fireEvent.click(button()!)
    expect(setFavorite).toHaveBeenCalledTimes(1)
    expect(setFavorite).toHaveBeenCalledWith(expect.objectContaining({ Id: 'M2' }), false)
    await settle()
  })

  it('between a cinema intro and the film it never marks the intro; before the first item arrives it is disabled', async () => {
    const intro: BaseItemDto = { Id: 'i1', Type: 'Video', Name: 'Pre-roll', UserData: ud({ IsFavorite: false }) }
    const film = movie(false)
    const queue: QueueEntry[] = [{ kind: 'intro', item: intro }, { kind: 'media', item: film }]
    // the intro plays: no button
    usePlaybackStore.setState({ item: intro, entryKind: 'intro', queue, index: 0, status: 'playing' })
    const { button } = mount()
    expect(button()).toBeNull()
    // the intro ended, the film loads: the store's item is still the intro
    act(() => usePlaybackStore.setState({ index: 1, entryKind: 'media', status: 'loading' }))
    expect(button()!.getAttribute('aria-disabled')).toBe('true')
    expect(button()!.getAttribute('aria-label')).toBe(ADD)
    fireEvent.click(button()!)
    await settle()
    expect(setFavorite).not.toHaveBeenCalled()
    expect(server.markFavoriteItem).not.toHaveBeenCalled()
    act(() => usePlaybackStore.setState({ item: { ...film }, status: 'playing' }))
    fireEvent.click(button()!)
    expect(setFavorite).toHaveBeenCalledWith(expect.objectContaining({ Id: 'm1' }), true)
    await settle()
    cleanup()

    // the very first load: the queue is there, the item not yet
    usePlaybackStore.setState({ ...initial, item: null, entryKind: 'media', queue: entries(other), index: 0, status: 'loading' }, true)
    const first = mount()
    expect(first.button()!.getAttribute('aria-disabled')).toBe('true')
    expect(pressed(first.button())).toBe('true')
    // an entry that cannot be marked shows nothing while it loads either
    act(() => usePlaybackStore.setState({ queue: entries({ Id: 't9', Type: 'Trailer' }) }))
    expect(first.button()).toBeNull()
  })

  it('stays right through unrelated store updates and re-renders (a seek, a sheet)', async () => {
    play(movie(false))
    const { button } = mount()
    fireEvent.click(button()!)
    await settle()
    act(() => usePlaybackStore.setState({ positionMs: 60_000, paused: true, chapters: [{ index: 0, startMs: 0, name: null, imageTag: null }] }))
    expect(pressed(button())).toBe('true')
    expect(storeFavorite()).toBe(true)
  })
})

describe('the playback store and item patches', () => {
  it('a favourite change made elsewhere reaches the playing item, its queue entry and next up; ids match with or without dashes', async () => {
    const { patchItemInCaches, withUserData } = await import('../../common/itemCache')
    const dashed = '0f8fad5b-d9cb-469f-a165-70867728950e'
    const plain = dashed.replace(/-/g, '')
    const item: BaseItemDto = { Id: plain, Type: 'Episode', UserData: ud({ IsFavorite: false }) }
    usePlaybackStore.setState({ item, entryKind: 'media', queue: entries(other, { ...item }), nextUp: { index: 1, item: { ...item }, countdown: null } })
    patchItemInCaches(qc, dashed, (i) => withUserData(i, { IsFavorite: true }))
    const st = usePlaybackStore.getState()
    expect(st.item?.UserData?.IsFavorite).toBe(true)
    expect(st.queue[1].item.UserData?.IsFavorite).toBe(true)
    expect(st.queue[1].kind).toBe('media')
    expect(st.nextUp).toMatchObject({ index: 1, countdown: null, item: { UserData: { IsFavorite: true } } })
  })

  it('a change of another item leaves the store untouched', async () => {
    const { patchItemInCaches, withUserData } = await import('../../common/itemCache')
    play(movie(false))
    const before = usePlaybackStore.getState()
    patchItemInCaches(qc, 'zz', (i) => withUserData(i, { IsFavorite: true }))
    expect(usePlaybackStore.getState()).toBe(before)
  })
})

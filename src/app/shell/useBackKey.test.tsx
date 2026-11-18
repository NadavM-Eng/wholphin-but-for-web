import { act, cleanup, render } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router'
import { resetBackKeyForTests, useBackKey } from './useBackKey'

/** A route whose module arrives when the test says so (a lazy page). */
function lazyPage(Component: ComponentType) {
  let arrive!: () => void
  const loaded = new Promise<void>((r) => (arrive = r))
  return { arrive, lazy: { Component: async () => (await loaded, Component) } }
}

let intercepts: string[] = []

/** The shell: on Home, Back opens the drawer instead of leaving. */
function Shell() {
  useBackKey(() => {
    const home = router.state.location.pathname === '/'
    if (home) intercepts.push('home')
    return home
  })
  return <Outlet />
}

let router: ReturnType<typeof createMemoryRouter>
const pressEscape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 0)))

function setup(initial: string[]) {
  intercepts = []
  resetBackKeyForTests()
  const item = lazyPage(() => <p>item</p>)
  router = createMemoryRouter(
    [
      {
        element: <Shell />,
        children: [
          { path: '/', element: <p>home</p> },
          { path: '/library', element: <p>library</p> },
          { path: '/item', ...item },
        ],
      },
    ],
    { initialEntries: initial, initialIndex: initial.length - 1 },
  )
  // useGoBack reads the history index React Router keeps in history.state
  window.history.replaceState({ idx: initial.length - 1 }, '')
  render(<RouterProvider router={router} />)
  return item
}

describe('Back key while a navigation is on its way', () => {
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '')
  })

  it('Back right after opening an item returns from the item, not past the page it was opened from', async () => {
    const item = setup(['/', '/library'])
    void router.navigate('/item')
    expect(router.state.navigation.state).toBe('loading')
    // Escape while the item's module is still loading: nothing happens yet (before: it left the library for Home)
    pressEscape()
    expect(router.state.location.pathname).toBe('/library')
    expect(router.state.navigation.state).toBe('loading')
    // the item opens, and Back is handled there
    window.history.replaceState({ idx: 2 }, '')
    item.arrive()
    await settle()
    await settle()
    expect(router.state.location.pathname).toBe('/library')
    expect(router.state.historyAction).toBe('POP')
  })

  it('on Home the waiting Back is not answered by the Home rule (the drawer): it belongs to the page being opened', async () => {
    const item = setup(['/'])
    void router.navigate('/item')
    pressEscape()
    expect(intercepts).toEqual([])
    window.history.replaceState({ idx: 1 }, '')
    item.arrive()
    await settle()
    await settle()
    expect(intercepts).toEqual([])
    expect(router.state.location.pathname).toBe('/')
  })

  it('a Back whose navigation was replaced by another one is dropped', async () => {
    const item = setup(['/', '/library'])
    void router.navigate('/item')
    pressEscape()
    // the user went somewhere else before the item arrived
    await act(() => router.navigate('/'))
    item.arrive()
    await settle()
    expect(router.state.location.pathname).toBe('/')
    expect(intercepts).toEqual([])
  })

  it('Back after the router is through but before the new page shows is answered by the new page, not by the old one', async () => {
    intercepts = []
    resetBackKeyForTests()
    // like AppShell: the rule reads the location of the page on screen (what React rendered last)
    function RenderedShell() {
      const home = useLocation().pathname === '/'
      useBackKey(() => {
        if (home) intercepts.push('home')
        return home
      })
      return <Outlet />
    }
    router = createMemoryRouter(
      [
        {
          element: <RenderedShell />,
          children: [
            { path: '/', element: <p>home</p> },
            { path: '/library', element: <p>library</p> },
          ],
        },
      ],
      { initialEntries: ['/'] },
    )
    window.history.replaceState({ idx: 0 }, '')
    const view = render(<RouterProvider router={router} />)
    // not inside act(): the router finishes, React has yet to render the new location (a transition)
    await router.navigate('/library')
    expect(router.state.navigation.state).toBe('idle')
    expect(router.state.location.pathname).toBe('/library')
    expect(view.container.textContent).toBe('home')
    pressEscape()
    // before: Home's rule took the key and the library stayed open
    expect(intercepts).toEqual([])
    window.history.replaceState({ idx: 1 }, '')
    await settle()
    await settle()
    expect(intercepts).toEqual([])
    expect(router.state.location.pathname).toBe('/')
    expect(router.state.historyAction).toBe('POP')
  })

  it('without a navigation under way Back acts at once', async () => {
    setup(['/', '/library'])
    pressEscape()
    await settle()
    expect(router.state.location.pathname).toBe('/')
    pressEscape()
    expect(intercepts).toEqual(['home'])
  })
})

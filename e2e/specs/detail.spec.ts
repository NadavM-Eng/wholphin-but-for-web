// Detail pages: the movie page (buttons, rows, chooser dialogs, favourite / watched), mixed-direction metadata,
// the playlist page (view options, arrival focus, moving rows), the box set's focused-item header, and the flows
// that must not really run on the server: delete (mocked DELETE) and "Send media info log" (mocked upload).
// Creating a playlist runs for real on the throwaway server and removes the playlist afterwards.
import type { Page } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'
import type { JellyfinApi } from '../fixtures/api'

/**
 * `app.setPreference`, but through the preferences module instance the app really runs: after an HMR update Vite
 * serves it as `/src/stores/preferences.ts?t=…`, and importing the bare path then gives a second, unbound instance
 * (user-scoped preferences would not be saved for the signed-in user).
 */
async function setPref(page: Page, key: string, value: unknown) {
  await page.evaluate(
    async ([k, v]) => {
      const loaded = performance.getEntriesByType('resource').map((e) => e.name)
      const url = loaded.find((n) => /\/src\/stores\/preferences\.ts(\?|$)/.test(n)) ?? '/src/stores/preferences.ts'
      const mod = (await import(/* @vite-ignore */ url)) as { setPref: (key: string, value: unknown) => void }
      mod.setPref(k as string, v)
    },
    [key, value] as const,
  )
}

const toolbar = (page: Page) => page.locator('[data-page-root]').getByRole('toolbar', { name: 'Play' }).first()
const toast = (page: Page, text: string | RegExp) => page.locator('[role=status], [aria-live]').getByText(text)

async function findPlaylist(api: JellyfinApi, name: string) {
  return api.findItem('Playlist', name)
}

test('movie page: header, play buttons and rows', { tag: [TAG.desktop, TAG.phone, TAG.engines, TAG.iphone] }, async ({ page, app, api }) => {
  const movie = await api.findMovie('Multi Track Showcase')
  await app.goto(`/item/${movie.Id}`)
  const buttons = toolbar(page)
  await expect(buttons.getByRole('button', { name: /^(Play|Resume)$/ })).toBeVisible()
  await expect(buttons.getByRole('button', { name: /^Mark as (watched|unwatched)$/ })).toBeAttached()
  await expect(buttons.getByRole('button', { name: /^(Favorite|Unfavorite)$/ })).toBeAttached()
  await expect(buttons.getByRole('button', { name: /trailer/i })).toBeAttached()
  await expect(buttons.getByRole('button', { name: 'More' })).toBeAttached()
  await expect(page.getByRole('region', { name: 'People' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'More like this' })).toBeAttached()
})

test('movie page: Play takes the arrival focus and Down reaches the rows', { tag: [TAG.keyboard] }, async ({ page, app, api }) => {
  const movie = await api.findMovie('Spring')
  await app.goto(`/item/${movie.Id}`)
  await expect(app.focused).toHaveAccessibleName(/^(Play|Resume)$/)
  await app.press('ArrowDown')
  await expect(app.focused).not.toHaveAccessibleName(/^(Play|Resume)$/)
  await expect.poll(() => app.focused.evaluate((el) => !!el.closest('[role=region], section'))).toBe(true)
  expect(page.url()).toContain(movie.Id)
})

test('the audio and subtitle choosers list the item tracks', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, api }) => {
  const movie = await api.findMovie('Multi Track Showcase')
  await app.goto(`/item/${movie.Id}`)
  await toolbar(page).getByRole('button', { name: 'More' }).click()
  await page.getByText('Choose Audio', { exact: true }).click()
  const audio = page.getByRole('dialog', { name: 'Choose Audio' })
  await expect(audio).toBeVisible()
  await expect(audio).toContainText('French')
  await expect(audio).toContainText('Spanish')
  await page.keyboard.press('Escape')
  await expect(audio).toHaveCount(0)
  // the item menu stays open under its choosers (upstream dismissOnClick = false)
  await page.keyboard.press('Escape')

  await toolbar(page).getByRole('button', { name: 'More' }).click()
  await page.getByText('Choose Subtitles', { exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Choose Subtitles' })).toBeVisible()
})

test('favourite and watched buttons change the server state', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  const movie = await api.findMovie('Coffee Run')
  await api.snapshot(movie.Id)
  await api.setUserData(movie.Id, { IsFavorite: false, Played: false })
  await app.goto(`/item/${movie.Id}`)
  const buttons = toolbar(page)

  await buttons.getByRole('button', { name: 'Favorite', exact: true }).click()
  await expect.poll(async () => (await api.userData(movie.Id)).IsFavorite).toBe(true)
  await expect(buttons.getByRole('button', { name: 'Unfavorite' })).toBeAttached()

  await buttons.getByRole('button', { name: 'Mark as watched' }).click()
  await expect.poll(async () => (await api.userData(movie.Id)).Played).toBe(true)
  await buttons.getByRole('button', { name: 'Mark as unwatched' }).click()
  await expect.poll(async () => (await api.userData(movie.Id)).Played).toBe(false)
})

/** Left / right offsets of an element inside its parent. */
async function edges(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    const p = el.parentElement!.getBoundingClientRect()
    return { start: Math.round(r.left - p.left), end: Math.round(p.right - r.right), dir: getComputedStyle(el).direction, width: Math.round(r.width) }
  })
}

test('mixed-direction metadata keeps its block at the start edge, text in its own direction', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const hebrew = (await api.items({ includeItemTypes: 'Movie', limit: 50 })).find((m) => /[֐-׿]/.test(m.Name ?? ''))
  if (!hebrew) throw new Error('e2e: the test server has no movie with a Hebrew title')
  await app.goto(`/item/${hebrew.Id}`)
  // English interface, Hebrew overview: right-to-left text, block at the left edge of its column
  const overview = await edges(page, '[data-page-root] header [role=button] p[dir=auto]')
  expect(overview.dir).toBe('rtl')
  expect(overview.start).toBeLessThanOrEqual(8)

  // Hebrew interface, English metadata: left-to-right text, block at the right (start) edge
  const movie = await api.findMovie('Spring')
  await app.goto(`/item/${movie.Id}`)
  await setPref(page, 'userInterfaceLanguage', 'he')
  // setLanguage imports he.json first; a reload that aborts that import is an uncaught page error in Firefox
  await expect(page.locator('html')).toHaveAttribute('lang', 'he')
  await page.reload()
  await app.settle()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  const genres = await edges(page, '[data-page-root] header p[dir=auto]')
  expect(genres.dir).toBe('ltr')
  expect(genres.end).toBeLessThanOrEqual(8)
  expect(genres.start).toBeGreaterThan(100)
})

test('playlist: the first row takes focus on a direct load and on a reload', { tag: [TAG.keyboard] }, async ({ page, app, api }) => {
  const playlist = await findPlaylist(api, 'Late Night Mix')
  await app.goto(`/item/${playlist.Id}`)
  const firstRow = page.locator('[data-page-root] [data-grid-index="0"] [data-focusable]').first()
  await expect(firstRow).toBeFocused()
  await page.reload()
  await app.settle()
  await expect(firstRow).toBeFocused()
  await app.press('ArrowDown')
  await expect(page.locator('[data-page-root] [data-grid-index="1"] [data-focusable]').first()).toBeFocused()
})

test('playlist on a touch phone: the hit areas of the row buttons stay off the list item', { tag: [TAG.phone] }, async ({ page, app, api }) => {
  const playlist = await findPlaylist(api, 'Late Night Mix')
  await app.goto(`/item/${playlist.Id}`)
  const row = page.locator('[data-page-root] [data-grid-index="0"]')
  await expect(row.getByRole('button', { name: 'More' })).toBeVisible()
  // what a tap hits just inside the item's end edge, just inside the first button's start edge, and in the gap
  const hit = await row.evaluate((r) => {
    const item = r.querySelector<HTMLElement>('[data-focusable]')!
    const button = r.querySelector<HTMLElement>('button')!
    const a = item.getBoundingClientRect()
    const b = button.getBoundingClientRect()
    const rtl = getComputedStyle(r).direction === 'rtl'
    const y = (a.top + a.bottom) / 2
    const at = (x: number) => {
      const el = document.elementFromPoint(x, y)
      return el?.closest('button') === button ? 'button' : item.contains(el) ? 'item' : 'other'
    }
    return {
      coarse: matchMedia('(pointer: coarse)').matches,
      gap: rtl ? a.left - b.right : b.left - a.right,
      itemEnd: at(rtl ? a.left + 1.5 : a.right - 1.5),
      itemInside: at(rtl ? a.left + 7 : a.right - 7),
      gapNearButton: at(rtl ? b.right + 1 : b.left - 1),
    }
  })
  expect(hit.coarse).toBe(true)
  expect(hit.gap).toBeGreaterThan(0)
  expect(hit.itemEnd).toBe('item')
  expect(hit.itemInside).toBe('item')
  // the hit area still grows beyond the 12dp-wide pill, into the gap
  expect(hit.gapNearButton).toBe('button')
})

test('playlist: view options switch between list, dense list and grid and are kept', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const playlist = await findPlaylist(api, 'Late Night Mix')
  await app.goto(`/item/${playlist.Id}`)
  await expect(page.getByRole('heading', { name: 'Late Night Mix' })).toBeVisible()
  // list rows with the position number and the row buttons
  await expect(page.locator('[data-page-root] [data-grid-index="0"]')).toContainText('1.')
  await expect(page.locator('[data-page-root] [data-grid-index="0"]').getByRole('button', { name: 'More' })).toBeVisible()

  const choose = async (layout: string) => {
    await page.getByRole('button', { name: 'View options' }).click()
    await page.getByRole('dialog', { name: 'View options' }).getByRole('button', { name: /^Layout/ }).click()
    await page.getByRole('menuitem', { name: layout, exact: true }).or(page.getByRole('option', { name: layout, exact: true })).first().click()
    await page.keyboard.press('Escape')
  }
  await choose('Compact List')
  await expect(page.locator('[data-page-root] [data-grid-index="0"]')).toContainText('1.')
  await choose('Grid')
  await expect(page.locator('[data-page-root] [data-grid-index] [data-card-surface]').first()).toBeVisible()
  await page.reload()
  await app.settle()
  await expect(page.locator('[data-page-root] [data-grid-index] [data-card-surface]').first()).toBeVisible()
  await expect(page.getByText(/^1 \/ \d+$/)).toBeVisible()
})

test('audio playlist: the same page; songs get the music menu, Play fills the music queue and marks the rows', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const playlist = await findPlaylist(api, 'Late Night Mix')
  const count = (await api.items({ parentId: playlist.Id, recursive: false })).length
  await app.goto(`/item/${playlist.Id}`)
  const row = (i: number) => page.locator(`[data-page-root] [data-grid-index="${i}"]`)
  await expect(row(0)).toContainText('1.')

  // a song's menu is the music menu (ContextMenu.ForMusic), and Escape gives focus back to the row
  await row(1).locator('[data-focusable]').first().click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'Play next' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Add to queue' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Go to album' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: /^Mark as (watched|unwatched)$/ })).toHaveCount(0)
  await expect(menu.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(row(1).locator('[data-focusable]').first()).toBeFocused()

  // Play all: the whole playlist goes to the music queue, in the mini player; the first row is the playing one
  await page.locator('[data-page-root]').getByRole('button', { name: /^play$/i }).first().click()
  const bar = page.locator('[data-mini-player]')
  await expect(bar).toBeVisible({ timeout: 10_000 })
  await expect(row(0).locator('[data-queue-marker="playing"]')).toBeVisible()
  await expect(row(1).locator('[data-queue-marker="queued"]')).toBeVisible()
  // every row on screen is in the queue (the list is virtualized: the rendered rows)
  const rendered = await page.locator('[data-page-root] [data-grid-index]').count()
  expect(rendered).toBeGreaterThan(1)
  expect(rendered).toBeLessThanOrEqual(count)
  await expect(page.locator('[data-page-root] [data-grid-index] [data-queue-marker]')).toHaveCount(rendered)

  // the page ends above the mini player: the list has its own scroller, so a last row under the bar could never
  // be reached. Walk to it with the keyboard and compare the boxes.
  await row(0).locator('[data-focusable]').first().focus()
  for (let i = 1; i < count; i++) await page.keyboard.press('ArrowDown')
  await expect(row(count - 1).locator('[data-focusable]').first()).toBeFocused()
  const lastRow = (await row(count - 1).boundingBox())!
  const barBox = (await bar.boundingBox())!
  expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(barBox.y + 1)

  await bar.getByRole('button', { name: /^pause$/i }).click()
  await expect(bar.getByRole('button', { name: /^play$/i })).toBeVisible()
})

test('playlist: Move down and Move up reorder the playlist on the server', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  const playlist = await findPlaylist(api, 'Weekend Watchlist')
  const order = async () => (await api.items({ parentId: playlist.Id, recursive: false })).map((i) => i.Id)
  const before = await order()
  expect(before.length).toBeGreaterThan(1)
  try {
    await app.goto(`/item/${playlist.Id}`)
    const row0 = page.locator('[data-page-root] [data-grid-index="0"]')
    const firstName = (await api.item(before[0])).Name!
    await row0.getByRole('button', { name: 'Move down' }).click()
    await expect.poll(order).toEqual([before[1], before[0], ...before.slice(2)])
    // the list shows the new order before the next move
    await expect(page.locator('[data-page-root] [data-grid-index="1"] [data-focusable]').first()).toContainText(firstName)
    await page.locator('[data-page-root] [data-grid-index="1"]').getByRole('button', { name: 'Move up' }).click()
    await expect.poll(order).toEqual(before)
  } finally {
    const now = await order()
    if (now[0] !== before[0]) {
      const entries = await api.get<{ Items?: { Id: string; PlaylistItemId?: string }[] }>(`/Playlists/${playlist.Id}/Items`, { userId: api.userId })
      const entry = entries.Items?.find((i) => i.Id === before[0])?.PlaylistItemId
      if (entry) await api.request('POST', `/Playlists/${playlist.Id}/Items/${entry}/Move/0`)
    }
  }
})

test('box set: focusing an item swaps the collection header for the item header, Up brings it back', { tag: [TAG.keyboard] }, async ({ page, app, api }) => {
  const boxSet = await api.findItem('BoxSet', 'Blender Open Movies')
  await app.goto(`/item/${boxSet.Id}`)
  await expect(app.focused).toHaveAccessibleName('Play')
  const itemHeader = page.locator('[data-page-root] [data-home-header]')
  await expect(itemHeader).toHaveCount(0)
  await app.press('ArrowDown')
  await expect(app.focused).toHaveAttribute('data-card-surface', /.*/)
  await expect(itemHeader).toBeVisible()
  await expect(page.getByRole('button', { name: 'Shuffle' })).toBeHidden()
  await app.press('ArrowUp')
  await expect(app.focused).toHaveAccessibleName('Play')
  await expect(itemHeader).toHaveCount(0)
})

/** Makes the item (and grid copies of it) deletable for the test user and answers DELETE without deleting. */
async function mockDeletable(page: Page, itemId: string, deletes: string[]) {
  await page.route(
    (u) => u.port === '8097' && (u.pathname.endsWith(`/Items/${itemId}`) || u.pathname.endsWith('/Items')),
    async (route) => {
      const req = route.request()
      if (req.method() === 'DELETE') {
        deletes.push(new URL(req.url()).pathname)
        return route.fulfill({ status: 204 })
      }
      if (req.method() !== 'GET') return route.continue()
      try {
        const res = await route.fetch()
        const body = (await res.json()) as { Id?: string; CanDelete?: boolean; Items?: { Id?: string; CanDelete?: boolean }[] }
        if (body.Id === itemId) body.CanDelete = true
        for (const i of body.Items ?? []) if (i.Id === itemId) i.CanDelete = true
        await route.fulfill({ response: res, json: body })
      } catch {
        // the app cancelled the request (page left, query aborted) while it was being patched
        await route.abort().catch(() => {})
      }
    },
  )
}

test('delete from the detail page asks first, deletes and goes back (DELETE mocked)', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const movie = await api.findMovie('Charge')
  const deletes: string[] = []
  await mockDeletable(page, movie.Id, deletes)
  await app.goto('/')
  await setPref(page, 'manageMedia', true)
  await app.goto(`/item/${movie.Id}`)
  await toolbar(page).getByRole('button', { name: 'Delete' }).click()
  const confirm = page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this item?' })
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  expect(deletes).toEqual([])
  await toolbar(page).getByRole('button', { name: 'Delete' }).click()
  await confirm.getByRole('button', { name: 'Confirm' }).click()
  await expect(toast(page, 'Deleted')).toBeVisible()
  expect(deletes).toEqual([`/Items/${movie.Id}`])
  await expect(page).toHaveURL((u) => u.pathname === '/')
})

test('delete from a grid card menu sends the DELETE after the confirmation (mocked)', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const movie = await api.findMovie('Charge')
  const lib = (await api.userViews()).find((v) => v.Name === 'Movies')!
  const deletes: string[] = []
  await mockDeletable(page, movie.Id, deletes)
  await app.goto('/')
  await setPref(page, 'manageMedia', true)
  await app.goto(`/library/${lib.Id}?tab=library`)
  const card = page.locator(`[data-page-root] [data-card-surface][aria-label="${movie.Name}"]`)
  await card.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await page.getByRole('dialog').filter({ hasText: 'Are you sure you want to delete this item?' }).getByRole('button', { name: 'Confirm' }).click()
  await expect.poll(() => deletes).toEqual([`/Items/${movie.Id}`])
})

test('"Send media info log to server" uploads a client log with the media sources (upload mocked)', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const movie = await api.findMovie('Spring')
  await page.route('**/ClientLog/Document', (route) => route.fulfill({ json: { FileName: 'e2e-media-info.log' } }))
  // The body is a File; WebKit gives route.request().postData() no bytes for it, so read it in the page instead.
  await page.addInitScript(() => {
    const w = window as unknown as { __e2eClientLog?: Promise<string> }
    const capture = (url: string, body: unknown) => {
      if (/\/ClientLog\/Document/.test(url) && body instanceof Blob) w.__e2eClientLog = body.text()
    }
    const open = XMLHttpRequest.prototype.open
    const send = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest & { __e2eUrl?: string }, ...args: unknown[]) {
      this.__e2eUrl = String(args[1])
      return (open as (...a: unknown[]) => void).apply(this, args)
    }
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { __e2eUrl?: string }, body?: Document | XMLHttpRequestBodyInit | null) {
      capture(this.__e2eUrl ?? '', body)
      return send.call(this, body)
    }
    const fetch0 = window.fetch
    window.fetch = (input, init) => {
      capture(input instanceof Request ? input.url : String(input), init?.body)
      return fetch0(input, init)
    }
  })
  await app.goto(`/item/${movie.Id}`)
  await toolbar(page).getByRole('button', { name: 'More' }).click()
  await page.getByText('Send media info log to server', { exact: true }).click()
  await expect(toast(page, 'Sent! Filename=e2e-media-info.log')).toBeVisible()
  const body = await page.evaluate(() => (window as unknown as { __e2eClientLog?: Promise<string> }).__e2eClientLog ?? '')
  // ServerReportService.sendMediaReportFor: header, playback preferences, media sources, the player's device profile
  expect(body).toMatch(/^Send media info\nserverVersion=/)
  expect(body).toMatch(/\n\nplaybackPrefs=skipForward: /)
  expect(body).toMatch(/\n\nexperimental=experimentalEnable: /)
  expect(body).toMatch(/\n\nmediaSources=\[\{/)
  expect(body).toMatch(/\n\ndeviceProfile=\{.*"DirectPlayProfiles":\[/)
})

test('Add to playlist can create a new playlist with the item', { tag: [TAG.writes] }, async ({ page, app, api }) => {
  const movie = await api.findMovie('Spring')
  const name = `e2e playlist ${Date.now().toString(36)}`
  await app.goto(`/item/${movie.Id}`)
  try {
    await toolbar(page).getByRole('button', { name: 'More' }).click()
    await page.getByText('Add to playlist', { exact: true }).click()
    await page.getByRole('dialog', { name: 'Add to playlist' }).getByRole('menuitem', { name: 'Create new playlist' }).click()
    const create = page.getByRole('dialog', { name: 'Create new playlist' })
    await create.getByRole('textbox', { name: 'Name' }).fill(name)
    await create.getByRole('button', { name: 'Submit' }).click()
    await expect(toast(page, 'Success')).toBeVisible()
    await expect
      .poll(async () => {
        const found = (await api.items({ includeItemTypes: 'Playlist', searchTerm: name })).find((p) => p.Name === name)
        return found ? (await api.items({ parentId: found.Id, recursive: false })).map((i) => i.Id) : null
      })
      .toEqual([movie.Id])
  } finally {
    // Jellyfin writes the new playlist's metadata file a moment after creating it. A delete that comes first
    // removes the playlist but the late write puts its folder back, and the next scheduled library scan lists
    // it again without an owner (measured: a delete at once leaves the folder, one 1.5 s later does not). There
    // is nothing to poll for, so wait; the global setup removes what still slips through.
    await page.waitForTimeout(3000)
    for (const p of (await api.items({ includeItemTypes: 'Playlist', searchTerm: name })).filter((x) => x.Name === name)) {
      await api.request('DELETE', `/Items/${p.Id}`)
    }
  }
})

test('a click beside a nested dialog closes only that dialog and focus stays in the one underneath', { tag: [TAG.desktop, TAG.engines] }, async ({ page, app, api }) => {
  const movie = await api.findMovie('Multi Track Showcase')
  await app.goto(`/item/${movie.Id}`)
  const more = toolbar(page).getByRole('button', { name: 'More' })
  await more.click()
  const entry = page.getByRole('dialog').getByText('Choose Audio', { exact: true })
  await entry.click()
  const audio = page.getByRole('dialog', { name: 'Choose Audio' })
  await expect(audio).toBeVisible()
  // the scrim beside both dialogs
  await page.mouse.click(5, 450)
  await expect(audio).toHaveCount(0)
  const menu = page.getByRole('dialog')
  await expect(menu).toHaveCount(1)
  // focus is back on the entry that opened the chooser, not on <body> (arrow keys then reached the page behind
  // the dialog and Escape no longer closed it)
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent ?? '')).toContain('Choose Audio')
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(more).toBeFocused()

  // the same press on a single dialog gives focus back to its opener
  await more.click()
  await expect(menu).toHaveCount(1)
  await page.mouse.click(5, 450)
  await expect(menu).toHaveCount(0)
  await expect(more).toBeFocused()
})

test('a dialog opened from a menu entry gives focus back to the button that opened the menu', { tag: [TAG.keyboard] }, async ({ page, app, api }) => {
  const movie = await api.findMovie('Multi Track Showcase')
  await app.goto(`/item/${movie.Id}`)
  await expect(app.focused).toHaveAccessibleName(/^(Play|Resume)$/)
  const more = toolbar(page).getByRole('button', { name: 'More' })
  for (let i = 0; i < 12 && !(await more.evaluate((el) => el === document.activeElement)); i++) await app.press('ArrowRight')
  await expect(more).toBeFocused()
  // [menu entry, a text only its dialog shows]
  for (const [name, shows] of [
    ['Media Information', 'Container:'],
    ['Add to playlist', 'Create new playlist'],
  ] as const) {
    await page.keyboard.press('Enter')
    const menu = page.getByRole('dialog')
    await expect(menu).toHaveCount(1)
    for (let i = 0; i < 20 && !((await app.focused.textContent()) ?? '').includes(name); i++) await app.press('ArrowDown')
    await expect(app.focused).toContainText(name)
    // the entry closes its menu and opens the next dialog: the entry itself is gone when that dialog closes
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog').getByText(shows).first()).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    if (name === 'Add to playlist') {
      // focus starts on the first playlist; Up reaches the search field and Down leaves it again
      const first = page.getByRole('dialog').locator('[data-focusable]').filter({ hasNot: page.locator('input') })
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT')
      const start = await app.focused.textContent()
      await app.press('ArrowUp')
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('INPUT')
      await app.press('ArrowDown')
      await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT')
      expect(await app.focused.textContent()).toBe(start)
      expect(await first.count()).toBeGreaterThan(0)
    }
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(more).toBeFocused()
  }
})

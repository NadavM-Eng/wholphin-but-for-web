// Series: the overview's season tabs and the URL that follows the selected episode (deep links, reloads), the
// arrival focus on the selected episode, missing / unaired episodes (mocked: both servers hide them), and the
// details page's "Mark entire series played / unplayed" (the request is mocked: marking a seeded series played
// would wipe the next-up state the other tests rely on).
import type { Page } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'
import type { Item, JellyfinApi } from '../fixtures/api'
import { E2E_BASE_URL } from '../fixtures/env'

const SERIES = 'Detective Moth'

async function seasonsOf(api: JellyfinApi, seriesId: string) {
  return (await api.get<{ Items?: Item[] }>(`/Shows/${seriesId}/Seasons`, { userId: api.userId })).Items ?? []
}

async function episodesOf(api: JellyfinApi, seriesId: string, seasonId: string) {
  return (await api.get<{ Items?: Item[] }>(`/Shows/${seriesId}/Episodes`, { userId: api.userId, seasonId, sortBy: 'IndexNumber' })).Items ?? []
}

const episodeCard = (page: Page, id: string) => page.locator(`[data-focus-key="episode:${id}"] [data-card-surface]`)
const query = (page: Page, key: string) => new URL(page.url()).searchParams.get(key)

test('season tabs switch the episode strip and the URL follows', { tag: [TAG.desktop, TAG.phone, TAG.engines, TAG.iphone] }, async ({ page, app, api }) => {
  const series = await api.findSeries(SERIES)
  const seasons = await seasonsOf(api, series.Id)
  expect(seasons.length).toBeGreaterThan(1)
  const s2 = seasons[1]
  const s2eps = await episodesOf(api, series.Id, s2.Id)

  await app.goto(`/series/${series.Id}`)
  await expect(page.getByRole('tab', { name: seasons[0].Name! })).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => query(page, 'season')).toBe(seasons[0].Id)

  await app.activate(page.getByRole('tab', { name: s2.Name! }))
  await expect(page.getByRole('tab', { name: s2.Name! })).toHaveAttribute('aria-selected', 'true')
  await expect(episodeCard(page, s2eps[0].Id)).toBeVisible()
  await expect.poll(() => [query(page, 'season'), query(page, 'episode')]).toEqual([s2.Id, s2eps[0].Id])

  // a reload reopens the same season and episode
  await page.reload()
  await app.settle()
  await expect(page.getByRole('tab', { name: s2.Name! })).toHaveAttribute('aria-selected', 'true')
  await expect(episodeCard(page, s2eps[0].Id)).toHaveAttribute('aria-current', 'true')
})

test('a deep link selects and focuses its episode; the arrows move the selection and the URL', { tag: [TAG.keyboard] }, async ({ page, app, api }) => {
  const series = await api.findSeries(SERIES)
  const [s1] = await seasonsOf(api, series.Id)
  const eps = await episodesOf(api, series.Id, s1.Id)
  expect(eps.length).toBeGreaterThan(2)

  await app.goto(`/series/${series.Id}?season=${s1.Id}&episode=${eps[1].Id}`)
  // real focus (not just the focused look) lands on the linked episode
  await expect(episodeCard(page, eps[1].Id)).toBeFocused()
  await app.press('ArrowRight')
  await expect(episodeCard(page, eps[2].Id)).toBeFocused()
  await expect.poll(() => query(page, 'episode')).toBe(eps[2].Id)
  await expect(page.locator('[data-page-root] h2').first()).toHaveText(eps[2].Name!)
  await app.press('ArrowLeft', 2)
  await expect(episodeCard(page, eps[0].Id)).toBeFocused()
  await expect.poll(() => query(page, 'episode')).toBe(eps[0].Id)

  // The URL follows the arrows after a pause. A key that may leave the page (Enter opens the episode) writes the
  // pending position first, so Back returns to the episode that was opened and not to the one before it. Checked
  // without opening anything: any key that is not an arrow does it, in the same event.
  await page.keyboard.press('ArrowRight')
  const search = await page.evaluate(() => {
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F13', bubbles: true }))
    return location.search
  })
  expect(new URLSearchParams(search).get('episode')).toBe(eps[1].Id)
})

const MISSING = 'e2e000000000000000000000000000a1'
const UNAIRED = 'e2e000000000000000000000000000a2'

/** Adds a missing episode (in the past) and an unaired one (in a month, no number) to the season's episode list. */
async function mockVirtualEpisodes(page: Page, seriesId: string) {
  const fakes: Record<string, Record<string, unknown>> = {}
  await page.route(
    (u) => u.pathname.endsWith(`/Shows/${seriesId}/Episodes`),
    async (route) => {
      const res = await route.fetch()
      const body = (await res.json()) as { Items?: Record<string, unknown>[]; TotalRecordCount?: number }
      const items = body.Items ?? []
      const last = items.at(-1)
      if (last && items.length < 100) {
        const virtual = {
          ...last,
          ImageTags: {},
          BackdropImageTags: [],
          MediaSources: undefined,
          MediaSourceCount: 0,
          MediaStreams: [],
          RunTimeTicks: undefined,
          Overview: undefined,
          LocationType: 'Virtual',
          CanDelete: false,
          UserData: { Played: false, PlaybackPositionTicks: 0, PlayCount: 0, IsFavorite: false },
        }
        fakes[MISSING] = { ...virtual, Id: MISSING, Name: 'A Missing Episode', IndexNumber: Number(last.IndexNumber ?? 0) + 1, PremiereDate: '2020-01-01T00:00:00.0000000Z' }
        fakes[UNAIRED] = { ...virtual, Id: UNAIRED, Name: 'An Unaired Episode', IndexNumber: undefined, PremiereDate: new Date(Date.now() + 30 * 864e5).toISOString() }
        body.Items = [...items, fakes[MISSING], fakes[UNAIRED]]
        body.TotalRecordCount = body.Items.length
      }
      await route.fulfill({ response: res, json: body })
    },
  )
  await page.route(
    (u) => !u.href.startsWith(E2E_BASE_URL) && u.href.includes('e2e000000000000000000000000000a'),
    async (route) => {
      const u = new URL(route.request().url())
      const id = /\/Items\/([0-9a-z]{32})$/.exec(u.pathname)?.[1]
      if (id && fakes[id]) return route.fulfill({ json: fakes[id] })
      // anything else about a virtual episode (people, extras, images): empty
      return route.fulfill({ json: { Items: [], TotalRecordCount: 0 } })
    },
  )
}

test('missing and unaired episodes show as placeholder cards with their number or air date (mocked)', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const series = await api.findSeries(SERIES)
  const [s1] = await seasonsOf(api, series.Id)
  await mockVirtualEpisodes(page, series.Id)
  await app.goto(`/series/${series.Id}?season=${s1.Id}&episode=${MISSING}`)
  const missing = episodeCard(page, MISSING)
  await expect(missing).toHaveAttribute('aria-current', 'true')
  // no image: the card shows the episode name; the corner shows its number
  await expect(missing).toContainText('A Missing Episode')
  await expect(missing.locator('img')).toHaveCount(0)
  await expect(page.locator(`[data-focus-key="episode:${MISSING}"]`)).toContainText(/E\d+/)
  await expect(page.locator('[data-page-root] h2').first()).toHaveText('A Missing Episode')

  // the unaired one has no number: its corner shows the air date
  await episodeCard(page, UNAIRED).hover()
  await expect.poll(() => query(page, 'episode')).toBe(UNAIRED)
  const date = new Date(Date.now() + 30 * 864e5).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  await expect(page.locator(`[data-focus-key="episode:${UNAIRED}"]`)).toContainText(date)
  await expect(page.locator('[data-page-root] h2').first()).toHaveText('An Unaired Episode')
  // a reload with the virtual episode in the URL opens it again
  await page.reload()
  await app.settle()
  await expect(episodeCard(page, UNAIRED)).toHaveAttribute('aria-current', 'true')
})

test('hovering another episode keeps the Cast & Crew row and the actors both episodes share; only the others change (people mocked)', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const series = await api.findSeries(SERIES)
  const [s1] = await seasonsOf(api, series.Id)
  const [e1, e2] = await episodesOf(api, series.Id, s1.Id)
  // every episode: three actors all episodes share, one of its own and one guest star of its own (no pictures:
  // the cards show the placeholder)
  const person = (key: string, type: string) => ({ Id: `e2e0${'0'.repeat(22)}${key.padStart(6, '0')}`, Name: `Person ${key}`, Role: 'Role', Type: type })
  await page.route(/\/Items\/[0-9a-f]{32}(\?|$)/i, async (route) => {
    const res = await route.fetch()
    const body = (await res.json()) as { Type?: string; IndexNumber?: number; People?: unknown[] }
    if (body.Type === 'Episode') {
      const n = String(body.IndexNumber ?? 0)
      body.People = [person('1', 'Actor'), person('2', 'Actor'), person('3', 'Actor'), person(`10${n}`, 'Actor'), person(`20${n}`, 'GuestStar')]
    }
    await route.fulfill({ response: res, json: body })
  })
  await app.goto(`/series/${series.Id}?season=${s1.Id}&episode=${e1.Id}`)
  const cast = page.locator('[data-page-root]').getByText('Cast & Crew', { exact: true })
  await expect(cast).toBeVisible()
  await expect(page.getByText('Person 101', { exact: true })).toBeVisible()
  await app.settle()

  // mark the shared actors' cards and record every moment the row is gone
  await page.evaluate(() => {
    const w = window as unknown as { __rowGone: number }
    w.__rowGone = 0
    const has = () => Array.from(document.querySelectorAll('[data-page-root] *')).some((el) => el.childElementCount === 0 && el.textContent === 'Cast & Crew')
    new MutationObserver(() => {
      if (!has()) w.__rowGone++
    }).observe(document.querySelector('[data-page-root]')!, { subtree: true, childList: true })
    for (const el of Array.from(document.querySelectorAll('[data-focus-key^="cast:"]')).slice(0, 3)) el.setAttribute('data-e2e-kept', '')
  })
  await episodeCard(page, e2.Id).hover()
  await expect.poll(() => query(page, 'episode')).toBe(e2.Id)
  // the second episode's own actor and guest star replace the first one's
  await expect(page.getByText('Person 102', { exact: true })).toBeVisible()
  await expect(page.getByText('Person 202', { exact: true })).toBeVisible()
  await expect(page.getByText('Person 101', { exact: true })).toHaveCount(0)
  // the row never left the page, and the three shared cards are the same elements as before
  expect(await page.evaluate(() => (window as unknown as { __rowGone: number }).__rowGone)).toBe(0)
  await expect(page.locator('[data-e2e-kept]')).toHaveCount(3)
  await expect(page.locator('[data-e2e-kept]').first()).toContainText('Person 1')
})

test('"Mark entire series played / unplayed" asks first and sends the request (mocked)', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
  const series = await api.findSeries(SERIES)
  const sent: string[] = []
  await page.route(
    (u) => u.pathname.endsWith(`/UserPlayedItems/${series.Id}`),
    async (route) => {
      const method = route.request().method()
      sent.push(method)
      await route.fulfill({ json: { Played: method === 'POST', PlaybackPositionTicks: 0, PlayCount: method === 'POST' ? 1 : 0, IsFavorite: false, Key: series.Id, ItemId: series.Id } })
    },
  )
  await app.goto(`/item/${series.Id}`)
  const buttons = page.locator('[data-page-root]').getByRole('toolbar', { name: 'Play' }).first()
  const start = await buttons.getByRole('button', { name: /^Mark as (watched|unwatched)$/ }).getAttribute('aria-label')
  const played = start === 'Mark as unwatched'

  await buttons.getByRole('button', { name: start! }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: played ? 'Mark entire series as unplayed?' : 'Mark entire series as played?' })
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect(sent).toEqual([])

  await buttons.getByRole('button', { name: start! }).click()
  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect.poll(() => sent).toEqual([played ? 'DELETE' : 'POST'])
  // (the server state did not change, so the series' next refetch shows the old state again)
})

test('Down from the episode strip onto the buttons scrolls the overview (the suite runs with reduced motion: the TV with animations off), the focused button whole in view', { tag: [TAG.keyboard] }, async ({ page, app, api }) => {
  // a window the overview does not fit in once the episode's people row is there
  await page.setViewportSize({ width: 1280, height: 720 })
  const series = await api.findSeries('Orbital Drift')
  const [s1] = await seasonsOf(api, series.Id)
  const eps = await episodesOf(api, series.Id, s1.Id)
  await app.goto(`/series/${series.Id}?season=${s1.Id}&episode=${eps[0].Id}`)
  await expect(episodeCard(page, eps[0].Id)).toBeFocused()
  await app.press('ArrowRight')
  await expect(episodeCard(page, eps[1].Id)).toBeFocused()
  // the rows under the buttons belong to the focused episode: they have to be there, or the page is too short to scroll
  await app.settle()
  const range = () => page.evaluate(() => document.documentElement.scrollHeight - innerHeight)
  await expect.poll(range).toBeGreaterThan(100)
  expect(await page.evaluate(() => scrollY)).toBe(0)

  await app.press('ArrowDown')
  await expect(app.focused).toHaveAccessibleName(/^(play|resume)/i)
  // one delayed frame towards the button's pivot (SeriesOverviewContent.kt under rememberDelayedNestedScroll);
  // before, the page stayed at the top
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(60)
  const box = await app.focused.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, height: innerHeight }
  })
  expect(box.top).toBeGreaterThanOrEqual(0)
  expect(box.bottom).toBeLessThanOrEqual(box.height)
  // Up returns to the strip and the page to its top
  await app.press('ArrowUp')
  await expect(episodeCard(page, eps[1].Id)).toBeFocused()
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
})

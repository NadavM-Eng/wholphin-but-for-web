// Search: results as you type with the query in the URL, Back to the results with the query and the focused card,
// the "Include types" switches, and the combined results grid (focused first card not clipped at a wide window).
import type { Page } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'

const field = (page: Page) => page.locator('[data-page-root]').getByRole('textbox', { name: 'Search' }).or(page.locator('[data-page-root]').getByRole('searchbox', { name: 'Search' })).first()
const searchRow = (page: Page, type: string) => page.locator(`[data-search-row="${type}"]`)

/** setPref through the module instance the app runs (see browse.spec.ts). */
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

test('typing searches as you type, the URL keeps the query and Back returns to the results', { tag: [TAG.desktop, TAG.phone, TAG.engines, TAG.iphone] }, async ({ page, app, api }) => {
  const movie = await api.findMovie('Spring')
  await app.goto('/search')
  const historyIndex = () => page.evaluate(() => (history.state as { idx?: number } | null)?.idx ?? null)
  const startIdx = await historyIndex()
  await app.activate(field(page))
  await field(page).pressSequentially('Sprin', { delay: 30 })
  await expect(page).toHaveURL(/[?&]q=Sprin(&|$)/)
  const card = searchRow(page, 'Movie').locator(`[data-card-surface][href="/item/${movie.Id}"]`)
  await expect(card).toBeVisible()

  await app.activate(card)
  await expect(page).toHaveURL((u) => u.pathname === `/item/${movie.Id}`)
  await app.settle()
  await page.goBack()
  await expect(page).toHaveURL(/\/search\?q=Sprin/)
  await expect(field(page)).toHaveValue('Sprin')
  await expect(card).toBeVisible()
  // typing replaced the history entry instead of pushing one per keystroke: the results sit at the search page's
  // own history index (so one Back leaves it). Checked through the router's index rather than by going Back
  // past the first entry, which differs by engine (WebKit opens a page without an about:blank entry before it).
  expect(await historyIndex()).toBe(startIdx)
})

test('keyboard: Back to the results restores the focused card', { tag: [TAG.keyboard] }, async ({ page, app, api }) => {
  const movie = await api.findMovie('Spring')
  await app.goto('/search')
  await field(page).focus()
  await page.keyboard.type('Spring', { delay: 30 })
  await app.press('Enter')
  const card = searchRow(page, 'Movie').locator(`[data-card-surface][href="/item/${movie.Id}"]`)
  await expect(card).toBeVisible()
  await card.focus()
  await app.press('Enter')
  await expect(page).toHaveURL((u) => u.pathname === `/item/${movie.Id}`)
  await app.settle()
  await app.press('Escape')
  await expect(page).toHaveURL(/\/search\?q=Spring/)
  await expect(card).toBeFocused()
})

test('Include types: one switch per type with its state; turning Movies off drops the Movies row', { tag: [TAG.desktop] }, async ({ page, app }) => {
  await app.goto('/search?q=a')
  await expect(searchRow(page, 'Movie')).toBeVisible()
  await page.getByRole('button', { name: 'View options' }).click()
  const viewOptions = page.getByRole('dialog', { name: 'View options' })
  await expect(viewOptions.getByRole('switch', { name: /Combined search results/ })).toHaveAttribute('aria-checked', 'false')
  await viewOptions.getByRole('button', { name: 'Include types' }).click()
  const types = page.getByRole('dialog', { name: 'Include types' })
  const movies = types.getByRole('switch', { name: 'Movies' })
  await expect(movies).toHaveAttribute('aria-checked', 'true')
  expect(await types.getByRole('switch').count()).toBeGreaterThan(2)
  await movies.click()
  await expect(movies).toHaveAttribute('aria-checked', 'false')
  await page.keyboard.press('Escape')
  await expect(searchRow(page, 'Movie')).toHaveCount(0)
  await expect(searchRow(page, 'Series')).toBeVisible()
})

test.describe('wide window', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('combined results: the focused first-column card is not clipped at the start edge', { tag: [TAG.desktop] }, async ({ page, app }) => {
    await app.goto('/search')
    await setPref(page, 'searchCombinedResults', true)
    await app.goto('/search?q=a')
    const first = page.locator('[data-search-item]').first()
    await expect(first).toBeVisible()
    await first.focus()
    await expect(first).toBeFocused()
    // the focused card scales up; its box must stay inside the scrolling results column
    await expect
      .poll(() =>
        first.evaluate((el) => {
          let clip: Element | null = el.parentElement
          while (clip && getComputedStyle(clip).overflowX === 'visible') clip = clip.parentElement
          return Math.round(el.getBoundingClientRect().left - (clip?.getBoundingClientRect().left ?? 0))
        }),
      )
      .toBeGreaterThanOrEqual(0)
  })
})

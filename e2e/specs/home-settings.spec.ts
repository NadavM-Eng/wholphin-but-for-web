// Home customization: add a row, move it to the top, save it to this device (localStorage only: nothing is written
// to the server) and find it on Home in that place; leaving without saving keeps Home as it was.
import type { Page } from '@playwright/test'
import { TAG, expect, test } from '../fixtures'

const ROW = 'Genres in Movies'

/** The editor's row list entry for `title` (its label and its Move up / Move down / Delete buttons). */
const editorRow = (page: Page, title: string) =>
  page
    .locator('[data-page-root] *')
    .filter({ has: page.getByRole('button', { name: 'Move up' }) })
    .filter({ hasText: title })
    .last()

async function addGenresRow(page: Page) {
  await page.getByRole('button', { name: 'Add row' }).click()
  await page.getByRole('button', { name: 'Movies', exact: true }).click()
  await page.getByRole('button', { name: 'Genres', exact: true }).click()
  await expect(editorRow(page, ROW)).toBeVisible()
}

test('a row added, moved to the top and saved to this device shows first on Home', { tag: [TAG.desktop] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  await expect(app.homeRow(ROW)).toHaveCount(0)

  await app.goto('/home/settings')
  await addGenresRow(page)
  const count = await page.getByRole('button', { name: 'Move up' }).count()
  const row = editorRow(page, ROW)
  for (let i = 0; i < count && (await row.getByRole('button', { name: 'Move up' }).isEnabled()); i++) {
    await row.getByRole('button', { name: 'Move up' }).click()
  }
  await expect(row.getByRole('button', { name: 'Move up' })).toBeDisabled()

  await page.getByRole('button', { name: 'Back', exact: true }).first().click()
  const save = page.getByRole('dialog', { name: 'Save' })
  await save.getByText('Save only to this device', { exact: true }).click()
  await app.expectHome()
  await expect(app.homeRows.first().getByRole('region')).toHaveAccessibleName(ROW)

  // kept across a reload (this device's copy)
  await page.reload()
  await app.expectHome()
  await expect(app.homeRows.first().getByRole('region')).toHaveAccessibleName(ROW)
})

test('leaving the editor and discarding keeps Home unchanged', { tag: [TAG.desktop] }, async ({ page, app }) => {
  await app.goto('/')
  await app.expectHome()
  const before = await app.homeRows.getByRole('region').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))

  await app.goto('/home/settings')
  await addGenresRow(page)
  await page.getByRole('button', { name: 'Back', exact: true }).first().click()
  await page.getByRole('dialog', { name: 'Save' }).getByRole('menuitem').last().click()
  await app.expectHome()
  await expect.poll(() => app.homeRows.getByRole('region').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(before)
})

test('a finger that starts on a reorder handle scrolls the row list; resting on the handle picks the row up', { tag: [TAG.phone] }, async ({ page, app }) => {
  await app.goto('/home/settings')
  const entries = page.locator('[data-row-entry]')
  await expect(entries.nth(1)).toBeInViewport()
  const order = () => entries.evaluateAll((els) => els.map((e) => e.getAttribute('data-hs-key')))
  const top = () => entries.first().evaluate((e) => e.parentElement!.scrollTop)
  const handle = async (i: number) => {
    const box = (await entries.nth(i).getByTitle('Drag to reorder').boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  const before = await order()
  expect(before.length).toBeGreaterThan(2)
  expect(await top()).toBe(0)

  // a swipe up from the second row's handle: the list scrolls, the rows keep their order
  const second = await handle(1)
  await app.touchDrag(second, { x: second.x + 3, y: second.y - 120 })
  await expect.poll(top).toBeGreaterThan(50)
  expect(await order()).toEqual(before)
  await entries.first().evaluate((e) => e.parentElement!.scrollTo(0, 0))
  await expect.poll(top).toBe(0)

  // resting on the first row's handle (longer than the 400 ms pick-up time), then down past the second row
  const first = await handle(0)
  const next = await handle(1)
  await app.touchDrag(first, { x: first.x, y: next.y + 10 }, { holdMs: 650 })
  await expect.poll(order).toEqual([before[1], before[0], ...before.slice(2)])
  expect(await top()).toBe(0)
})

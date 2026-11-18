// No horizontal overflow on any page at each project's viewport (the page must never scroll sideways; rows
// scroll inside themselves). Visiting every route also runs the shared console / request check on each.
// Every area's main route is listed here (no route stub is left since the final merge).
import { SIGNED_OUT, TAG, expect, test } from '../fixtures'

test.describe('signed in', () => {
  const routes = (ids: { movie: string; series: string; library: string }) => [
    '/',
    '/home/row/0',
    '/search',
    '/favorites',
    `/item/${ids.movie}`,
    `/series/${ids.series}`,
    `/library/${ids.library}`,
    '/livetv',
    '/discover',
    '/settings',
    '/home/settings',
    '/license',
  ]

  test('no page scrolls horizontally', { tag: [TAG.desktop, TAG.phone, TAG.engines, TAG.iphone] }, async ({ page, app, api }) => {
    const [movie, series, views] = await Promise.all([api.findMovie('Spring'), api.findSeries('Orbital Drift'), api.userViews()])
    const library = views.find((v) => v.CollectionType === 'movies')!
    for (const path of routes({ movie: movie.Id, series: series.Id, library: library.Id })) {
      await test.step(path, async () => {
        await app.goto(path)
        await expect(page).toHaveURL((u) => u.pathname === path.split('?')[0])
        await app.expectNoHorizontalOverflow()
      })
    }
  })
})

test.describe('signed out', () => {
  test.use(SIGNED_OUT)

  test('the sign-in screens do not scroll horizontally', { tag: [TAG.desktop, TAG.phone] }, async ({ page, app }) => {
    await app.goto('/setup/servers')
    await app.expectNoHorizontalOverflow()
    await app.activate(page.getByRole('button', { name: 'Add Server' }))
    await expect(page.getByRole('dialog', { name: 'Add Server' })).toBeVisible()
    await app.expectNoHorizontalOverflow()
  })
})

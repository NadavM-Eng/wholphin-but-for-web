// Accounts: Quick Connect sign-in, profile PIN (set, required, wrong, removed), switching users from the drawer.
import { SIGNED_OUT, TAG, expect, test } from '../fixtures'
import type { App } from '../fixtures/app'
import { testServerEnv } from '../fixtures/env'
import { addServer, loginDialog, openPasswordLogin, profileEntry, submitPassword, userCircle, userList } from '../flows/setup'

test.use(SIGNED_OUT)

/** Opens the drawer's profile entry (on phones the drawer is a sheet behind the menu button). */
async function switchUserFromDrawer(app: App) {
  if (app.touch) {
    await app.activate(app.menuButton)
    await expect(app.drawer).toHaveAttribute('data-open', /.*/)
  }
  await app.activate(profileEntry(app.page))
  await expect(userList(app.page)).toBeVisible()
}

test('Quick Connect: the code shown in the app is approved through the API and the app signs in', { tag: [TAG.desktop, TAG.phone] }, async ({ page, app, api }) => {
  await app.goto('/')
  await addServer(app)
  await app.activate(page.getByRole('button', { name: 'Add User' }))
  const code = loginDialog(page).getByTestId('quick-connect-code')
  await expect(code).toHaveText(/^\w{4,}$/, { timeout: 15_000 })
  await api.authorizeQuickConnect((await code.textContent())!.trim())
  // the app polls every 5 s
  await app.expectHome()
  await expect(profileEntry(page)).toContainText(testServerEnv().user)
})

/** Types a PIN: digit keys on desktop, the on-screen keypad on touch. */
async function typePin(app: App, pin: string, scope: ReturnType<App['page']['getByTestId']>) {
  if (app.touch) {
    for (const d of pin) await app.tap(scope.getByRole('button', { name: d, exact: true }))
  } else {
    await app.page.keyboard.type(pin)
  }
}

/** Opens a user circle's menu: right-click with a mouse, the "More" button on touch. */
async function openUserMenu(app: App, name: string) {
  const circle = userCircle(app.page, name)
  if (app.touch) await app.tap(circle.locator('xpath=..').locator('[data-card-more]'))
  else await circle.click({ button: 'right' })
  return app.page.getByRole('menu', { name })
}

test('profile PIN: a confirmation that differs is rejected and nothing is set', { tag: [TAG.desktop] }, async ({ page, app }) => {
  const user = testServerEnv().user
  await app.devLogin()
  await app.expectHome()
  await switchUserFromDrawer(app)
  await (await openUserMenu(app, user)).getByRole('menuitem', { name: 'Profile protection' }).click()
  await page.getByRole('dialog', { name: 'Profile protection' }).getByRole('menuitem', { name: 'Require PIN for profile' }).click()
  const create = page.getByTestId('pin-create')
  await expect(create.getByRole('heading', { name: 'Enter PIN' })).toBeVisible()
  await expect(create).toBeFocused()
  await typePin(app, '2580', create)
  await page.keyboard.press('Enter')
  await expect(create.getByRole('heading', { name: 'Confirm PIN' })).toBeVisible()
  await expect(create).toBeFocused()
  await typePin(app, '2581', create)
  await page.keyboard.press('Enter')
  // rejected: a toast says so and the flow starts over at Enter PIN
  await expect(page.getByRole('status').filter({ hasText: 'Incorrect' })).toBeVisible()
  await expect(create.getByRole('heading', { name: 'Enter PIN' })).toBeVisible()
})

test('profile PIN: set, required on next entry, wrong PIN rejected, removed', { tag: [TAG.desktop, TAG.phone] }, async ({ page, app }) => {
  const user = testServerEnv().user
  const PIN = '2580'
  await app.devLogin()
  await app.expectHome()

  // set: user list -> user menu -> Profile protection -> Require PIN -> enter + confirm
  await switchUserFromDrawer(app)
  await (await openUserMenu(app, user)).getByRole('menuitem', { name: 'Profile protection' }).click()
  await page.getByRole('dialog', { name: 'Profile protection' }).getByRole('menuitem', { name: 'Require PIN for profile' }).click()
  const create = page.getByTestId('pin-create')
  await expect(create.getByRole('heading', { name: 'Enter PIN' })).toBeVisible()
  // the PIN column takes focus a frame after each step renders; keys typed before that go nowhere
  await expect(create).toBeFocused()
  await typePin(app, PIN, create)
  if (app.touch) await app.tap(create.getByRole('button', { name: 'OK' }))
  else await page.keyboard.press('Enter')
  await expect(create.getByRole('heading', { name: 'Confirm PIN' })).toBeVisible()
  await expect(create).toBeFocused()
  await typePin(app, PIN, create)
  if (app.touch) await app.tap(create.getByRole('button', { name: 'OK' }))
  else await page.keyboard.press('Enter')
  await expect(create).toBeHidden()

  // required on the next entry, also after a reload (a protected user is never restored automatically)
  await page.reload()
  await expect(userList(page)).toBeVisible()
  await app.activate(userCircle(page, user))
  const entry = page.getByTestId('pin-entry')
  await expect(entry).toBeVisible()

  // wrong PIN: shakes, clears, stays on the user list
  const dots = entry.locator('[data-pin-dots]')
  await typePin(app, '1111', entry)
  await expect(dots).toHaveAttribute('aria-label', '0')
  await expect(entry).toBeVisible()
  await expect(page).toHaveURL(/\/setup\/users/)

  // right PIN: signed in
  await typePin(app, PIN, entry)
  await app.expectHome()

  // removed: Profile protection -> None asks for the PIN first
  await switchUserFromDrawer(app)
  await (await openUserMenu(app, user)).getByRole('menuitem', { name: 'Profile protection' }).click()
  await page.getByRole('dialog', { name: 'Profile protection' }).getByRole('menuitem', { name: 'None' }).click()
  await expect(page.getByTestId('pin-entry')).toBeVisible()
  await typePin(app, PIN, page.getByTestId('pin-entry'))
  await expect(page.getByTestId('pin-entry')).toBeHidden()

  // no PIN any more: the circle signs straight in
  await app.activate(userCircle(page, user))
  await app.expectHome()
  await expect(page.getByTestId('pin-entry')).toHaveCount(0)
})

test('switch user from the drawer: sign in as a second user, then back to the first without a password', { tag: [TAG.desktop] }, async ({ page, app }) => {
  const env = testServerEnv()
  await app.devLogin()
  await app.expectHome()
  await expect(profileEntry(page)).toContainText(env.user)

  await switchUserFromDrawer(app)
  await expect(page).toHaveURL(/\/setup\/users$/) // a deliberate switch carries no ?next
  await expect(userCircle(page, env.user)).toBeVisible()
  await openPasswordLogin(app)
  await submitPassword(app, env.user2, env.password2)
  await app.expectHome()
  await expect(profileEntry(page)).toContainText(env.user2)

  await switchUserFromDrawer(app)
  await expect(userCircle(page, env.user)).toBeVisible()
  await expect(userCircle(page, env.user2)).toBeVisible()
  await app.activate(userCircle(page, env.user))
  await app.expectHome()
  await expect(profileEntry(page)).toContainText(env.user)
})

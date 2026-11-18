// Reusable steps of the sign-in screens (server list, user list, login dialog). Specs compose them; each step
// asserts the screen it ends on, so a failing step names the screen that broke.
import type { Page } from '@playwright/test'
import { expect } from '../fixtures'
import type { App } from '../fixtures/app'
import { testServerEnv } from '../fixtures/env'

export const serverList = (page: Page) => page.getByRole('heading', { name: 'Select Server' })
export const userList = (page: Page) => page.getByRole('heading', { name: 'Select User' })
export const addServerDialog = (page: Page) => page.getByRole('dialog', { name: 'Add Server' })
export const loginDialog = (page: Page) => page.getByRole('dialog', { name: 'Login' })

/** A user circle on the user list (role=button named after the user). */
export const userCircle = (page: Page, name: string) => page.locator('[data-card-surface]').and(page.getByRole('button', { name, exact: true }))

/** Opens Add Server, submits `url` and waits for the user list. */
export async function addServer(app: App, url = testServerEnv().url) {
  const { page } = app
  await expect(serverList(page)).toBeVisible()
  await app.activate(page.getByRole('button', { name: 'Add Server' }))
  const dialog = addServerDialog(page)
  await dialog.getByRole('textbox', { name: 'Enter Server IP or URL' }).fill(url)
  await app.activate(dialog.getByRole('button', { name: 'Submit' }))
  await expect(userList(page)).toBeVisible({ timeout: 20_000 })
}

/** From the user list: Add User, then the username/password form (the dialog opens on Quick Connect). */
export async function openPasswordLogin(app: App) {
  const { page } = app
  await app.activate(page.getByRole('button', { name: 'Add User' }))
  const dialog = loginDialog(page)
  await app.activate(dialog.getByRole('button', { name: 'Use username/password' }))
  await expect(dialog.getByRole('textbox', { name: 'Username' })).toBeVisible()
  return dialog
}

/** Fills the password form and submits it. */
export async function submitPassword(app: App, username: string, password: string) {
  const dialog = loginDialog(app.page)
  await dialog.getByRole('textbox', { name: 'Username' }).fill(username)
  await dialog.getByRole('textbox', { name: 'Password' }).fill(password)
  await app.activate(dialog.getByRole('button', { name: 'Login', exact: true }))
}

/** Full sign-in through the UI from a signed-out start: add the test server, add the user, log in. */
export async function signInThroughUi(app: App, which: 'user' | 'user2' = 'user') {
  const env = testServerEnv()
  await addServer(app)
  await openPasswordLogin(app)
  await submitPassword(app, which === 'user' ? env.user : env.user2, which === 'user' ? env.password : env.password2)
}

/** The drawer's profile entry (user name + server name); activating it switches user. */
export const profileEntry = (page: Page) => page.locator('[data-shell-drawer] [data-drawer-id="profile"]')

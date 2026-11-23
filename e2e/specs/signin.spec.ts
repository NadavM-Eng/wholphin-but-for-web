// Sign-in: server list, Add Server (valid / unreachable / not a Jellyfin), user list, password login, deep links,
// session restore on reload.
import { E2E_BASE_URL, testServerEnv } from '../fixtures/env'
import { SIGNED_OUT, TAG, expect, test } from '../fixtures'
import { addServer, addServerDialog, loginDialog, openPasswordLogin, serverList, submitPassword, userCircle, userList } from '../flows/setup'

test.describe('signed out', () => {
  test.use(SIGNED_OUT)

  test('cold start: add server (unreachable, not a Jellyfin, valid), wrong then right password, lands on Home', { tag: [TAG.desktop, TAG.phone, TAG.engines, TAG.iphone] }, async ({ page, app, guard }) => {
    const env = testServerEnv()
    // An unreachable host, simulated so the test does not wait for real timeouts.
    await page.route(/^https?:\/\/unreachable\.test(:\d+)?\//, (r) => r.abort('connectionrefused'))
    // each engine words the refused connection differently (Firefox also logs it as a CORS console error)
    guard.allow(/^request-failed \S.* GET https?:\/\/unreachable\.test/, 'the test adds an unreachable server on purpose')
    guard.allow(/^console-error: .*Cross-Origin Request Blocked.*unreachable\.test/, 'Firefox reports the unreachable server as a CORS error too')
    guard.allow(new RegExp(`^http 404 GET ${E2E_BASE_URL}/System/Info/Public$`), 'the test adds the dev server, which is not a Jellyfin, on purpose')
    guard.allow(/^http 401 POST \S+\/Users\/AuthenticateByName$/, 'the test types a wrong password on purpose')

    await app.goto('/')
    await expect(page).toHaveURL(/\/setup\/servers$/)
    await expect(serverList(page)).toBeVisible()
    // no saved server: Add Server is the only card
    await expect(page.locator('[data-card-surface]')).toHaveCount(1)

    await app.activate(page.getByRole('button', { name: 'Add Server' }))
    const dialog = addServerDialog(page)
    const field = dialog.getByRole('textbox', { name: 'Enter Server IP or URL' })
    const submit = dialog.getByRole('button', { name: 'Submit' })
    await expect(submit).toBeDisabled()

    await field.fill('http://unreachable.test')
    await app.activate(submit)
    await expect(dialog.getByRole('alert')).toContainText('Unable to connect')
    // the error keeps Submit disabled until the text changes
    await expect(submit).toBeDisabled()

    await field.fill(E2E_BASE_URL)
    await app.activate(submit)
    await expect(dialog.getByRole('alert')).toContainText('Invalid server info')
    await expect(page).toHaveURL(/\/setup\/servers$/)

    await field.fill(env.url)
    await app.activate(submit)
    await expect(userList(page)).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(/\/setup\/users$/)

    // the test server hides its users: only Add User is listed
    await openPasswordLogin(app)
    await submitPassword(app, env.user, `${env.password}-wrong`)
    await expect(loginDialog(page).getByRole('alert')).toContainText('Invalid username or password')
    await expect(page).toHaveURL(/\/setup\/login/)

    await submitPassword(app, env.user, env.password)
    await app.expectHome()
    await expect(app.shell).toBeVisible()
  })

  test('a user the server lists without a password is signed in by the click, with no dialog; one with a password gets the dialog (users mocked)', { tag: [TAG.desktop, TAG.phone, TAG.engines] }, async ({ page, app, api }) => {
    const env = testServerEnv()
    // The test server hides its users and every account has a password: the list is mocked, and the sign-in the
    // app sends without a password is passed on with the account's real one.
    await page.route(/\/Users\/Public(\?|$)/, (r) =>
      r.fulfill({
        json: [
          { Id: api.userId, Name: env.user, HasPassword: false, HasConfiguredPassword: false },
          { Id: 'f'.repeat(32), Name: 'Locked', HasPassword: true, HasConfiguredPassword: true },
        ],
      }),
    )
    const sent: string[] = []
    await page.route(/\/Users\/AuthenticateByName$/, async (r) => {
      const body = r.request().postDataJSON() as { Username: string; Pw: string }
      sent.push(`${body.Username}|${body.Pw}`)
      await r.continue({ postData: JSON.stringify({ ...body, Pw: env.password }) })
    })
    const visited: string[] = []
    page.on('framenavigated', (f) => f === page.mainFrame() && visited.push(new URL(f.url()).pathname))

    await app.goto('/')
    await addServer(app)
    // with a password: the login dialog, as before
    await app.activate(userCircle(page, 'Locked'))
    await expect(loginDialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(loginDialog(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/setup\/users/)
    expect(sent).toEqual([])

    // without one: Home at once
    const from = visited.length
    await app.activate(userCircle(page, env.user))
    await app.expectHome()
    expect(sent).toEqual([`${env.user}|`])
    expect(visited.slice(from).filter((p) => p.startsWith('/setup/login'))).toEqual([])
  })

  test('a deep link opened while signed out reopens after sign-in', { tag: [TAG.desktop] }, async ({ page, app, api }) => {
    const movie = await api.findMovie('Spring')
    const deepLink = `/item/${movie.Id}?from=e2e`
    await app.goto(deepLink)
    await expect(page).toHaveURL((u) => u.pathname === '/setup/servers' && u.searchParams.get('next') === deepLink)

    await addServer(app)
    await expect(page).toHaveURL((u) => u.pathname === '/setup/users' && u.searchParams.get('next') === deepLink)
    await openPasswordLogin(app)
    const env = testServerEnv()
    await submitPassword(app, env.user, env.password)

    await expect(page).toHaveURL((u) => u.pathname + u.search === deepLink, { timeout: 20_000 })
    await expect(app.detailButtons).toBeVisible()
    await expect(app.routeStub).toHaveCount(0)
    // the movie's detail page (its title as text, or as the logo's alt text)
    await expect(app.pageRoot.getByText(movie.Name!, { exact: true }).or(app.pageRoot.getByAltText(movie.Name!, { exact: true })).first()).toBeVisible()
  })

  test('keyboard only: add server and sign in with Tab, Enter and typing', { tag: [TAG.keyboard] }, async ({ page, app }) => {
    const env = testServerEnv()
    await app.goto('/')
    await expect(serverList(page)).toBeVisible()
    // initial focus: the Add Server card
    await expect(app.focused).toHaveAccessibleName('Add Server')
    await page.keyboard.press('Enter')
    const field = addServerDialog(page).getByRole('textbox', { name: 'Enter Server IP or URL' })
    await expect(field).toBeFocused()
    await page.keyboard.type(env.url)
    await page.keyboard.press('Enter')

    await expect(userList(page)).toBeVisible({ timeout: 20_000 })
    // a server without saved users: nothing has the focus on arrival (UserList.kt requests it only when there
    // are users); the first arrow key lands on Add User
    // (the card shows once the server's user list has answered; before that only "Switch servers" is there)
    await expect(page.getByRole('button', { name: 'Add User' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true)
    await page.keyboard.press('ArrowDown')
    await expect(app.focused).toHaveAccessibleName('Add User')
    await page.keyboard.press('Enter')
    // Quick Connect first; its "Use username/password" button has focus
    const switchButton = loginDialog(page).getByRole('button', { name: 'Use username/password' })
    await expect(switchButton).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(loginDialog(page).getByRole('textbox', { name: 'Username' })).toBeFocused()
    await page.keyboard.type(env.user)
    await page.keyboard.press('Enter') // Enter in the username box moves to the password box
    await expect(loginDialog(page).getByRole('textbox', { name: 'Password' })).toBeFocused()
    await page.keyboard.type(env.password)
    await page.keyboard.press('Enter')
    await app.expectHome()
  })
})

test.describe('signed in', () => {
  test('the session survives a reload', { tag: [TAG.desktop, TAG.phone, TAG.engines] }, async ({ page, app }) => {
    await app.goto('/')
    await app.expectHome()
    await page.reload()
    await app.expectHome()
    await expect(page).not.toHaveURL(/\/setup\//)
  })

  test('a reload on an inner page stays there', { tag: [TAG.desktop] }, async ({ page, app }) => {
    const favorites = app.drawer.getByRole('link', { name: 'Favorites' })
    await app.goto('/favorites')
    await expect(app.gridCards.first()).toBeVisible()
    await expect(favorites).toHaveAttribute('aria-current', 'page')
    await page.reload()
    // the page records its tab in the URL once it loaded (?tab=Movie)
    await expect(page).toHaveURL(/\/favorites(\?tab=\w+)?$/)
    await expect(app.gridCards.first()).toBeVisible()
    // a page the drawer leads to has no Back button
    await expect(app.backButton).toHaveCount(0)
    await expect(favorites).toHaveAttribute('aria-current', 'page')
  })
})

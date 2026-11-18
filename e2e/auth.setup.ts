// Setup project: one signed-in browser profile per project, through the dev sign-in endpoint (/dev/login,
// tools/vite-dev-session.ts reads the test credentials server-side). Tests start from these storage states.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { e2eDeviceId } from './fixtures/env'
import { SIGNED_IN_PROJECTS, storageStatePath, type SignedInProject } from './projects'

for (const name of Object.keys(SIGNED_IN_PROJECTS) as SignedInProject[]) {
  test(`sign in for the ${name} project`, async ({ browser }) => {
    const context = await browser.newContext({ ...SIGNED_IN_PROJECTS[name], baseURL: test.info().project.use.baseURL })
    // a fixed device id per project: re-running replaces the previous token instead of adding devices
    await context.addInitScript((id) => {
      try {
        if (!localStorage.getItem('wholphin.deviceId')) localStorage.setItem('wholphin.deviceId', id)
      } catch {
        // no storage on about:blank
      }
    }, e2eDeviceId(name))
    const page = await context.newPage()
    await page.goto('/dev/login?server=test')
    await page.waitForURL((u) => u.pathname === '/', { timeout: 30_000 })
    await expect(page.locator('[data-shell]')).toBeVisible()
    const file = storageStatePath(name)
    mkdirSync(path.dirname(file), { recursive: true })
    await context.storageState({ path: file })
    await context.close()
  })
}

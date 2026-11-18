// Shared "nothing went wrong in the background" check: every test fails when a page it visited logged a
// console error, threw, or had a request fail (network error or HTTP >= 400), unless an allow-list entry
// below (suite-wide, each with its reason) or `guard.allow()` in the test (for failures the test provokes on
// purpose) covers it.
import type { ConsoleMessage, Page, Request, Response } from '@playwright/test'

export interface Allowance {
  /** matched against the issue line ("console-error: …", "http 404 GET http://…/path", "request-failed …") */
  pattern: RegExp
  /** why this is expected; shown in the report when it matched */
  reason: string
}

/**
 * Suite-wide allow-list. Keep it short: every entry hides a class of failures from every test.
 */
export const GLOBAL_ALLOWANCES: readonly Allowance[] = [
  {
    pattern: /^http 404 GET \S+\/wholphin\/public$/,
    reason:
      'Home probes for the optional "Wholphin" server plugin (src/features/home/model/homeSettings.ts isServerPluginInstalled); ' +
      'the test server does not have it, so 404 is the normal answer.',
  },
  {
    // Chromium, Firefox and WebKit word a cancelled request differently
    pattern: /^request-failed (net::ERR_ABORTED|NS_BINDING_ABORTED|Load request cancelled|cancelled) /,
    reason:
      'Requests the app cancels on purpose: TanStack Query aborts fetches of unmounted pages, and the browser aborts image ' +
      'and module loads of a document that is navigated away. A cancelled request is not a failure.',
  },
]

/** Console lines that carry no signal (dev-server chatter). */
const CONSOLE_NOISE = [/^\[vite\]/, /Download the React DevTools/]

export class PageGuard {
  readonly issues: string[] = []
  private readonly allowances: Allowance[] = [...GLOBAL_ALLOWANCES]
  readonly matched = new Map<string, string>()
  private readonly detach: Array<() => void> = []

  watch(page: Page) {
    const onConsole = (m: ConsoleMessage) => {
      if (m.type() !== 'error') return
      const text = m.text()
      // "Failed to load resource" repeats a failed response, which the response listener reports with its URL.
      if (/^Failed to load resource/.test(text)) return
      if (CONSOLE_NOISE.some((re) => re.test(text))) return
      this.add(`console-error: ${text.slice(0, 500)}`)
    }
    const onPageError = (e: Error) => this.add(`pageerror: ${e.message.slice(0, 500)}`)
    const onResponse = (res: Response) => {
      if (res.status() < 400) return
      this.add(`http ${res.status()} ${res.request().method()} ${stripQuery(res.url())}`)
    }
    const onFailed = (req: Request) => {
      if (req.url().startsWith('data:')) return
      this.add(`request-failed ${req.failure()?.errorText ?? 'unknown'} ${req.method()} ${stripQuery(req.url())}`)
    }
    page.on('console', onConsole)
    page.on('pageerror', onPageError)
    page.on('response', onResponse)
    page.on('requestfailed', onFailed)
    this.detach.push(() => {
      page.off('console', onConsole)
      page.off('pageerror', onPageError)
      page.off('response', onResponse)
      page.off('requestfailed', onFailed)
    })
  }

  /** Expect a failure the test provokes on purpose (e.g. adding an unreachable server). */
  allow(pattern: RegExp, reason: string) {
    this.allowances.push({ pattern, reason })
  }

  private add(line: string) {
    const hit = this.allowances.find((a) => a.pattern.test(line))
    if (hit) this.matched.set(line, hit.reason)
    else this.issues.push(line)
  }

  dispose() {
    this.detach.forEach((d) => d())
    this.detach.length = 0
  }
}

function stripQuery(url: string): string {
  // Image and API URLs carry ids and tags in the query; the path is enough to recognise them, and the query may
  // hold an api_key.
  return url.split('?')[0]
}

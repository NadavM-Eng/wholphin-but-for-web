/// <reference lib="dom" />
// Settle detection: a picture is taken only when the page has stopped changing, never after a fixed sleep.
// Conditions (all must hold on two consecutive passes):
//   1. no API/asset request in flight for a quiet window (streams, websockets and the Vite HMR socket are ignored)
//   2. web fonts loaded
//   3. every <img> intersecting the viewport is complete and decoded
//   4. no visible [aria-busy="true"] element (the app's spinners)
//   5. the layout of everything in the viewport is identical across two animation frames
import type { Page, Request } from '@playwright/test'

const IGNORED_TYPES = new Set(['websocket', 'eventsource', 'media', 'manifest', 'ping'])

export interface NetTracker {
  inflight(): number
  /** requests that are not Vite internals or images/fonts: "API calls" */
  apiCount(): number
  lastActivity(): number
  dispose(): void
}

export function trackNetwork(page: Page): NetTracker {
  const pending = new Set<Request>()
  let api = 0
  let last = Date.now()
  const relevant = (r: Request) => !IGNORED_TYPES.has(r.resourceType()) && !r.url().startsWith('data:') && !r.url().includes('/@vite/')
  const onReq = (r: Request) => {
    if (!relevant(r)) return
    pending.add(r)
    last = Date.now()
    if (r.resourceType() === 'fetch' || r.resourceType() === 'xhr') api++
  }
  const done = (r: Request) => {
    if (pending.delete(r)) last = Date.now()
  }
  page.on('request', onReq)
  page.on('requestfinished', done)
  page.on('requestfailed', done)
  return {
    inflight: () => pending.size,
    apiCount: () => api,
    lastActivity: () => last,
    dispose: () => {
      page.off('request', onReq)
      page.off('requestfinished', done)
      page.off('requestfailed', done)
    },
  }
}

/** Runs in the page: resolves true when fonts, images and layout are stable. */
const PAGE_STABLE = `(async () => {
  try { await document.fonts.ready } catch {}
  const vw = innerWidth, vh = innerHeight
  const inView = (r) => r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw
  const imgs = Array.from(document.images).filter((i) => inView(i.getBoundingClientRect()))
  await Promise.all(imgs.map((i) => (i.complete && i.naturalWidth > 0 ? i.decode().catch(() => {}) : i.complete ? null : new Promise((res) => { i.addEventListener('load', res, { once: true }); i.addEventListener('error', res, { once: true }); setTimeout(res, 3000) }).then(() => i.decode().catch(() => {})))))
  const busy = Array.from(document.querySelectorAll('[aria-busy="true"]')).some((e) => inView(e.getBoundingClientRect()) && getComputedStyle(e).visibility !== 'hidden')
  if (busy) return false
  const sig = () => {
    let s = '', n = 0
    for (const e of document.querySelectorAll('body *')) {
      const r = e.getBoundingClientRect()
      if (!inView(r)) continue
      s += Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + ',' + Math.round(r.height) + ';'
      if (++n > 800) break
    }
    return s + '|' + document.documentElement.scrollHeight + '|' + document.images.length
  }
  const a = sig()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const b = sig()
  return a === b
})()`

export async function settle(page: Page, net: NetTracker, opts: { timeoutMs: number; quietMs?: number }): Promise<{ timedOut: boolean }> {
  const quiet = opts.quietMs ?? 350
  const deadline = Date.now() + opts.timeoutMs
  let stablePasses = 0
  while (Date.now() < deadline) {
    if (net.inflight() > 0 || Date.now() - net.lastActivity() < quiet) {
      await page.waitForTimeout(60)
      stablePasses = 0
      continue
    }
    let stable = false
    try {
      stable = (await page.evaluate(PAGE_STABLE)) as boolean
    } catch {
      // navigation in flight: the execution context is gone, try again
      stable = false
    }
    if (stable && net.inflight() === 0 && Date.now() - net.lastActivity() >= quiet) {
      if (++stablePasses >= 2) return { timedOut: false }
    } else {
      stablePasses = 0
      await page.waitForTimeout(60)
    }
  }
  return { timedOut: true }
}

/** Injected into every document: kills CSS animation/transition so pictures are deterministic. */
export const NO_ANIMATION_CSS = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition:none!important;scroll-behavior:auto!important;caret-color:transparent!important}`

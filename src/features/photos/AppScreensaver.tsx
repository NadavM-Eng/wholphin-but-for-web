import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../api/session'
import { Clock } from '../../app/shell/Clock'
import { usePrefs } from '../../stores/preferences'
import { onScreensaverStart } from '../settings/screensaverEvents'
import styles from './AppScreensaver.module.css'
import { screenImageEdge } from './slideshowModel'
import { fetchScreensaverPage, SCREENSAVER_PAGE_SIZE, screensaverRequest, screensaverView, type ScreensaverItemView } from './screensaverItems'
import { dimShown, installScreensaverService, pulse, screensaverShown, start, stop, useScreensaverStore } from './screensaverService'

/** ScreensaverService.enterAnimation / exitAnimation. */
const ENTER_MS = 1000
const EXIT_MS = 500

/** Keeps `visible` content mounted for the exit fade. */
function usePresence(visible: boolean): { mounted: boolean; shown: boolean } {
  const [mounted, setMounted] = useState(visible)
  const [entered, setEntered] = useState(false)
  if (visible && !mounted) setMounted(true)
  useEffect(() => {
    if (visible) {
      const id = requestAnimationFrame(() => setEntered(true))
      return () => cancelAnimationFrame(id)
    }
    const id = setTimeout(() => {
      setMounted(false)
      setEntered(false)
    }, EXIT_MS)
    return () => clearTimeout(id)
  }, [visible])
  return { mounted, shown: visible && entered }
}

/**
 * The in-app screensaver and dim layer (W/ui/components/AppScreensaver.kt, MainContent.kt:137-160,
 * MainActivity.dispatchKeyEvent). Place once at the app root, inside the query client and i18n providers. While
 * a user is signed in it runs the idle timer; any key, pointer movement, touch or wheel dismisses the screensaver
 * (the key or click that wakes it does nothing else). Settings' "Start screensaver" shows it at once.
 */
export function AppScreensaver() {
  const session = useSession()
  if (!session) return null
  return <ScreensaverHost />
}

function ScreensaverHost() {
  const state = useScreensaverStore()
  const dimPercent = usePrefs('screensaverDimPercent')

  useEffect(() => installScreensaverService(), [])
  useEffect(() => onScreensaverStart(() => start()), [])

  // input: MainActivity.dispatchKeyEvent (any key wakes; the waking key is consumed), plus pointer / touch / wheel
  useEffect(() => {
    let lastPulse = 0
    const awake = () => {
      const s = useScreensaverStore.getState()
      return screensaverShown(s) || dimShown(s)
    }
    const wake = (e: Event, consume: boolean) => {
      if (awake()) {
        stop(false)
        pulse()
        if (consume) {
          e.preventDefault()
          e.stopPropagation()
        }
        return
      }
      const now = performance.now()
      // pointer moves arrive at 60+ Hz; re-arming the timers twice a second is plenty
      if (e.type === 'pointermove' && now - lastPulse < 500) return
      lastPulse = now
      pulse()
    }
    // the click that follows a waking pointerdown must not reach the page
    let swallowClick = false
    const onKey = (e: KeyboardEvent) => wake(e, true)
    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return
      swallowClick = false
      e.preventDefault()
      e.stopPropagation()
    }
    const onDownCapture = (e: PointerEvent) => {
      swallowClick = awake()
      wake(e, true)
    }
    const onMove = (e: Event) => wake(e, false)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop(true)
      else pulse()
    }
    // media starting to play hides the screensaver (playback keeps the screen on upstream)
    const onPlaying = () => {
      if (awake()) stop(false)
      pulse()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDownCapture, true)
    window.addEventListener('click', onClick, true)
    window.addEventListener('pointermove', onMove, { capture: true, passive: true })
    window.addEventListener('wheel', onMove, { capture: true, passive: true })
    window.addEventListener('touchstart', onMove, { capture: true, passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('playing', onPlaying, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDownCapture, true)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('wheel', onMove, true)
      window.removeEventListener('touchstart', onMove, true)
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('playing', onPlaying, true)
    }
  }, [])

  const show = screensaverShown(state)
  const saver = usePresence((state.enabled || state.enabledTemp) && show)
  const dim = usePresence(dimShown(state) || (state.dimEnabled && show))

  if (!saver.mounted && !dim.mounted) return null
  return createPortal(
    <>
      {saver.mounted && (
        <div className={styles.root} data-screensaver data-shown={saver.shown ? '' : undefined} style={{ ['--enter' as string]: `${ENTER_MS}ms`, ['--exit' as string]: `${EXIT_MS}ms` }}>
          <ScreensaverContent />
        </div>
      )}
      {dim.mounted && (
        <div
          className={styles.dim}
          data-screensaver-dim
          data-shown={dim.shown ? '' : undefined}
          style={{ ['--dim' as string]: String(dimPercent / 100), ['--enter' as string]: `${ENTER_MS}ms`, ['--exit' as string]: `${EXIT_MS}ms` }}
        />
      )}
    </>,
    document.body,
  )
}

type Current = { kind: 'item'; view: ScreensaverItemView } | { kind: 'empty' } | { kind: 'error' } | null

/** `AppScreensaverContent`: the item loop runs while it is mounted (a new random order each time). */
function ScreensaverContent() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const showClock = usePrefs('screensaverShowClock')
  const duration = usePrefs('screensaverDuration')
  const animate = usePrefs('screensaverAnimate')
  const itemTypes = usePrefs('screensaverItemTypes')
  const maxAge = usePrefs('screensaverMaxAge')
  const [current, setCurrent] = useState<Current>(null)
  const [previous, setPrevious] = useState<ScreensaverItemView | null>(null)
  const [logoError, setLogoError] = useState(false)

  useEffect(() => {
    if (!session) return
    const ctrl = new AbortController()
    const api = session.api
    const base = api.basePath
    const edge = screenImageEdge({ width: window.innerWidth, height: window.innerHeight }, window.devicePixelRatio || 1)
    const req = screensaverRequest({ userId: session.user.id, itemTypes, maxAge })
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    const preload = (url: string) =>
      new Promise<void>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('image'))
        img.src = url
      })
    void (async () => {
      let total: number
      const pages = new Map<number, Awaited<ReturnType<typeof fetchScreensaverPage>>['items']>()
      try {
        const first = await fetchScreensaverPage(api, req, 0, ctrl.signal)
        total = first.total
        pages.set(0, first.items)
      } catch {
        if (!ctrl.signal.aborted) setCurrent({ kind: 'error' })
        return
      }
      if (total === 0) {
        setCurrent({ kind: 'empty' })
        return
      }
      let index = 0
      let last: ScreensaverItemView | null = null
      while (!ctrl.signal.aborted) {
        try {
          const n = Math.floor(index / SCREENSAVER_PAGE_SIZE)
          let page = pages.get(n)
          if (!page) {
            page = (await fetchScreensaverPage(api, req, n, ctrl.signal)).items
            pages.set(n, page)
            // keep memory small: the loop only moves forward
            pages.delete(n - 2)
          }
          const item = page[index - n * SCREENSAVER_PAGE_SIZE]
          const view = item ? screensaverView(base, item, { edge, locale: i18n.language }) : null
          if (view) {
            await preload(view.imageUrl)
            if (ctrl.signal.aborted) break
            setPrevious(last)
            setLogoError(false)
            setCurrent({ kind: 'item', view })
            last = view
            await sleep(duration)
          }
        } catch {
          if (ctrl.signal.aborted) break
          await sleep(duration)
        }
        index++
        if (index >= total) index = 0
      }
    })()
    return () => ctrl.abort()
  }, [session, itemTypes, maxAge, duration, i18n.language])

  const view = current?.kind === 'item' ? current.view : null
  return (
    <div className={styles.content} style={{ ['--duration' as string]: `${duration}ms` }}>
      {current?.kind === 'empty' || current?.kind === 'error' ? (
        <Placeholder text={current.kind === 'empty' ? t('no_results') : t('web_screensaver_error')} duration={duration} />
      ) : (
        <>
          <div className={styles.scale} data-animate={animate ? '' : undefined}>
            {previous && previous.id !== view?.id && <img key={`p-${previous.id}`} className={styles.image} src={previous.imageUrl} alt="" />}
            {view && <img key={view.id} className={`${styles.image} ${styles.fadeIn}`} src={view.imageUrl} alt="" />}
          </div>
          {view &&
            (view.logoUrl && !logoError ? (
              <img key={`l-${view.id}`} className={styles.logo} src={view.logoUrl} alt={view.title} onError={() => setLogoError(true)} />
            ) : (
              <div className={styles.titleBox}>
                <p className={styles.title} dir="auto">
                  {view.title}
                </p>
              </div>
            ))}
        </>
      )}
      <div className={styles.vignette} />
      {showClock && <div className={styles.scrim} />}
      {showClock && <Clock placement="overlay" />}
    </div>
  )
}

const ALIGNMENTS = ['ts', 'tc', 'te', 'cs', 'cc', 'ce', 'bs', 'bc', 'be'] as const

/** `ScreensaverPlaceholder`: the message jumps to another of 9 positions every `duration`, cross-fading. */
function Placeholder({ text, duration }: { text: string; duration: number }) {
  const [align, setAlign] = useState<(typeof ALIGNMENTS)[number]>('bs')
  const [fade, setFade] = useState(true)
  const alignRef = useRef(align)
  useEffect(() => {
    let inner: ReturnType<typeof setTimeout> | null = null
    const id = setInterval(() => {
      const options = ALIGNMENTS.filter((a) => a !== alignRef.current)
      const next = options[Math.floor(Math.random() * options.length)]
      setFade(false)
      inner = setTimeout(() => {
        alignRef.current = next
        setAlign(next)
        setFade(true)
      }, 600)
    }, duration)
    return () => {
      clearInterval(id)
      if (inner) clearTimeout(inner)
    }
  }, [duration])
  return (
    <div className={styles.placeholder} data-align={align}>
      <p className={styles.placeholderText} data-visible={fade ? '' : undefined}>
        {text}
      </p>
    </div>
  )
}

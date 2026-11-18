import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useScrollRestore } from '../../app/useScrollRestore'
import { BackButton, useHideBackButton } from '../../app/shell'
import styles from './FullPage.module.css'
import { pickInView } from './fullPageFocus'

export type FullPageProps = {
  title: string
  children: ReactNode
  /** Optional actions next to the title. */
  actions?: ReactNode
}

/**
 * Full-screen scrollable page (Debug, License): 16dp padding, Up/Down scroll 100px and PageUp/PageDown 300px
 * when the page itself has focus (DebugPage.kt key handling); Escape / Back return (shell). Left/Right on the
 * page, and Up/Down once it cannot scroll further, hand focus to the focusable element in view (the License
 * rows: AboutLibraries' list is moved through with the D-pad), instead of the global "nothing focused" rule
 * that picks the first element at the top of the page and scrolls back there.
 */
export function FullPage({ title, children, actions }: FullPageProps) {
  // the header's Back replaces the shell's floating one; Escape is handled by the shell (useBackKey)
  useHideBackButton()
  const scroller = useRef<HTMLDivElement | null>(null)
  const header = useRef<HTMLElement | null>(null)
  const body = useRef<HTMLDivElement | null>(null)
  const restore = useScrollRestore<HTMLDivElement>('fullpage')

  useEffect(() => {
    scroller.current?.focus({ preventScroll: true })
  }, [])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const page = e.currentTarget
    const arrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown'
    if (arrow && e.shiftKey) return
    const by = { ArrowDown: 100, ArrowUp: -100, PageDown: 300, PageUp: -300 }[e.key]
    const atEdge = by != null && (by < 0 ? page.scrollTop <= 0 : page.scrollTop + page.clientHeight >= page.scrollHeight - 1)
    if (arrow && (by == null || atEdge)) {
      e.preventDefault()
      // at a scroll edge only content elements are entered: Debug's Up/Down never jump into the header
      focusInView(page, e.key === 'ArrowUp', by == null)
      return
    }
    if (by) {
      e.preventDefault()
      page.scrollBy({ top: by })
    }
  }

  const focusInView = (page: HTMLDivElement, up: boolean, orHeader: boolean) => {
    const box = page.getBoundingClientRect()
    const head = header.current
    // the sticky header covers the top of the scroller; it is the fallback when no content element is in view
    const view = { top: Math.max(box.top, head?.getBoundingClientRect().bottom ?? box.top), bottom: box.bottom }
    for (const [scope, span] of [
      [body.current, view],
      [orHeader ? head : null, { top: box.top, bottom: box.bottom }],
    ] as const) {
      const els = Array.from(scope?.querySelectorAll<HTMLElement>('[data-focusable], button, a[href]') ?? [])
      const i = pickInView(
        els.map((el) => el.getBoundingClientRect()),
        span,
        up,
      )
      if (i >= 0) {
        els[i].focus({ preventScroll: true })
        return
      }
    }
  }

  return (
    <div
      ref={(el) => {
        scroller.current = el
        restore(el)
      }}
      className={styles.page}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {/* sticky: always in view, so focus on its buttons must not scroll the page (bringIntoView) */}
      <header ref={header} className={styles.header} data-focus-scroll="none">
        <BackButton />
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.actions}>{actions}</div>
      </header>
      <div ref={body} className={styles.body}>
        {children}
      </div>
    </div>
  )
}

import clsx from 'clsx'
import { useLayoutEffect, useRef, useState } from 'react'
import { ELLIPSIS, middleEllipsize } from './middleEllipsis'
import styles from './MiddleEllipsisText.module.css'

/**
 * One line of text cut in the middle when it does not fit (`TextOverflow.MiddleEllipsis`, used by the controller's
 * title and subtitle so the end of "S1E1 - Name - date" stays readable). CSS can only cut at the end, so the text
 * is measured in a hidden copy and shortened here; until then (and without layout) the CSS end ellipsis applies.
 */
export function MiddleEllipsisText({ text, className }: { text: string; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const sizer = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(text)

  useLayoutEffect(() => {
    const el = box.current
    const node = sizer.current?.firstChild
    if (!el || !node || typeof ResizeObserver === 'undefined') {
      setShown(text)
      return
    }
    // UTF-16 offset of every code point, for Range
    const offsets = [0]
    for (const ch of text) offsets.push(offsets[offsets.length - 1] + ch.length)
    const range = document.createRange()
    const span = (from: number, to: number) => {
      range.setStart(node, from)
      range.setEnd(node, to)
      return range.getBoundingClientRect().width
    }
    const fit = () => {
      const avail = el.clientWidth
      if (avail <= 0) return
      setShown(middleEllipsize(text, avail, span(text.length, text.length + ELLIPSIS.length), (s, e) => span(offsets[s], offsets[e])))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    // the widths change when the web font arrives
    void document.fonts?.ready.then(fit)
    return () => ro.disconnect()
  }, [text])

  return (
    <div ref={box} className={clsx(styles.box, className)}>
      <span ref={sizer} className={styles.sizer} aria-hidden>
        {text + ELLIPSIS}
      </span>
      {shown}
    </div>
  )
}

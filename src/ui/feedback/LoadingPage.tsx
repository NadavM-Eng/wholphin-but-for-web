import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { CircularProgress } from './CircularProgress'
import styles from './LoadingPage.module.css'

export type LoadingPageProps = {
  /** Wait before showing the spinner (upstream `DelayedLoadingPage` uses 300ms). 0 = immediately. */
  delayMs?: number
  label?: string
  className?: string
}

/** Full-area 48dp spinner (upstream `LoadingPage` / `DelayedLoadingPage`, `CircularProgress.kt:28-104`). */
export function LoadingPage({ delayMs = 0, label, className }: LoadingPageProps) {
  const [show, setShow] = useState(delayMs <= 0)
  useEffect(() => {
    if (delayMs <= 0) return
    const t = setTimeout(() => setShow(true), delayMs)
    return () => clearTimeout(t)
  }, [delayMs])
  return (
    <div className={clsx(styles.page, className)} aria-busy aria-label={label} role="status">
      {show && <CircularProgress size={48} label={label} />}
    </div>
  )
}

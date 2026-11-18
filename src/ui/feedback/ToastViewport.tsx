import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './ToastViewport.module.css'

/** Fixed bottom-center stack for `Toast`s (Android toasts sit at the bottom center), rendered in a portal. */
export function ToastViewport({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(<div className={styles.viewport}>{children}</div>, document.body)
}

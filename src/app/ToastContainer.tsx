import { createPortal } from 'react-dom'
import styles from './ToastContainer.module.css'
import { useToastStore } from './toast'

/**
 * Toasts, drawn above everything like an Android Toast. In <body>, next to the dialogs: the app root is its own
 * stacking context (global.css), so from inside it a toast would sit under an open dialog's scrim.
 */
export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className={styles.container} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={styles.toast}>
          {t.message}
        </div>
      ))}
    </div>,
    document.body,
  )
}

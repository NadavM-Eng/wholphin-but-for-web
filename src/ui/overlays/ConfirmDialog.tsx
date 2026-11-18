import { Button } from '../buttons/Button'
import { TextButton } from '../buttons/TextButton'
import { MaterialIcon } from '../icons/MaterialIcon'
import styles from './ConfirmDialog.module.css'
import { Dialog } from './Dialog'

export type ConfirmDialogProps = {
  open: boolean
  title: string
  body?: string | null
  cancelLabel: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
  /** Body text color (upstream `bodyColor`, onSurface by default). */
  bodyColor?: string
  /**
   * `delete`: upstream `ConfirmDeleteDialog` (`Dialogs.kt:527-596`): `title` is the small heading
   * ("Delete item", titleMedium), `body` the item name (titleLarge), Cancel (72dp) and a Confirm button
   * with a red delete icon, 32dp apart, 3dp elevation.
   */
  variant?: 'confirm' | 'delete'
}

/** Upstream `ConfirmDialog` (`Dialogs.kt:437-525`): BasicDialog, 16dp padding, 8dp gap, centered titleLarge. */
export function ConfirmDialog({
  open,
  title,
  body,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  bodyColor,
  variant = 'confirm',
}: ConfirmDialogProps) {
  if (variant === 'delete') {
    return (
      <Dialog open={open} onClose={onCancel} variant="basic" elevation={3} label={title}>
        <div className={styles.deleteColumn}>
          <p className={styles.deleteHeading}>{title}</p>
          {body && <p className={styles.deleteName}>{body}</p>}
          <div className={styles.deleteButtons}>
            <Button onClick={onCancel} className={styles.fixedWidth}>
              {cancelLabel}
            </Button>
            <Button onClick={onConfirm}>
              <span className={styles.confirmInner}>
                <MaterialIcon name="delete" color="var(--fx-delete-red)" />
                {confirmLabel}
              </span>
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }
  return (
    <Dialog open={open} onClose={onCancel} variant="basic" elevation={1} label={title}>
      <div className={styles.column}>
        <p className={styles.title}>{title}</p>
        {body && (
          <p className={styles.body} style={bodyColor ? { color: bodyColor } : undefined}>
            {body}
          </p>
        )}
        <div className={styles.buttons}>
          <TextButton onClick={onCancel}>{cancelLabel}</TextButton>
          <TextButton onClick={onConfirm}>{confirmLabel}</TextButton>
        </div>
      </div>
    </Dialog>
  )
}

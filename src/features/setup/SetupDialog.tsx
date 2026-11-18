import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Dialog } from '../../ui'
import styles from './setup.module.css'
import { revealOnFocus, useKeyboardInset } from './useKeyboardInset'

export type SetupDialogProps = {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
  /** Tonal elevation in dp: AddServerDialog uses 10, the login dialog the BasicDialog default. */
  elevation?: number
  /** `wide`: the 40%-of-screen column of the add-server / login dialogs; `compact`: PIN dialogs. */
  size?: 'wide' | 'compact'
  initialFocus?: () => HTMLElement | null | undefined
}

/** surfaceColorAtElevation: surfaceTint (= primary) at (4.5 ln(e+1) + 2)% over surface. */
function elevated(dp: number): string {
  const pct = (4.5 * Math.log(dp + 1) + 2).toFixed(1)
  return `color-mix(in srgb, var(--c-primary) ${pct}%, var(--c-surface))`
}

/**
 * `BasicDialog` for the setup screens: Column(padding 16dp, spacedBy 8dp). Re-centres above an on-screen
 * keyboard so the focused field is never hidden behind it.
 */
export function SetupDialog({ open, onClose, label, children, elevation = 1, size = 'wide', initialFocus }: SetupDialogProps) {
  const inset = useKeyboardInset(open)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="basic"
      label={label}
      initialFocus={initialFocus}
      className={clsx(styles.dialog, size === 'wide' ? styles.dialogWide : styles.dialogCompact)}
      style={{
        background: elevated(elevation),
        marginBlockEnd: inset || undefined,
        maxHeight: inset ? `calc(100% - ${inset}px)` : undefined,
      }}
    >
      <div className={styles.dialogColumn} onFocus={revealOnFocus}>
        {children}
      </div>
    </Dialog>
  )
}

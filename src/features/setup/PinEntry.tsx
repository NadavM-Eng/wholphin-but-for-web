import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { Button, FaIcon, MaterialIcon, type FaName } from '../../ui'
import type { PinKey } from './pin'
import styles from './PinEntry.module.css'

const ARROWS: { key: PinKey; icon: FaName; label: string }[] = [
  { key: 'L', icon: 'arrow_left_long', label: 'web_pin_left' },
  { key: 'U', icon: 'arrow_up_long', label: 'web_pin_up' },
  { key: 'R', icon: 'arrow_right_long', label: 'web_pin_right' },
  { key: 'D', icon: 'arrow_down_long', label: 'web_pin_down' },
]
const DIGITS: PinKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** `PinArrowRow`: the four arrow glyphs + "[0–9]" (headlineSmall); the arrows are tappable on the web. */
export function PinArrowRow({ onKey }: { onKey: (k: PinKey) => void }) {
  const { t } = useTranslation()
  return (
    <div className={styles.arrowRow}>
      {ARROWS.map((a) => (
        <button
          key={a.key}
          type="button"
          className={styles.arrow}
          aria-label={t(a.label)}
          data-focusable
          onClick={() => onKey(a.key)}
        >
          <FaIcon name={a.icon} />
        </button>
      ))}
      <span className={styles.digitsHint}>{t('pin_digits_hint')}</span>
    </div>
  )
}

/** `PinEntryDots`: a pill (min 180x40dp, surfaceVariant@.8) with one 8dp dot per entered key. */
export function PinEntryDots({ count, error }: { count: number; error?: boolean }) {
  return (
    <div className={clsx(styles.dots, error && styles.dotsError)} aria-live="polite" aria-label={String(count)} data-pin-dots>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={styles.dot} />
      ))}
    </div>
  )
}

export type PinPadProps = {
  onKey: (k: PinKey) => void
  onBackspace: () => void
  /** Shows an OK key (PIN creation: upstream confirms with the centre button). */
  onConfirm?: () => void
}

/** On-screen keypad for touch and mouse (the TV app relies on the remote's digit and arrow keys). */
export function PinPad({ onKey, onBackspace, onConfirm }: PinPadProps) {
  const { t } = useTranslation()
  return (
    <div className={styles.pad}>
      {DIGITS.map((d) => (
        <Button key={d} className={styles.key} onClick={() => onKey(d)}>
          {d}
        </Button>
      ))}
      <Button className={styles.key} onClick={onBackspace} label={t('web_pin_backspace')}>
        <MaterialIcon name="backspace" />
      </Button>
      <Button className={styles.key} onClick={() => onKey('0')}>
        0
      </Button>
      {onConfirm ? (
        <Button className={styles.key} onClick={onConfirm} label={t('web_pin_ok')}>
          <span className={styles.ok}>{t('web_pin_ok')}</span>
        </Button>
      ) : (
        <span />
      )}
    </div>
  )
}

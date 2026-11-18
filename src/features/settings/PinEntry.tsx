import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, FaIcon, MaterialIcon } from '../../ui'
import styles from './PinEntry.module.css'
import { pinCharForKey } from './pinKeys'

export type PinEntryProps = {
  title: string
  /** Called after every appended / removed key with the whole sequence. */
  onChange?: (pin: string) => void
  /** Enter / the confirm button. Omitted in the remove flow (upstream hides the hint there). */
  onConfirm?: (pin: string) => void
}

/**
 * `PinEntryCreate` (W/ui/setup/PinEntry.kt): headlineLarge title, the arrow/digit hint row, the dots pill
 * and the confirm hint (web wording: upstream's "Press center to confirm" names the remote's button). A PIN is a sequence of arrow directions and digits. Web additions: Backspace
 * removes the last key (spec 08 ST-3), and an on-screen pad for mouse and touch. While the dots pill has
 * focus, arrow keys are PIN input, not navigation; Tab reaches the pad.
 */
export function PinEntry({ title, onChange, onConfirm }: PinEntryProps) {
  const { t } = useTranslation()
  const [pin, setPin] = useState('')
  const input = useRef<HTMLDivElement>(null)

  useEffect(() => {
    input.current?.focus({ preventScroll: true })
  }, [])

  const update = (next: string) => {
    setPin(next)
    onChange?.(next)
  }
  const append = (c: string) => update(pin + c)
  const backspace = () => update(pin.slice(0, -1))

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm?.(pin)
      return
    }
    if (e.key === 'Backspace') {
      e.preventDefault()
      backspace()
      return
    }
    // RTL does not change what a direction means on a remote, so arrows are taken literally.
    const c = pinCharForKey(e.key)
    if (c && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      append(c)
    }
  }

  const arrows = [
    { c: 'L', fa: 'arrow_left_long', label: 'web_pin_left' },
    { c: 'U', fa: 'arrow_up_long', label: 'web_pin_up' },
    { c: 'R', fa: 'arrow_right_long', label: 'web_pin_right' },
    { c: 'D', fa: 'arrow_down_long', label: 'web_pin_down' },
  ] as const

  return (
    <div className={styles.column}>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.hint} aria-hidden>
        {arrows.map((a) => (
          <FaIcon key={a.c} name={a.fa} className={styles.hintArrow} />
        ))}
        <span className={styles.hintDigits}>{t('pin_digits_hint')}</span>
      </div>
      <div
        ref={input}
        tabIndex={0}
        role="textbox"
        aria-label={title}
        aria-description={t('pin_digits_hint')}
        className={styles.dots}
        onKeyDown={onKeyDown}
        data-pin-input
      >
        {Array.from(pin, (_, i) => (
          <span key={i} className={styles.dot} />
        ))}
      </div>
      {onConfirm && <p className={styles.confirmHint}>{t('web_pin_confirm_hint')}</p>}
      <div className={styles.pad} data-focus-group dir="ltr">
        <div className={styles.arrows}>
          {arrows.map((a) => (
            <Button key={a.c} variant="icon" label={t(a.label)} className={styles[`arrow${a.c}`]} onClick={() => append(a.c)}>
              <FaIcon name={a.fa} />
            </Button>
          ))}
        </div>
        <div className={styles.digits}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <Button key={d} variant="icon" label={d} onClick={() => append(d)}>
              {d}
            </Button>
          ))}
          <Button variant="icon" label={t('web_pin_backspace')} onClick={backspace} disabled={!pin}>
            <MaterialIcon name="arrow_back" />
          </Button>
          <Button variant="icon" label="0" onClick={() => append('0')}>
            0
          </Button>
          {onConfirm ? (
            <Button variant="icon" label={t('confirm')} onClick={() => onConfirm(pin)}>
              <MaterialIcon name="check" />
            </Button>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  )
}

import clsx from 'clsx'
import styles from './Clock.module.css'
import { useClockString } from './useClockString'

export type ClockProps = {
  /** 'overlay': fixed top-end like TimeDisplay; 'inline': inside the phone top bar */
  placement: 'overlay' | 'inline'
}

/** W/ui/components/TimeDisplay.kt: bodyLarge at 18sp, onSurface, padding 16dp vertical / 24dp horizontal. */
export function Clock({ placement }: ClockProps) {
  const time = useClockString()
  return (
    <div className={clsx(styles.clock, placement === 'overlay' ? styles.overlay : styles.inline)} data-shell-clock>
      {time}
    </div>
  )
}

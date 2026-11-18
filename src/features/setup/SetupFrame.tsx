import clsx from 'clsx'
import { useState, type ReactNode } from 'react'
import styles from './SetupFrame.module.css'

export type SetupFrameProps = {
  title: string
  /** Second header line (server name). `null` keeps an invisible placeholder line, as the server picker does. */
  subtitle: string | null
  children: ReactNode
  /** Red message at the bottom (`SwitchErrorMessage`): version warning or connection error. */
  message?: string | null
  /** A dialog is open on top: `Modifier.dimAndBlur` (alpha .5, blur 16dp). */
  dimmed?: boolean
  /**
   * Slide the message when it changes (SwitchServerContent.kt:229-240 AnimatedContent: the new one slides
   * in from half its height below while the old one slides out by its full height). The user picker has none.
   */
  animateMessage?: boolean
}

/**
 * Shared frame of the server and user pickers (SwitchServerContent / SwitchUserContent): a centred
 * column (24dp gap, 16dp padding) with the displaySmall title and titleLarge subtitle (8dp apart), and the
 * message at the bottom edge of the window.
 */
export function SetupFrame({ title, subtitle, children, message, dimmed, animateMessage }: SetupFrameProps) {
  return (
    <div className={clsx(styles.frame, dimmed && styles.dimmed)} aria-hidden={dimmed || undefined}>
      <div className={styles.column}>
        <header className={styles.header}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle != null ? (
            <p className={styles.subtitle}>{subtitle}</p>
          ) : (
            <p className={clsx(styles.subtitle, styles.placeholder)} aria-hidden>
              &nbsp;
            </p>
          )}
        </header>
        {children}
      </div>
      <div className={styles.bottom}>
        {animateMessage ? (
          <AnimatedMessage message={message ?? ''} />
        ) : (
          <p className={styles.message} role={message ? 'alert' : undefined}>
            {message}
          </p>
        )}
      </div>
    </div>
  )
}

type Slot = { key: number; text: string }

function AnimatedMessage({ message }: { message: string }) {
  const [shown, setShown] = useState<{ current: Slot; leaving: Slot | null }>({
    current: { key: 0, text: message },
    leaving: null,
  })
  // Derived during render (no effect pass): a new message starts the transition.
  if (shown.current.text !== message) {
    setShown({ current: { key: shown.current.key + 1, text: message }, leaving: shown.current })
  }
  const { current, leaving } = shown
  const first = current.key === 0
  return (
    <div className={styles.messageBox}>
      {leaving && (
        <p
          key={leaving.key}
          className={clsx(styles.message, styles.messageOut)}
          aria-hidden
          onAnimationEnd={() => setShown((s) => (s.leaving?.key === leaving.key ? { ...s, leaving: null } : s))}
        >
          {leaving.text}
        </p>
      )}
      <p key={current.key} className={clsx(styles.message, !first && styles.messageIn)} role={current.text ? 'alert' : undefined}>
        {current.text}
      </p>
    </div>
  )
}

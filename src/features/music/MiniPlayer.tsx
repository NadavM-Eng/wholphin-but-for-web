import clsx from 'clsx'
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { nav } from '../../app/nav'
import { focusFirst } from '../../app/spatialNav'
import { useShellFlags } from '../../app/shell/shellFlags'
import { useCompactLayout } from '../../app/shell/useShellLayout'
import { useMusicQueue } from '../../stores/musicQueue'
import { DrawableIcon, FaIcon } from '../../ui'
import { useLinkClick } from '../common/links'
import { PlaybackButton } from '../playback/ui/PlaybackButton'
import styles from './MiniPlayer.module.css'
import { hasNext, next, togglePlay } from './service/musicService'

/** Height reserved at the bottom of the page while the bar shows (dp). */
export const MINI_PLAYER_HEIGHT = 64

/**
 * Web-only mini player. Upstream has only the drawer entry and the Now Playing screen; in a browser the user
 * browses other pages while music plays, so a compact bar sits at the bottom: album art, title / artist,
 * play-pause, next and a progress line. Activating the text opens Now Playing.
 */
export function MiniPlayer() {
  const { t } = useTranslation()
  const compact = useCompactLayout()
  const linkClick = useLinkClick()
  const status = useMusicQueue((s) => s.status)
  const entry = useMusicQueue((s) => s.entries[s.currentIndex] ?? null)
  const positionMs = useMusicQueue((s) => s.positionMs)
  const durationMs = useMusicQueue((s) => s.durationMs)
  const canNext = useMusicQueue(hasNext)
  // only beside the drawer: the full-screen routes (FullScreenLayout in routes.tsx) mount no AppShell
  const withShell = useShellFlags((s) => s.shellMounted > 0)
  const visible = status !== 'idle' && entry != null && withShell
  const barRef = useRef<HTMLElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  // Pages scroll the window: keep their last row clear of the bar.
  useEffect(() => {
    if (!visible) return
    document.body.dataset.musicBar = ''
    return () => {
      delete document.body.dataset.musicBar
    }
  }, [visible])

  // The bar sits outside the shell's page area, which is a focus trap for the arrow keys. Down from the page's
  // lowest element enters the bar: this runs on window after the spatial navigator (installed at startup), so
  // it only sees the keys that found nothing further down. Up leaves the bar again.
  useEffect(() => {
    if (!visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const active = document.activeElement
      if (!(active instanceof HTMLElement) || !active.closest('[data-page-root]')) return
      if (document.querySelector('[role="dialog"], [role="menu"]')) return
      const first = barRef.current?.querySelector<HTMLElement>('[data-focusable]')
      if (!first) return
      e.preventDefault()
      returnTo.current = active
      first.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible])

  if (!visible || !entry) return null
  const playing = status === 'playing'
  const pct = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0
  const href = nav.nowPlaying()
  // Arrow keys inside the bar (spatial navigation would send them back into the page's focus trap).
  const onBarKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
    const items = Array.from(barRef.current?.querySelectorAll<HTMLElement>('[data-focusable]') ?? []).filter(
      (el) => !(el as HTMLButtonElement).disabled,
    )
    const at = items.indexOf(document.activeElement as HTMLElement)
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const back = returnTo.current
      if (back?.isConnected) back.focus()
      else {
        const root = document.querySelector('[data-page-root]')
        if (root) focusFirst(root)
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1
      items[at + step]?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
    }
  }
  return (
    <aside
      className={clsx(styles.bar, compact && styles.compact)}
      ref={barRef}
      aria-label={t('now_playing')}
      data-mini-player
      onKeyDown={onBarKey}
    >
      <div className={styles.progress} aria-hidden>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <a href={href} className={styles.info} onClick={linkClick(href)} data-focusable title={t('now_playing')}>
        <span className={styles.art}>{entry.imageUrl ? <img src={entry.imageUrl} alt="" draggable={false} /> : <FaIcon name="music" />}</span>
        <span className={styles.text}>
          <span className={styles.title} dir="auto">
            {entry.title}
          </span>
          {entry.artistNames && (
            <span className={styles.artist} dir="auto">
              {entry.artistNames}
            </span>
          )}
        </span>
      </a>
      <div className={styles.buttons} data-focus-group>
        <PlaybackButton
          icon={<DrawableIcon name={playing ? 'pause' : 'play'} size={28} />}
          label={playing ? t('web_playback_pause') : t('play')}
          onClick={togglePlay}
        />
        <PlaybackButton icon={<DrawableIcon name="skip_next" size={28} />} label={t('web_playback_next')} disabled={!canNext} onClick={next} />
      </div>
    </aside>
  )
}

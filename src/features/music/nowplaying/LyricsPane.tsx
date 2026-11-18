import type { LyricDto } from '@jellyfin/sdk/lib/generated-client/models'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { lyricText } from './lyricsModel'
import styles from './LyricsPane.module.css'

export type LyricsPaneProps = {
  lyrics: LyricDto
  current: number | null
  onSeek: (ms: number) => void
  /** lyric focus hides the controls (NowPlayingPage: `lyricsFocused`) */
  onFocusChange: (focused: boolean) => void
}

/**
 * `LyricsContent` (W/ui/detail/music/LyricsContent.kt): bodyLarge lines 4dp apart, 8dp padding each; the
 * current line onSurface, the others onSurface@40% (500 ms linear); all full brightness when nothing is current.
 * A focused line gets border@33%; clicking a synced line seeks to it. The list follows the current line only
 * while it has no focus and only when the line is off-screen.
 */
export function LyricsPane({ lyrics, current, onSeek, onFocusChange }: LyricsPaneProps) {
  const { t } = useTranslation()
  const list = useRef<HTMLDivElement>(null)
  const [hasFocus, setHasFocus] = useState(false)
  const lines = lyrics.Lyrics ?? []

  useEffect(() => {
    const box = list.current
    // `hasFocus` only re-runs this on blur; a focused line removed from the page fires no blur
    if (current == null || !box || box.contains(document.activeElement)) return
    const el = box.children[current] as HTMLElement | undefined
    if (!el) return
    const top = el.offsetTop - box.offsetTop
    const visible = top >= box.scrollTop && top + el.offsetHeight <= box.scrollTop + box.clientHeight
    if (!visible) box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [current, hasFocus])

  return (
    <div
      ref={list}
      className={styles.list}
      role="list"
      aria-label={t('lyrics')}
      onFocus={() => {
        setHasFocus(true)
        onFocusChange(true)
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setHasFocus(false)
          onFocusChange(false)
        }
      }}
    >
      {lines.map((line, i) => (
        <button
          key={i}
          type="button"
          role="listitem"
          data-focusable
          className={clsx(styles.line, current != null && i !== current && styles.dim)}
          aria-current={i === current || undefined}
          onClick={() => {
            if (line.Start != null) onSeek(line.Start / 10_000)
          }}
        >
          {lyricText(line.Text)}
        </button>
      ))}
    </div>
  )
}

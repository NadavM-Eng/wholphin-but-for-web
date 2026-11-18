import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemImageUrl } from '../../../api/images'
import { DOT, formatDuration, formatTimeOfDay, ticksToMs } from '../../../lib/format'
import { CardFrame, CardImage, DrawableIcon, TextButton } from '../../../ui'
import { getPlaybackEngine, usePlaybackStore } from '../engine'
import styles from './NextUpPanel.module.css'
import { episodeLine, plainT } from './text'

/** `AspectRatios.MIN` (portrait posters): the card is never narrower than this. */
const MIN_ASPECT = 2 / 3

/**
 * The Next Up panel (PlaybackPage.kt:630-701, NextUpEpisode.kt): bottom-center, 66% wide and 40% tall on
 * elevation 2 with 8dp corners. "Next Up..." over a focused card (image Fit) showing the countdown ("15s") in a
 * TransparentBlack50 circle while autoplay is on, else a 60dp play icon; next to it "S1 E2 - Name", four lines of
 * overview and "runtime • Ends at". Web addition: a Cancel button in the panel's top-end corner stops the countdown
 * (the remote's Back does); it sits outside the ported column so it never pushes or clips the TV layout.
 */
export function NextUpPanel({ onPlay }: { onPlay: () => void }) {
  const { t: rawT, i18n } = useTranslation()
  const t = plainT(rawT)
  const nextUp = usePlaybackStore((s) => s.nextUp)
  const item = nextUp?.item ?? null
  const card = useRef<HTMLDivElement>(null)
  const src = useItemImageUrl(item, 'Primary', { height: 240, useSeriesForPrimary: false })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    card.current?.querySelector<HTMLElement>('[data-card-surface]')?.focus({ preventScroll: true })
  }, [item?.Id])
  if (!nextUp || !item) return null

  const ratio = Math.max(item.PrimaryImageAspectRatio && item.PrimaryImageAspectRatio > 0 ? item.PrimaryImageAspectRatio : 16 / 9, MIN_ASPECT)
  const runtimeMs = item.RunTimeTicks ? ticksToMs(item.RunTimeTicks) : null
  const counting = nextUp.countdown != null && nextUp.countdown > 0
  const title = item.Type === 'Episode' ? episodeLine(t, item) : (item.Name ?? '')

  return (
    <section className={styles.panel} aria-label={t('next_up')} data-next-up>
      <div className={styles.heading}>{`${t('next_up')}...`}</div>
      <div className={styles.body}>
        <div ref={card} className={styles.cardBox} style={{ '--ratio': String(ratio) } as CSSProperties}>
          <CardFrame label={title} onClick={onPlay} container="var(--c-surface-variant)" className={styles.card}>
            <CardImage src={src} name={item.Name} fit="contain" showOverlay={false} useFallbackText />
            <span className={styles.badge}>
              {counting ? (
                <span className={styles.count}>{formatDuration(t, (nextUp.countdown ?? 0) * 1000)}</span>
              ) : (
                <DrawableIcon name="play" size={60} />
              )}
            </span>
          </CardFrame>
        </div>
        <div className={styles.text}>
          <div className={styles.title}>{title}</div>
          {/* upstream always lays out the description Text: an empty one still takes a line */}
          <div className={styles.overview}>{item.Overview || '\u200b'}</div>
          {runtimeMs != null && runtimeMs > 0 && (
            <div className={styles.runtime}>
              {formatDuration(t, runtimeMs)}
              {DOT}
              {t('ends_at', { p1: formatTimeOfDay(new Date(now + runtimeMs), i18n.language) })}
            </div>
          )}
        </div>
      </div>
      {counting && (
        <div className={styles.cancel}>
          <TextButton onClick={() => getPlaybackEngine().cancelNextUpCountdown()}>{t('cancel')}</TextButton>
        </div>
      )}
    </section>
  )
}

import clsx from 'clsx'
import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { useTranslate } from '../../common/useTranslate'
import { formatDuration, roundSecondsMs } from '../../../lib/format'
import { MarqueeText, MaterialIcon, useLongPress } from '../../../ui'
import { useFocusedAfterDelay } from '../../../ui/lib/useFocusedAfterDelay'
import { MusicQueueMarker } from './MusicQueueMarker'
import styles from './SongRow.module.css'

export type SongRowProps = {
  /** leading number (track number, or position in a queue / playlist) */
  indexText?: string | null
  title: string | null
  /** second line (shown only when given) */
  artist?: string | null
  runtimeMs?: number | null
  isPlaying?: boolean
  isQueued?: boolean
  onClick: () => void
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void
  onMore?: () => void
  /** shown after the runtime inside the row (playlist watched mark) */
  badge?: ReactNode
  /** extra buttons between the row and the more button (queue / playlist up-down carets) */
  trailingButtons?: ReactNode
  /** focus key for focus restore on Back */
  focusKey?: string
  focusDefault?: boolean
  className?: string
}

/**
 * `SongListItem` (W/ui/detail/music/SongListDisplay.kt): a DenseListItem (selected while playing) with the
 * track number and the queue marker (playing arrow / queued dot), the title (marquee when focused), the
 * artist line when asked, the runtime rounded to seconds, then a 32dp "more" button.
 */
export function SongRow({
  indexText,
  title,
  artist,
  runtimeMs,
  isPlaying,
  isQueued,
  onClick,
  onContextMenu,
  onMore,
  badge,
  trailingButtons,
  focusKey,
  focusDefault,
  className,
}: SongRowProps) {
  const { t } = useTranslate()
  const rowRef = useRef<HTMLDivElement>(null)
  const focused = useFocusedAfterDelay(rowRef, 0)
  const runtime = runtimeMs != null && runtimeMs > 0 ? formatDuration(t, roundSecondsMs(runtimeMs)) : ''
  // A touch long-press opens the row's menu too: iOS Safari sends no contextmenu for touch (as CardFrame / ListItem).
  const longPress = useLongPress(
    onContextMenu ? (target) => target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })) : undefined,
  )
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick()
    }
  }
  return (
    <div ref={rowRef} className={clsx(styles.row, className)}>
      <div
        role="button"
        tabIndex={0}
        data-focusable
        data-focus-key={focusKey}
        data-focus-default={focusDefault || undefined}
        aria-current={isPlaying || undefined}
        className={clsx(styles.item, isPlaying && styles.selected, artist && styles.two, onContextMenu && styles.hasMenu)}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onContextMenu={longPress.wrapContextMenu(onContextMenu)}
        onPointerDown={longPress.onPointerDown}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={longPress.onPointerUp}
        onPointerCancel={longPress.onPointerCancel}
      >
        <span className={styles.leading}>
          <span className={styles.index}>{indexText ?? ''}</span>
          <MusicQueueMarker isPlaying={isPlaying} isQueued={isQueued} />
        </span>
        <span className={styles.text}>
          <MarqueeText text={title ?? ''} active={focused} ellipsis className={styles.title} />
          {artist && (
            <span className={styles.artist} dir="auto">
              {artist}
            </span>
          )}
        </span>
        <span className={styles.runtime}>{runtime}</span>
        {badge}
      </div>
      {trailingButtons}
      {onMore && (
        <button type="button" className={styles.more} data-focusable aria-label={t('more')} title={t('more')} onClick={onMore}>
          <MaterialIcon name="more_vert" />
        </button>
      )}
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { useMusicQueue, type AudioItem } from '../../../stores/musicQueue'
import { FaIcon } from '../../../ui'
import { useTranslate } from '../../common/useTranslate'
import { SongRow } from '../components/SongRow'
import { moveQueue, playIndex } from '../service/musicService'
import styles from './QueueList.module.css'

export type QueueListProps = {
  onMenu: (entry: AudioItem, index: number) => void
  /** focus entered/left the list (the overlay grows to full height while it has focus) */
  onFocusChange: (focused: boolean) => void
  /** a row with index >= 3 has focus: the button row hides */
  onDeepFocus: (deep: boolean) => void
  onInteract: () => void
  /** the overlay is showing: the list scrolls to the current entry each time it appears */
  visible: boolean
}

/**
 * The Now Playing queue (NowPlayingOverlay.kt:110-245): "Queue" (titleMedium) and one row per entry on
 * surface@50% (r=8dp): number, playing marker (every entry of the playing song id), title / artist, runtime,
 * then ▲ ▼ (disabled at the ends) and ⋮. Rows are keyed per entry; the list opens scrolled to the current one.
 */
export function QueueList({ onMenu, onFocusChange, onDeepFocus, onInteract, visible }: QueueListProps) {
  const { t } = useTranslate()
  const entries = useMusicQueue((s) => s.entries)
  const currentIndex = useMusicQueue((s) => s.currentIndex)
  const currentId = entries[currentIndex]?.id ?? null
  const list = useRef<HTMLDivElement>(null)
  const indexRef = useRef(currentIndex)
  useEffect(() => {
    indexRef.current = currentIndex
  }, [currentIndex])

  // the list opens scrolled to the current entry (rememberLazyListState(initialFirstVisibleItemIndex = currentIndex))
  useEffect(() => {
    if (!visible) return
    const box = list.current
    const el = box?.querySelector<HTMLElement>(`[data-queue-index="${indexRef.current}"]`)
    if (box && el && !box.contains(document.activeElement)) box.scrollTop = el.offsetTop - box.offsetTop
  }, [visible])

  if (entries.length === 0) return <p className={styles.empty}>{t('web_music_no_items')}</p>
  return (
    <>
      <h2 className={styles.title}>{t('queue')}</h2>
      <div
        ref={list}
        className={styles.list}
        role="list"
        onFocus={(e) => {
          onFocusChange(true)
          const row = (e.target as HTMLElement).closest<HTMLElement>('[data-queue-index]')
          onDeepFocus(Number(row?.dataset.queueIndex ?? 0) >= 3)
          onInteract()
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            onFocusChange(false)
            onDeepFocus(false)
          }
        }}
      >
        {entries.map((entry, index) => (
          <div key={entry.key} className={styles.entry} data-queue-index={index} role="listitem">
            <SongRow
              className={styles.song}
              indexText={String(index + 1)}
              title={entry.title}
              artist={entry.artistNames}
              runtimeMs={entry.runtimeMs}
              isPlaying={currentId === entry.id}
              focusKey={`queue:${entry.key}`}
              onClick={() => void playIndex(index)}
              onContextMenu={(e) => {
                e.preventDefault()
                onMenu(entry, index)
              }}
              onMore={() => onMenu(entry, index)}
              trailingButtons={
                <>
                  <button
                    type="button"
                    className={styles.move}
                    data-focusable
                    aria-label={t('web_move_up')}
                    title={t('web_move_up')}
                    aria-disabled={index === 0 || undefined}
                    onClick={(e) => {
                      if (index === 0) return
                      moveQueue(index, index - 1)
                      requestAnimationFrame(() => (e.currentTarget as HTMLElement | null)?.scrollIntoView({ block: 'nearest' }))
                    }}
                  >
                    <FaIcon name="caret_up" />
                  </button>
                  <button
                    type="button"
                    className={styles.move}
                    data-focusable
                    aria-label={t('web_move_down')}
                    title={t('web_move_down')}
                    aria-disabled={index === entries.length - 1 || undefined}
                    onClick={() => {
                      if (index < entries.length - 1) moveQueue(index, index + 1)
                    }}
                  >
                    <FaIcon name="caret_down" />
                  </button>
                </>
              }
            />
          </div>
        ))}
      </div>
    </>
  )
}

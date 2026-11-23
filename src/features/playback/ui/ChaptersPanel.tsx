import { useTranslation } from 'react-i18next'
import { getChapterImageUrl, imagePx } from '../../../api/images'
import { formatClock } from '../../../lib/format'
import { useSessionStore } from '../../../stores/session'
import { ListItem } from '../../../ui'
import { getPlaybackEngine, usePlaybackStore } from '../engine'
import { PlayerPanel } from './PlayerPanel'
import styles from './PlayerPanel.module.css'
import { currentChapterIndex, plainT } from './text'

const THUMB_HEIGHT = 36

/**
 * The chapters of the playing item, one row each: picture (when the server has one), name, start time (a clock,
 * "1:02:03", like the control strip's times). The
 * chapter being played is marked and takes focus; choosing a row seeks there and hides the controls, as a click
 * on a chapter card does on the TV (overlay/ChapterRowOverlay.kt, which lays the chapters out as a row of cards
 * under the controller: web layout, owner request).
 */
export function ChaptersPanel({ onClose, onPicked }: { onClose: () => void; onPicked: () => void }) {
  const t = plainT(useTranslation().t)
  const chapters = usePlaybackStore((s) => s.chapters)
  const itemId = usePlaybackStore((s) => s.item?.Id ?? '')
  const current = usePlaybackStore((s) => currentChapterIndex(s.chapters, s.positionMs))
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  const pictures = chapters.some((c) => c.imageTag)

  return (
    <PlayerPanel name="chapters" title={t('chapters')} onClose={onClose} shortcut="h" initialFocus="[data-current]">
      {chapters.map((c, i) => {
        const time = formatClock(c.startMs)
        const src = itemId && c.imageTag ? getChapterImageUrl(baseUrl, itemId, c.index, c.imageTag, imagePx(THUMB_HEIGHT)) : null
        return (
          <div key={c.index} data-chapter={i} data-current={i === current || undefined}>
            <ListItem
              role="menuitemradio"
              selected={i === current}
              noScale
              leading={pictures ? src ? <img className={styles.thumb} src={src} alt="" loading="lazy" decoding="async" draggable={false} /> : <span className={styles.thumb} /> : undefined}
              headline={
                <span className={styles.line}>
                  <bdi>{c.name || time}</bdi>
                </span>
              }
              trailing={c.name ? <span className={styles.clock} dir="ltr">{time}</span> : undefined}
              onClick={() => {
                getPlaybackEngine().seekTo(c.startMs)
                onPicked()
              }}
            />
          </div>
        )
      })}
    </PlayerPanel>
  )
}

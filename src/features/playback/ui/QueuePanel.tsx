import { useTranslation } from 'react-i18next'
import { formatRuntime } from '../../../lib/format'
import { ListItem, MaterialIcon } from '../../../ui'
import { getPlaybackEngine, usePlaybackStore } from '../engine'
import { PlayerPanel } from './PlayerPanel'
import styles from './PlayerPanel.module.css'
import { episodeLine, itemTitle, plainT } from './text'

/**
 * The play queue, one row per entry: position, title ("S1 E2 - Name" with the series under it for an episode,
 * else the name and year), runtime. The entry being played is marked and takes focus; choosing another plays it
 * and hides the controls, as a click on a queue card does on the TV (overlay/QueueRowOverlay.kt, which shows the
 * upcoming entries as a row of cards under the controller: web layout, owner request). The web list shows the
 * whole queue, so an earlier entry can be chosen too.
 */
export function QueuePanel({ onClose, onPicked }: { onClose: () => void; onPicked: () => void }) {
  const t = plainT(useTranslation().t)
  const queue = usePlaybackStore((s) => s.queue)
  const index = usePlaybackStore((s) => s.index)

  return (
    <PlayerPanel name="queue" title={t('queue')} onClose={onClose} shortcut="q" initialFocus="[data-current]">
      {queue.map((entry, i) => {
        const item = entry.item
        const episode = item.Type === 'Episode'
        const second = episode ? item.SeriesName : item.ProductionYear != null ? String(item.ProductionYear) : null
        const runtime = formatRuntime(t, item.RunTimeTicks)
        const playing = i === index
        return (
          <div key={`${item.Id}-${i}`} data-queue={i} data-current={playing || undefined}>
            <ListItem
              role="menuitemradio"
              selected={playing}
              noScale
              leading={<span className={styles.number}>{i + 1}</span>}
              headline={
                <span className={styles.line}>
                  <bdi>{(episode ? episodeLine(t, item) : itemTitle(item)) ?? ''}</bdi>
                </span>
              }
              supporting={
                second ? (
                  <span className={styles.line}>
                    <bdi>{second}</bdi>
                  </span>
                ) : null
              }
              trailing={
                <span className={styles.trailing}>
                  {runtime && <bdi>{runtime}</bdi>}
                  {playing && <MaterialIcon name="play_arrow" size={20} label={t('now_playing')} />}
                </span>
              }
              onClick={() => {
                // the entry being played: nothing to start, the panel just closes
                if (playing) onClose()
                else {
                  getPlaybackEngine().playQueueIndex(i)
                  onPicked()
                }
              }}
            />
          </div>
        )
      })}
    </PlayerPanel>
  )
}

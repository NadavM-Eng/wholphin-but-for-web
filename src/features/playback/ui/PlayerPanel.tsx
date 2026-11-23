import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MaterialIcon } from '../../../ui'
import { PlaybackButton } from './PlaybackButton'
import styles from './PlayerPanel.module.css'
import { PlayerSheet } from './PlayerSheet'
import { plainT } from './text'

export interface PlayerPanelProps {
  /** `data-player-panel`: 'chapters' or 'queue' */
  name: string
  title: string
  onClose: () => void
  /** the key that opened the panel closes it again */
  shortcut?: string
  /** CSS selector of the row that takes focus when the panel opens */
  initialFocus: string
  children: ReactNode
}

/**
 * A list panel of the web player (chapters, queue), opened by a button of the control strip: a PlayerSheet at the
 * physical right (above its button in every language), standing on the strip, at most half the window wide (the
 * whole width on a phone) and scrolling inside. Owner request, after Jellyfin's web player; the TV shows these lists as rows of cards under its
 * controller (ChapterRowOverlay.kt, QueueRowOverlay.kt). Like every player sheet it does not dim the video and
 * closes with Escape / Back, a press outside it (which includes its own button) and its Close button; focus goes
 * to the current row and returns to the button.
 */
export function PlayerPanel({ name, title, onClose, shortcut, initialFocus, children }: PlayerPanelProps) {
  const t = plainT(useTranslation().t)
  return (
    <PlayerSheet
      label={title}
      placement="bottom-right"
      surface={1}
      onClose={onClose}
      initialFocus={initialFocus}
      closeKeys={shortcut ? [shortcut] : undefined}
      className={styles.panel}
      header={
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <PlaybackButton flat name="panel-close" className={styles.close} icon={<MaterialIcon name="close" />} label={t('web_close')} onClick={onClose} />
        </div>
      }
    >
      <div className={styles.rows} data-player-panel={name} data-focus-group>
        {children}
      </div>
    </PlayerSheet>
  )
}

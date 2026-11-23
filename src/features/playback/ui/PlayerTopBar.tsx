import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTimeOfDay } from '../../../lib/format'
import { MaterialIcon } from '../../../ui'
import { usePlaybackStore } from '../engine'
import { MiddleEllipsisText } from './MiddleEllipsisText'
import { PlaybackButton } from './PlaybackButton'
import styles from './PlayerTopBar.module.css'
import { itemSubtitleLong, itemTitle, plainT } from './text'

export interface PlayerTopBarProps {
  onBack: () => void
  /** the controls are showing: the clock ticks only then */
  visible: boolean
  /** "Show Clock" preference */
  showClock: boolean
  /** debug info is shown: the clock gives way to it, as upstream (PlaybackOverlay.kt:299-364) */
  showDebug: boolean
}

/**
 * The slim strip at the top of the web player: Back, then right after it the title and subtitle (`BaseItem.title`
 * / `subtitleLong`, cut in the middle like upstream), and the clock at the end. Owner request, after Jellyfin's
 * web player: on the TV the title (28sp) and subtitle (18sp) stand above the seek bar in the controller
 * (overlay/PlaybackController.kt) and the logo (240 x 120dp box) and the clock are at the top. The web strip has
 * no logo: it stood between Back and the title and pushed the title away from the edge (owner request), the text
 * title names the item already, and a dark logo could not be read on the dark gradient.
 */
export function PlayerTopBar({ onBack, visible, showClock, showDebug }: PlayerTopBarProps) {
  const { t: rawT, i18n } = useTranslation()
  const t = plainT(rawT)
  const item = usePlaybackStore((s) => s.item)
  const title = itemTitle(item)
  const subtitle = itemSubtitleLong(t, item, i18n.language)
  const [clock, setClock] = useState(() => new Date())
  useEffect(() => {
    if (!visible || !showClock) return
    setClock(new Date())
    const id = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(id)
  }, [visible, showClock])

  return (
    <div className={styles.root} data-player-top>
      {/* Left/Right from the controls never stop on the web-only Back button (it sits at the start edge in RTL too) */}
      <div className={styles.back} data-focus-vertical-only>
        <PlaybackButton flat name="back" icon={<MaterialIcon name="arrow_back" />} label={t('web_back')} onClick={onBack} />
      </div>
      <div className={styles.titles} data-player-titles>
        {title && <MiddleEllipsisText className={styles.title} text={title} />}
        {subtitle && <MiddleEllipsisText className={styles.subtitle} text={subtitle} />}
      </div>
      {!showDebug && showClock && <div className={styles.clock}>{formatTimeOfDay(clock, i18n.language)}</div>}
    </div>
  )
}

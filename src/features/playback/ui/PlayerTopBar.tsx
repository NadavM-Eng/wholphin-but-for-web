import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useItemImageUrl } from '../../../api/images'
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
  /** debug info is shown: logo and clock give way to it, as upstream (PlaybackOverlay.kt:299-364) */
  showDebug: boolean
}

/**
 * The slim strip at the top of the web player: Back, the item's logo, title and subtitle (`BaseItem.title` /
 * `subtitleLong`, cut in the middle like upstream) and the clock at the end. Owner request, after Jellyfin's web
 * player: on the TV the title (28sp) and subtitle (18sp) stand above the seek bar in the controller
 * (overlay/PlaybackController.kt) and only the logo (240 x 120dp box) and the clock are at the top.
 */
export function PlayerTopBar({ onBack, visible, showClock, showDebug }: PlayerTopBarProps) {
  const { t: rawT, i18n } = useTranslation()
  const t = plainT(rawT)
  const item = usePlaybackStore((s) => s.item)
  const title = itemTitle(item)
  const subtitle = itemSubtitleLong(t, item, i18n.language)
  const logoTag = item?.Type === 'Episode' ? item.ParentLogoImageTag : item?.ImageTags?.Logo
  const logo = useItemImageUrl(logoTag ? item : null, 'Logo', { height: 72 })
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
      {!showDebug && logo && <img className={styles.logo} src={logo} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />}
      <div className={styles.titles}>
        {title && <MiddleEllipsisText className={styles.title} text={title} />}
        {subtitle && <MiddleEllipsisText className={styles.subtitle} text={subtitle} />}
      </div>
      {!showDebug && showClock && <div className={styles.clock}>{formatTimeOfDay(clock, i18n.language)}</div>}
    </div>
  )
}

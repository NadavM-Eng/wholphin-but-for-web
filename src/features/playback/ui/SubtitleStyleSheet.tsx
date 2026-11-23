import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrefs } from '../../../stores/preferences'
import { PreferenceList } from '../../settings/PreferenceList'
import { buildScreen, screenTitleKey } from '../../settings/prefModel'
import { useVisibilityContext } from '../../settings/useVisibilityContext'
import { usePlaybackStore } from '../engine'
import { isHdrVideo, subtitleStyleReach, type SubtitleStyleReach } from '../engine/subtitles/style'
import styles from './PlaybackDialogs.module.css'
import { PlayerSheet } from './PlayerSheet'

const NOTICE: Record<Exclude<SubtitleStyleReach, 'text'>, string> = {
  image: 'web_subtitle_style_note_image',
  styled: 'web_subtitle_style_note_styled',
  burned: 'web_subtitle_style_note_burned',
}

/**
 * Web addition (owner request): the subtitle style options of Settings (SubtitleStylePage's list), inside the
 * player. The playing video is the preview: every change applies at once, and while no subtitle line is on screen
 * a sample line stands in for one (SubtitleLayer). It edits the copy the video uses: the separate HDR one when
 * "different for HDR" is on and the video is HDR, as the renderer picks it. Rows that open another page are left
 * out. Subtitles the options cannot restyle get a line saying so. Upstream has these options in Settings only.
 * The sheet is narrower and tighter than the other sheets and lets the video show through, since the video is
 * what one looks at while using it.
 */
export function SubtitleStyleSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const hdrVideo = usePlaybackStore((s) => isHdrVideo(s.item?.MediaSources?.find((m) => m.Id === s.source?.Id)?.MediaStreams ?? s.source?.MediaStreams))
  const reach = usePlaybackStore((s) => subtitleStyleReach(s.subtitle))
  const separateHdr = usePrefs('subSeparateHdr')
  const hdrCopy = hdrVideo && separateHdr
  const context = useVisibilityContext(hdrCopy)
  const groups = buildScreen('SUBTITLE_STYLE', context)
    .map((g) => ({ ...g, entries: g.entries.filter((m) => m.widget !== 'destination') }))
    .filter((g) => g.entries.length > 0)

  useEffect(() => {
    usePlaybackStore.setState({ subtitleSample: true })
    return () => usePlaybackStore.setState({ subtitleSample: false })
  }, [])

  return (
    <PlayerSheet
      label={t(screenTitleKey('SUBTITLE_STYLE', hdrCopy))}
      placement="bottom-left"
      onClose={onClose}
      className={`${styles.compactSheet} ${styles.sliderSheet}`}
      header={
        reach !== 'text' ? (
          <p className={styles.subtitleNote} role="note" data-subtitle-style-note={reach}>
            {t(NOTICE[reach])}
          </p>
        ) : undefined
      }
    >
      <div className={styles.subtitleStyle} data-player-subtitle-style>
        <PreferenceList groups={groups} hdrPage={hdrCopy} />
      </div>
    </PlayerSheet>
  )
}

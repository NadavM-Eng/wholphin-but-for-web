import { useState } from 'react'
import { toast } from '../../../app/toast'
import { setPref, usePrefs } from '../../../stores/preferences'
import { Dialog } from '../../../ui'
import { useTranslate } from '../../common/useTranslate'
import { SwitchPreference } from '../../settings/SwitchPreference'
import { enableVisualizer } from '../service/musicService'
import styles from './MusicViewOptionsDialog.module.css'

/**
 * `MusicViewOptionsDialog` (W/ui/detail/music/MusicViewOptionsDialog.kt): the "View options" title over a 256dp
 * list on surfaceColorAtElevation(6dp), end-aligned, no dim, whose rows are the regular switch preferences (Show
 * album cover, Show visualizer, Show backdrop, Show lyrics; switch at the end). Turning the visualizer on needs
 * an audio analyser tap (the web counterpart of the RECORD_AUDIO permission); when the browser cannot provide
 * one the switch stays off (MU-4).
 */
export function MusicViewOptionsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslate()
  const albumArt = usePrefs('musicShowAlbumArt')
  const visualizer = usePrefs('musicShowVisualizer')
  const backdrop = usePrefs('musicShowBackdrop')
  const lyrics = usePrefs('musicShowLyrics')
  const [busy, setBusy] = useState(false)
  const toggleVisualizer = () => {
    if (busy) return
    if (visualizer) {
      setPref('musicShowVisualizer', false)
      return
    }
    setBusy(true)
    void enableVisualizer()
      .then((ok) => {
        setPref('musicShowVisualizer', ok)
        if (!ok) toast(t('web_music_visualizer_unavailable'))
      })
      .finally(() => setBusy(false))
  }
  return (
    <Dialog open onClose={onClose} variant="basic" scrim={false} label={t('view_options')} className={styles.dialog} style={{ background: 'transparent' }}>
      <h2 className={styles.title}>{t('view_options')}</h2>
      <div className={styles.list}>
        <SwitchPreference
          id="MusicShowAlbumArt"
          title={t('show_album_cover')}
          value={albumArt}
          onToggle={() => setPref('musicShowAlbumArt', !albumArt)}
        />
        <SwitchPreference id="MusicShowVisualizer" title={t('show_visualizer')} value={visualizer} onToggle={toggleVisualizer} />
        <SwitchPreference
          id="MusicShowBackdrop"
          title={t('show_backdrop')}
          value={backdrop}
          onToggle={() => setPref('musicShowBackdrop', !backdrop)}
        />
        <SwitchPreference id="MusicShowLyrics" title={t('show_lyrics')} value={lyrics} onToggle={() => setPref('musicShowLyrics', !lyrics)} />
      </div>
    </Dialog>
  )
}

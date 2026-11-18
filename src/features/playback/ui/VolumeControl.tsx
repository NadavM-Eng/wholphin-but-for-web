import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { plainT } from './text'
import { MaterialIcon, Slider } from '../../../ui'
import { getPlaybackEngine, usePlaybackStore } from '../engine'
import { PlaybackButton } from './PlaybackButton'
import { volumeIcon } from './playerIcons'
import styles from './VolumeControl.module.css'

/**
 * Web addition (the TV has hardware volume): mute button plus a volume slider that opens on hover, built from
 * the strip's PlaybackButton and the kit Slider. The slider opens on the start side of the button: the buttons
 * are packed against the end edge, so the button stays under the pointer while the slider pushes the buttons
 * before it away. Touch screens get only the mute button (phones use hardware volume; iOS ignores
 * `video.volume`).
 */
export function VolumeControl({ onInteract, iconSize = 24 }: { onInteract: () => void; iconSize?: number }) {
  const t = plainT(useTranslation().t)
  const engine = getPlaybackEngine()
  const volume = usePlaybackStore((s) => s.volume)
  const muted = usePlaybackStore((s) => s.muted)
  const silent = muted || volume === 0
  // The slider opens on pointer hover only: in the D-pad focus order it would swallow Left/Right on the way to
  // the buttons beside it (keyboard users have M, and the wheel over the video).
  const [open, setOpen] = useState(false)
  return (
    <div
      className={styles.root}
      data-open={open || undefined}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={() => setOpen(false)}
    >
      <div className={styles.slider} inert={!open}>
        <Slider
          value={muted ? 0 : Math.round(volume * 100)}
          min={0}
          max={100}
          step={5}
          label={t('web_playback_volume')}
          valueText={`${Math.round((muted ? 0 : volume) * 100)}%`}
          onChange={(v) => {
            onInteract()
            engine.setVolume(v / 100)
            engine.setMuted(v === 0)
          }}
        />
      </div>
      <PlaybackButton
        flat
        name="volume"
        icon={<MaterialIcon name={volumeIcon(silent, volume)} size={iconSize} />}
        label={silent ? t('web_playback_unmute') : t('web_playback_mute')}
        title={`${silent ? t('web_playback_unmute') : t('web_playback_mute')} (M)`}
        pressed={silent}
        onClick={() => {
          onInteract()
          if (silent && volume === 0) engine.setVolume(0.5)
          engine.setMuted(!silent)
        }}
      />
    </div>
  )
}

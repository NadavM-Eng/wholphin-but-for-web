import type { BaseItemDto, MediaStream } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect, useRef, useState } from 'react'
import { formatAudioCodec, formatVideoRange, resolutionString } from '../../lib/format'
import { usePrefs } from '../../stores/preferences'
import { Button, DrawableIcon, ExpandableButton, FaIcon, OverviewText, QuickDetails, StreamChip, focusFromScript } from '../../ui'
import { quickDetailsFor } from '../common/itemText'
import { languageName } from '../playback/ui/text'
import { useTranslate } from '../common/useTranslate'
import styles from './ImageOverlay.module.css'

export type ImageOverlayProps = {
  item: BaseItemDto
  position: number
  count: number
  slideshowEnabled: boolean
  isVideo: boolean
  videoPlaying: boolean
  onStartSlideshow: () => void
  onStopSlideshow: () => void
  onPlayPause: () => void
  onRotate: (deg: number) => void
  onZoom: (factor: number) => void
  onReset: () => void
  onFilter: () => void
  onDuration: () => void
}

/**
 * `ImageOverlay` + `ImageDetailsHeader` + `ImageControlsOverlay` (W/ui/slideshow/): full-width #80000000 panel at
 * the bottom with 16dp padding: title (headlineMedium SemiBold, one line, 75% wide), quick details, the
 * "n of total" chip and WxH (videos: stream details), the overview (3 lines, 75% wide) and the control row
 * (16dp apart): Play/Stop slideshow, then rotate left/right, zoom in/out, reset, filter for photos, or play/pause
 * for videos. Focus starts on Play/Stop slideshow.
 */
export function ImageOverlay(p: ImageOverlayProps) {
  const { t, locale } = useTranslate()
  const toggles = usePrefs('displayToggles')
  const first = useRef<HTMLElement>(null)
  useEffect(() => {
    // focusFromScript: Firefox shows no ring for a plain focus() after the viewer was opened with the mouse
    if (first.current) focusFromScript(first.current)
  }, [])
  const item = p.item
  const [now] = useState(() => Date.now())
  const details = quickDetailsFor(t, item, { toggles, nowMs: now, locale })
  return (
    <div className={styles.overlay} data-slideshow-overlay>
      {item.Name && (
        <h2 className={styles.title} dir="auto">
          {item.Name}
        </h2>
      )}
      <QuickDetails
        parts={details.parts}
        officialRating={details.officialRating}
        communityRating={details.communityRating}
        criticRating={details.criticRating}
        locale={locale}
      />
      <div className={styles.chips}>
        <StreamChip text={t('web_photos_position', { p1: p.position + 1, p2: p.count })} />
        {p.isVideo ? (
          <VideoStreamChips item={item} />
        ) : item.Width != null && item.Height != null ? (
          <StreamChip text={`${item.Width}x${item.Height}`} />
        ) : null}
      </div>
      <OverviewText text={item.Overview ?? ''} maxLines={3} className={styles.overview} />
      <div className={styles.controls} data-focus-group>
        <ExpandableButton
          ref={first}
          icon={<DrawableIcon name={p.slideshowEnabled ? 'pause' : 'play'} size={28} />}
          label={t(p.slideshowEnabled ? 'stop_slideshow' : 'play_slideshow')}
          labelOnTouch
          onClick={p.slideshowEnabled ? p.onStopSlideshow : p.onStartSlideshow}
        />
        {p.isVideo ? (
          // ImageControlsOverlay.kt:76-93: an icon-only tv-material Button (ButtonWithIconContentPadding)
          <Button
            className={styles.clipButton}
            label={p.videoPlaying ? t('web_playback_pause') : t('play')}
            title={p.videoPlaying ? t('web_playback_pause') : t('play')}
            onClick={p.onPlayPause}
          >
            <DrawableIcon name={p.videoPlaying ? 'pause' : 'play'} size={24} />
          </Button>
        ) : (
          <>
            <ExpandableButton iconKind="fa" icon={<FaIcon name="rotate_left" size={16} />} label={t('rotate_left')} onClick={() => p.onRotate(-90)} />
            <ExpandableButton iconKind="fa" icon={<FaIcon name="rotate_right" size={16} />} label={t('rotate_right')} onClick={() => p.onRotate(90)} />
            <ExpandableButton iconKind="fa" icon={<FaIcon name="magnifying_glass_plus" size={16} />} label={t('zoom_in')} onClick={() => p.onZoom(0.15)} />
            <ExpandableButton iconKind="fa" icon={<FaIcon name="magnifying_glass_minus" size={16} />} label={t('zoom_out')} onClick={() => p.onZoom(-0.15)} />
            <ExpandableButton iconKind="fa" icon={<FaIcon name="arrows_rotate" size={16} />} label={t('reset')} onClick={p.onReset} />
            <ExpandableButton iconKind="fa" icon={<FaIcon name="sliders" size={16} />} label={t('filter')} onClick={p.onFilter} />
          </>
        )}
        {/* web: the slideshow duration (upstream only in Settings > Advanced) */}
        <ExpandableButton iconKind="fa" icon={<FaIcon name="clock" size={16} />} label={t('slideshow_duration')} onClick={p.onDuration} />
      </div>
    </div>
  )
}

/** `VideoStreamDetails` for the first media source: resolution + range, codec, audio. */
function VideoStreamChips({ item }: { item: BaseItemDto }) {
  const { t } = useTranslate()
  const source = item.MediaSources?.[0]
  const streams: MediaStream[] = source?.MediaStreams ?? []
  const video = streams.find((s) => s.Type === 'Video')
  const audio = streams.find((s) => s.Type === 'Audio')
  const audioCount = streams.filter((s) => s.Type === 'Audio').length
  const res =
    video && video.Width != null && video.Height != null
      ? [resolutionString(video.Width, video.Height, video.IsInterlaced ?? false), formatVideoRange(t, video.VideoRange, video.VideoRangeType, video.VideoDoViTitle)]
          .filter(Boolean)
          .join(' ')
      : null
  const audioText =
    audioCount === 0 || !audio
      ? t('none')
      : [languageName(t, audio.Language), formatAudioCodec(t, audio.Codec, audio.Profile), audio.ChannelLayout].filter(Boolean).join(' ')
  return (
    <>
      {res && <StreamChip text={res} />}
      {video?.Codec && <StreamChip text={video.Codec.toUpperCase()} />}
      <StreamChip text={audioText} icon="volume_high" count={audioCount} maxWidth />
    </>
  )
}

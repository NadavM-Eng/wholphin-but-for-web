import type { MediaStream } from '@jellyfin/sdk/lib/generated-client/models'
import { Fragment } from 'react'
import { useSession } from '../../../api/session'
import { formatAudioCodec, formatBitrate, formatBytes, formatDate, formatDuration, formatSubtitleCodec, ticksToMs, type Translate } from '../../../lib/format'
import { dpCss } from '../../../theme/scale'
import { Dialog } from '../../../ui'
import { useTranslate } from '../../common/useTranslate'
import { languageName } from './streams'
import type { MediaInfo } from './mediaInfo'
import styles from './MediaInfoDialog.module.css'

type Pair = [string, string]

const titleIndex = (title: string, index: number, total: number) => (total > 1 ? `${title} (${index + 1})` : title)

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function videoInfo(t: Translate, s: MediaStream, locale: string): Pair[] {
  const out: Pair[] = []
  if (s.Title) out.push([t('title'), s.Title])
  if (s.Codec) out.push([t('codec'), s.Codec.toUpperCase()])
  if (s.Width != null && s.Height != null) {
    out.push([t('resolution'), `${s.Width}x${s.Height}`])
    const g = gcd(s.Width, s.Height) || 1
    out.push([t('aspect_ratio'), `${s.Width / g}:${s.Height / g}`])
  }
  if (s.BitRate != null) out.push([t('bitrate'), formatBitrate(s.BitRate, locale)])
  if (s.AverageFrameRate != null) out.push([t('framerate'), s.AverageFrameRate.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })])
  if (s.VideoRange === 'SDR') out.push([t('video_range'), t('sdr')])
  else if (s.VideoRange === 'HDR') out.push([t('video_range'), t('hdr')])
  if (s.Profile) out.push([t('profile'), s.Profile])
  if (s.Level != null) out.push([t('level'), String(s.Level)])
  out.push([t('interlaced'), t(s.IsInterlaced ? 'yes' : 'no')])
  return out
}

function videoInfoAdditional(t: Translate, s: MediaStream): Pair[] {
  const out: Pair[] = []
  const yn = (b: boolean) => t(b ? 'yes' : 'no')
  if (s.IsAVC != null) out.push([t('avc'), yn(s.IsAVC)])
  if (s.IsAnamorphic != null) out.push([t('anamorphic'), yn(s.IsAnamorphic)])
  if (s.BitDepth != null) out.push([t('bit_depth'), `${s.BitDepth} ${t('bit_unit')}`])
  const rt = s.VideoRangeType
  const rangeType =
    rt === 'SDR' ? t('sdr') : rt === 'HDR10' ? t('hdr10') : rt === 'HDR10Plus' ? t('hdr10_plus') : rt === 'HLG' ? t('hlg') : rt && rt.startsWith('DOVI') && rt !== 'DOVIInvalid' ? t('dolby_vision') : null
  if (rangeType) out.push([t('video_range_type'), rangeType])
  if (s.ColorSpace) out.push([t('color_space'), s.ColorSpace])
  if (s.ColorTransfer) out.push([t('color_transfer'), s.ColorTransfer])
  if (s.ColorPrimaries) out.push([t('color_primaries'), s.ColorPrimaries])
  if (s.PixelFormat) out.push([t('pixel_format'), s.PixelFormat])
  if (s.RefFrames != null) out.push([t('ref_frames'), String(s.RefFrames)])
  if (s.NalLengthSize) out.push([t('nal'), s.NalLengthSize])
  if (s.VideoDoViTitle) out.push([t('dolby_vision'), s.VideoDoViTitle])
  return out
}

function audioInfo(t: Translate, s: MediaStream, locale: string): Pair[] {
  const out: Pair[] = []
  if (s.Title) out.push([t('title'), s.Title])
  if (s.Language) out.push([t('language'), languageName(t, s.Language, locale)])
  if (s.Codec) out.push([t('codec'), `${formatAudioCodec(t, s.Codec, s.Profile)} (${s.Codec})`])
  if (s.ChannelLayout) out.push([t('layout'), s.ChannelLayout])
  if (s.Channels != null) out.push([t('channels'), String(s.Channels)])
  if (s.Profile) out.push([t('profile'), s.Profile])
  if (s.BitRate != null) out.push([t('bitrate'), formatBitrate(s.BitRate, locale)])
  if (s.SampleRate != null) out.push([t('sample_rate'), `${s.SampleRate} ${t('sample_rate_unit')}`])
  if (s.IsDefault != null) out.push([t('default_track'), t(s.IsDefault ? 'yes' : 'no')])
  return out
}

function subtitleInfo(t: Translate, s: MediaStream, showPath: boolean, locale: string): Pair[] {
  const out: Pair[] = []
  const yn = (b: boolean) => t(b ? 'yes' : 'no')
  if (s.Title) out.push([t('title'), s.Title])
  if (s.Language) out.push([t('language'), languageName(t, s.Language, locale)])
  if (s.Codec) out.push([t('codec'), `${formatSubtitleCodec(s.Codec)} (${s.Codec})`])
  if (s.IsDefault != null) out.push([t('default_track'), yn(s.IsDefault)])
  if (s.IsForced != null) out.push([t('forced_track'), yn(s.IsForced)])
  if (s.IsExternal != null) out.push([t('external_track'), yn(s.IsExternal)])
  if (s.IsHearingImpaired != null) out.push([s.LocalizedHearingImpaired ?? 'SDH', yn(s.IsHearingImpaired)])
  if (showPath && s.Path) out.push([t('path'), s.Path])
  return out
}

function Section({ title, items, additional }: { title: string; items: Pair[]; additional?: Pair[] }) {
  const col = (pairs: Pair[]) => (
    <div className={styles.col}>
      {pairs.map(([k, v], i) => (
        <p key={i} className={styles.pair}>
          <span className={styles.label}>{k}: </span>
          <span className={styles.value}>{v}</span>
        </p>
      ))}
    </div>
  )
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <div className={styles.cols}>
        {col(items)}
        {additional && additional.length > 0 && col(additional)}
      </div>
    </section>
  )
}

/**
 * Upstream `ItemDetailsDialog` (W/ui/data/ItemDetailsDialog.kt): a scrollable 680dp dialog with the title,
 * studios, genres, overview, last played and, per media source, the general / video / audio / subtitle info.
 * File path and source id only for administrators.
 */
export function MediaInfoDialog({ info, onClose, showFilePath }: { info: MediaInfo; onClose: () => void; showFilePath?: boolean }) {
  const { t, locale } = useTranslate()
  const isAdmin = useSession()?.userDto?.Policy?.IsAdministrator === true
  const showPath = showFilePath ?? isAdmin
  const lastPlayed = formatDate(info.lastPlayed, locale)
  return (
    <Dialog open onClose={onClose} variant="scrollable" elevation={3} label={info.title} style={{ width: `min(${dpCss(680)}, 100%)`, maxHeight: `min(${dpCss(440)}, 100%)` }}>
      <div className={styles.head}>
        <h2 className={styles.title} dir="auto">
          {info.title}
        </h2>
        {info.studios && info.studios.length > 0 && <p className={styles.studios}>{info.studios.join(', ')}</p>}
        {info.genres.length > 0 && <p className={styles.genres}>{info.genres.join(', ')}</p>}
        {info.overview && info.overview.trim() !== '' && (
          <p className={styles.overview} dir="auto">
            {info.overview}
          </p>
        )}
        {lastPlayed && <p className={styles.overview}>{`${t('last_played')}: ${lastPlayed}`}</p>}
      </div>
      {info.files.map((source, index) => {
        const streams = source.MediaStreams ?? []
        if (streams.length === 0) return null
        const general: Pair[] = []
        if (source.Container) general.push([t('container'), source.Container])
        if (showPath) {
          if (source.Path) general.push([t('path'), source.Path])
          general.push(['ID', source.Id ?? t('unknown')])
        }
        if (source.Size != null) general.push([t('file_size'), formatBytes(source.Size, undefined, undefined, locale)])
        if (source.Bitrate != null) general.push([t('bitrate'), formatBitrate(source.Bitrate, locale)])
        if (source.RunTimeTicks != null) general.push([t('runtime_sort'), formatDuration(t, ticksToMs(source.RunTimeTicks))])
        const video = streams.filter((s) => s.Type === 'Video')
        const audio = streams.filter((s) => s.Type === 'Audio')
        const subs = streams.filter((s) => s.Type === 'Subtitle')
        return (
          <Fragment key={source.Id ?? index}>
            <hr className={styles.divider} />
            <Section title={titleIndex(t('general'), index, info.files.length)} items={general} />
            {video.map((s, i) => (
              <Section key={`v${i}`} title={titleIndex(t('video'), i, video.length)} items={videoInfo(t, s, locale)} additional={videoInfoAdditional(t, s)} />
            ))}
            {audio.length > 0 && (
              <div className={styles.grid}>
                {audio.map((s, i) => (
                  <Section key={`a${i}`} title={titleIndex(t('audio'), i, audio.length)} items={audioInfo(t, s, locale)} />
                ))}
              </div>
            )}
            {subs.length > 0 && (
              <div className={styles.grid}>
                {subs.map((s, i) => (
                  <Section key={`s${i}`} title={titleIndex(t('subtitle'), i, subs.length)} items={subtitleInfo(t, s, showPath, locale)} />
                ))}
              </div>
            )}
          </Fragment>
        )
      })}
    </Dialog>
  )
}

import { useEffect, useState } from 'react'
import { formatBitrate, formatBytes } from '../../../lib/format'
import { getPlaybackEngine, usePlaybackStore } from '../engine'
import styles from './DebugOverlay.module.css'

type Rows = Array<[string, string | number | boolean | null | undefined]>

function Table({ rows, keyWidth }: { rows: Rows; keyWidth: number }) {
  return (
    <div className={styles.table}>
      {rows.map(([k, v]) => (
        <div key={k} className={styles.tr}>
          <span className={styles.key} style={{ width: `${keyWidth / 16}rem` }}>
            {k}
          </span>
          <span>{String(v ?? 'null')}</span>
        </div>
      ))}
    </div>
  )
}

interface MemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
}

/**
 * `PlaybackDebugOverlay` (overlay/PlaybackDebugOverlay.kt, spec 05 §12.1 and §B4 "Hardware decoder name"): 10sp
 * tables on TransparentBlack50, top-start, shown with the controls. Browser equivalents replace the Android ones:
 * backend (native / hls.js), play method and remux vs transcode, the display size, measured and estimated
 * bitrate, dropped/total frames, JS heap (Chromium), the server's transcoding info, and the selected tracks.
 * Debug text is diagnostic and stays in English, as upstream hard-codes it.
 */
export function DebugOverlay() {
  const st = usePlaybackStore()
  const [memory, setMemory] = useState('')
  const [display, setDisplay] = useState('')
  useEffect(() => {
    const mem = () => {
      const m = (performance as unknown as { memory?: MemoryInfo }).memory
      setMemory(m ? `${formatBytes(m.usedJSHeapSize)} / ${formatBytes(m.totalJSHeapSize)}` : 'n/a')
    }
    const disp = () => {
      const dpr = window.devicePixelRatio || 1
      const hdr = window.matchMedia?.('(dynamic-range: high)').matches ? ', HDR' : ''
      setDisplay(`${Math.round(screen.width * dpr)}x${Math.round(screen.height * dpr)} @${Number(dpr.toFixed(2))}x${hdr}`)
    }
    mem()
    disp()
    const a = setInterval(mem, 2000)
    const b = setInterval(disp, 10_000)
    return () => {
      clearInterval(a)
      clearInterval(b)
    }
  }, [])

  const video = getPlaybackEngine().video
  const method = st.playMethod === 'Transcode' && st.videoCopy ? 'Transcode (remux)' : st.playMethod
  const info = st.transcodeInfo
  const audio = st.audioStreams.find((s) => s.Index === st.audioIndex)
  const sub = st.subtitleStreams.find((s) => s.Index === st.subtitleIndex)
  const vstream = st.source?.MediaStreams?.find((s) => s.Type === 'Video')
  const tracks: Rows = [
    ['Video', vstream ? `${vstream.Codec ?? '?'} ${vstream.Width ?? '?'}x${vstream.Height ?? '?'} ${vstream.VideoRangeType ?? ''}` : null],
    ['Rendered', `${video.videoWidth}x${video.videoHeight}`],
    ['Audio', audio ? `#${audio.Index} ${audio.Codec ?? '?'} ${audio.ChannelLayout ?? audio.Channels ?? ''} ${audio.Language ?? ''}` : null],
    [
      'Subtitle',
      sub
        ? `#${sub.Index} ${sub.Codec ?? '?'} ${sub.Language ?? ''} ${st.subtitle?.kind ?? ''}${st.subtitleDelayMs ? ` ${st.subtitleDelayMs}ms` : ''}`
        : 'none',
    ],
  ]

  return (
    // English diagnostics: laid out left to right in every language ("3.93 mbps", not "mbps 3.93")
    <div className={styles.root} data-debug-overlay dir="ltr">
      <div className={styles.cols}>
        <Table
          keyWidth={80}
          rows={[
            ['Backend:', st.backend],
            ['Play method:', method],
            ['Fallback:', st.fallbackPath.length ? st.fallbackPath.map((f) => `${f.method}:${f.reason}`).join(' > ') : 'none'],
            ['Display Mode: ', display],
          ]}
        />
        <Table
          keyWidth={80}
          rows={[
            ['Bitrate: ', info?.Bitrate ? formatBitrate(info.Bitrate) : st.source?.Bitrate ? formatBitrate(st.source.Bitrate) : null],
            ['Bitrate (est): ', st.stats.bandwidthEstimate ? formatBitrate(Math.round(st.stats.bandwidthEstimate)) : null],
            ['Dropped frames: ', `${st.stats.droppedFrames} / ${st.stats.totalFrames}`],
            ['Memory', memory],
          ]}
        />
        {(info || st.transcodeReasons.length > 0) && (
          <Table
            keyWidth={64}
            rows={[
              ['Reason:', (info?.TranscodeReasons ?? st.transcodeReasons).join(', ')],
              ['HW Accel:', info?.HardwareAccelerationType ?? null],
              ['Container:', info?.Container ?? null],
              ['Bitrate:', info?.Bitrate ? formatBitrate(info.Bitrate) : null],
            ]}
          />
        )}
        {info && (
          <Table
            keyWidth={64}
            rows={[
              ['Video:', `${info.VideoCodec}, ${info.Width}x${info.Height}`],
              ['Video Direct:', info.IsVideoDirect],
              ['Audio:', `${info.AudioCodec}, ch=${info.AudioChannels}`],
              ['Audio Direct:', info.IsAudioDirect],
            ]}
          />
        )}
      </div>
      <Table keyWidth={80} rows={tracks} />
    </div>
  )
}

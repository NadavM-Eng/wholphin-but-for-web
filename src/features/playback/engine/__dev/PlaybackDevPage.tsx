// DEV ONLY engine test bench, reached through /play/:itemId?debug=1 (PlaybackPage renders it lazily when
// import.meta.env.DEV). Plain controls plus every piece of engine state, the chosen play method and the fallback
// path. Not localized on purpose: it is a developer tool that never ships.
import type { DeviceProfile } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  BITRATE_VALUES,
  getPlaybackEngine,
  PLAYBACK_SPEEDS,
  PlayerSurface,
  SubtitleLayer,
  TrackIndex,
  usePlaybackSession,
  usePlaybackStore,
  type PlaybackDestination,
} from '..'
import type { Capabilities } from '../capabilities'
import styles from './PlaybackDevPage.module.css'

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default function PlaybackDevPage({ dest }: { dest: PlaybackDestination | null }) {
  const navigate = useNavigate()
  const engine = getPlaybackEngine()
  const st = usePlaybackStore()
  const [id, setId] = useState(dest?.itemId ?? '')
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [profile, setProfile] = useState<DeviceProfile | null>(null)
  usePlaybackSession(dest, () => undefined)

  useEffect(() => {
    void engine.deviceProfile().then((p) => {
      setProfile(p)
      setCaps(engine.capabilities())
    })
  }, [engine])

  const trick = st.trickplay ? engine.trickplayImage(st.positionMs) : null

  return (
    <div className={styles.page}>
      <form
        className={styles.row}
        onSubmit={(e) => {
          e.preventDefault()
          if (id.trim()) void navigate(`/play/${encodeURIComponent(id.trim())}?debug=1`)
        }}
      >
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="item id" size={36} />
        <button type="submit">Play</button>
        <button type="button" onClick={() => id && void navigate(`/play/${encodeURIComponent(id)}?debug=1&transcode=1`)}>
          Play transcoded
        </button>
        <button type="button" onClick={() => engine.stop('user')}>
          Stop
        </button>
      </form>

      <div className={styles.video}>
        <PlayerSurface>
          <SubtitleLayer />
        </PlayerSurface>
      </div>

      <div className={styles.row}>
        <button type="button" onClick={() => engine.previousButton()}>
          Prev
        </button>
        <button type="button" onClick={() => engine.skipBack()}>
          -skip
        </button>
        <button type="button" onClick={() => engine.togglePlay()} data-testid="toggle">
          {st.paused ? 'Play' : 'Pause'}
        </button>
        <button type="button" onClick={() => engine.skipForward()}>
          +skip
        </button>
        <button type="button" onClick={() => engine.next()} disabled={!st.hasNext}>
          Next
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(st.durationMs))}
          value={Math.round(st.positionMs)}
          onChange={(e) => engine.seekTo(Number(e.target.value))}
          className={styles.seek}
        />
        <span>
          {clock(st.positionMs)} / {clock(st.durationMs)}
        </span>
      </div>

      <div className={styles.row}>
        <label>
          audio{' '}
          <select value={st.audioIndex ?? ''} onChange={(e) => engine.setAudio(Number(e.target.value))} data-testid="audio">
            {st.audioStreams.map((s) => (
              <option key={s.Index} value={s.Index}>
                {s.Index}: {s.DisplayTitle}
              </option>
            ))}
          </select>
        </label>
        <label>
          subtitle{' '}
          <select
            value={st.subtitleChoice === TrackIndex.ONLY_FORCED ? -3 : (st.subtitleIndex ?? -2)}
            onChange={(e) => engine.setSubtitle(Number(e.target.value))}
            data-testid="subtitle"
          >
            <option value={-2}>none</option>
            <option value={-3}>only forced</option>
            {st.subtitleStreams.map((s) => (
              <option key={s.Index} value={s.Index}>
                {s.Index}: {s.DisplayTitle} [{s.DeliveryMethod ?? '?'}]
              </option>
            ))}
          </select>
        </label>
        <label>
          speed{' '}
          <select value={st.playbackRate} onChange={(e) => engine.setPlaybackRate(Number(e.target.value))}>
            {PLAYBACK_SPEEDS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          bitrate{' '}
          <select value={st.maxBitrate} onChange={(e) => engine.setMaxBitrate(Number(e.target.value))}>
            {BITRATE_VALUES.map((b) => (
              <option key={b} value={b}>
                {(b / 1024 / 1024).toFixed(2)}M
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => engine.adjustSubtitleDelay(-250)}>
          sub -250
        </button>
        <span>{st.subtitleDelayMs} ms</span>
        <button type="button" onClick={() => engine.adjustSubtitleDelay(250)}>
          sub +250
        </button>
        <button type="button" onClick={() => engine.debugFail('manual')}>
          simulate failure
        </button>
        {st.segment && (
          <button type="button" onClick={() => engine.skipSegment()}>
            skip {st.segment.segment.Type}
          </button>
        )}
        {st.nextUp && (
          <button type="button" onClick={() => engine.playNextUp()}>
            next up: {st.nextUp.item.Name} {st.nextUp.countdown ?? ''}
          </button>
        )}
      </div>

      <dl className={styles.facts} data-testid="facts">
        <dt>status</dt>
        <dd data-testid="status">{st.status}</dd>
        <dt>play method</dt>
        <dd data-testid="method">
          {st.playMethod ?? '-'}
          {st.playMethod === 'Transcode' ? (st.videoCopy ? ' (remux: video copied)' : ' (video transcoded)') : ''}{' '}
          {st.transcodeReasons.join(', ')}
        </dd>
        <dt>backend</dt>
        <dd>{st.backend ?? '-'}</dd>
        <dt>fallback path</dt>
        <dd data-testid="fallback">{st.fallbackPath.map((p) => `${p.method} (${p.reason}${p.detail ? `: ${p.detail}` : ''})`).join(' -> ') || 'none'}</dd>
        <dt>error</dt>
        <dd>{st.error ? `${st.error.kind} ${st.error.code ?? ''} ${st.error.detail ?? ''}` : '-'}</dd>
        <dt>item</dt>
        <dd>
          {st.item?.Name} ({st.item?.Type}) [{st.index + 1}/{st.queue.length}] {st.entryKind}
        </dd>
        <dt>container / video</dt>
        <dd>
          {st.source?.Container} / {st.videoWidth}x{st.videoHeight}
        </dd>
        <dt>frames</dt>
        <dd>
          total {st.stats.totalFrames}, dropped {st.stats.droppedFrames}, bw {st.stats.bandwidthEstimate ?? '-'}
        </dd>
        <dt>last report</dt>
        <dd>{st.lastReport ? `${st.lastReport.kind} @ ${clock(st.lastReport.positionMs)}` : '-'}</dd>
        <dt>subtitle</dt>
        <dd>
          {st.subtitle ? `${st.subtitle.kind} #${st.subtitle.streamIndex}${st.subtitle.kind === 'text' ? ` (${st.subtitle.cues.length} cues)` : ''}${st.subtitle.kind === 'ass' ? ` (${st.subtitle.fonts.length} fonts)` : ''}` : '-'}
          {st.subtitleLoading ? ' loading' : ''}
        </dd>
        <dt>reasons</dt>
        <dd>
          audio: {st.audioReason?.kind ?? '-'}, subtitle: {st.subtitleReason?.kind ?? '-'}
        </dd>
        <dt>segment</dt>
        <dd>{st.segment ? `${st.segment.segment.Type} interacted=${st.segment.interacted}` : `- (${st.segments.length} segments)`}</dd>
        <dt>chapters</dt>
        <dd>{st.chapters.length}</dd>
        <dt>transcode</dt>
        <dd>{st.transcodeInfo ? `${st.transcodeInfo.VideoCodec}/${st.transcodeInfo.AudioCodec} ${(st.transcodeInfo.TranscodeReasons ?? []).join(',')}` : '-'}</dd>
        <dt>url</dt>
        <dd className={styles.url}>{st.streamUrl?.replace(/ApiKey=[^&]+/i, 'ApiKey=***').replace(/api_key=[^&]+/i, 'api_key=***')}</dd>
      </dl>

      {trick && (
        <div
          className={styles.trick}
          style={{
            width: trick.width,
            height: trick.height,
            backgroundImage: `url("${trick.url}")`,
            backgroundPosition: `-${trick.x}px -${trick.y}px`,
          }}
        />
      )}

      <details>
        <summary>capabilities</summary>
        <pre className={styles.pre}>{JSON.stringify(caps, null, 1)}</pre>
      </details>
      <details>
        <summary>device profile</summary>
        <pre className={styles.pre}>{JSON.stringify(profile, null, 1)}</pre>
      </details>
    </div>
  )
}

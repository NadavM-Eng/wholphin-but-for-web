// Public types of the playback engine. See README.md.
import type {
  BaseItemDto,
  MediaSegmentDto,
  MediaSegmentType,
  MediaSourceInfo,
  MediaStream,
  PlayMethod,
  TranscodingInfo,
  TrickplayInfoDto,
} from '@jellyfin/sdk/lib/generated-client/models'
import type { BackendKind } from './backends'
import type { FallbackStep } from './fallback'
import type { QueueEntry, QueueFilter, SortAndDirection } from './queue'
import type { StreamChoiceReason } from './streamChoice'
import type { SegmentState } from './segments'
import type { SubtitleData } from './subtitles/loader'

export type { BackendKind } from './backends'
export type { FallbackStep } from './fallback'
export type { QueueEntry, QueueFilter, SortAndDirection } from './queue'
export type { SegmentState } from './segments'
export type { SubtitleData } from './subtitles/loader'
export type { SubtitleCue } from './subtitles/cues'
export type { StreamChoiceReason } from './streamChoice'

/** What to play: the two upstream destinations `Playback` and `PlaybackList` (spec 05 §1). */
export type PlaybackDestination =
  | {
      kind: 'item'
      itemId: string
      /** start position in ms (the item's resume point for "Resume", 0 for "Play"/"Restart") */
      positionMs?: number
      /** "Play with -> Transcoding" */
      forceTranscode?: boolean
      shuffle?: boolean
    }
  | {
      kind: 'list'
      itemId: string
      startIndex?: number
      shuffle?: boolean
      recursive?: boolean
      sort?: SortAndDirection | null
      filter?: QueueFilter
    }

export type PlaybackStatus =
  /** nothing loaded */
  | 'idle'
  /** resolving the item/queue, waiting for PlaybackInfo or for the first frame */
  | 'loading'
  | 'playing'
  | 'paused'
  /** stalled waiting for data */
  | 'buffering'
  /** the last entry finished (or an end-of-item action is pending) */
  | 'ended'
  | 'error'

export type PlaybackErrorKind =
  /** GET /Items or queue creation failed */
  | 'load-failed'
  /** PlaybackInfo returned ErrorCode (NotAllowed, NoCompatibleStream, RateLimitExceeded) - `code` set */
  | 'server-error'
  /** PlaybackInfo returned no media source (upstream hangs here; spec 08 PB-3) */
  | 'no-media-sources'
  /** no URL: usually no permission to play/transcode */
  | 'no-url'
  /** source supports no play method */
  | 'no-method'
  /** every rung of the fallback ladder failed */
  | 'playback-failed'
  /** the browser cannot play HLS at all */
  | 'unsupported-browser'

export interface PlaybackError {
  kind: PlaybackErrorKind
  code?: string
  detail?: string
}

export interface Chapter {
  index: number
  startMs: number
  name: string | null
  imageTag: string | null
}

export interface NextUpState {
  /** queue index of the entry that will play */
  index: number
  item: BaseItemDto
  /** seconds left before autoplay, or null when it will not autoplay (autoplay off, pass-out, Back pressed) */
  countdown: number | null
}

/** Why the UI should leave the player (navigate back). */
export type ExitReason = 'ended' | 'playlist-empty' | 'stopped-remotely' | 'user'

export interface PlaybackStats {
  droppedFrames: number
  totalFrames: number
  /** hls.js bandwidth estimate in bit/s */
  bandwidthEstimate: number | null
}

export interface PlaybackEngineState {
  status: PlaybackStatus
  error: PlaybackError | null
  /** set when the UI should navigate back; the engine has already stopped reporting */
  exit: ExitReason | null
  /** the browser refused autoplay: the UI should show a play affordance */
  autoplayBlocked: boolean

  destination: PlaybackDestination | null
  queue: QueueEntry[]
  index: number
  hasNext: boolean
  hasPrevious: boolean

  /** the entry being played, fully loaded (MediaSources, Chapters, Trickplay) */
  item: BaseItemDto | null
  entryKind: 'media' | 'intro' | null
  isLiveTv: boolean

  /** source returned by PlaybackInfo (has DeliveryMethod/DeliveryUrl per subtitle) */
  source: MediaSourceInfo | null
  playMethod: PlayMethod | null
  backend: BackendKind | null
  streamUrl: string | null
  playSessionId: string | null
  liveStreamId: string | null
  /** failures that led to the current method, oldest first */
  fallbackPath: FallbackStep[]
  allowDirectPlay: boolean
  allowDirectStream: boolean
  /** `TranscodeReasons` of the server's transcoding URL (empty for direct play) */
  transcodeReasons: string[]
  /** a server "Transcode" that only remuxes (video stream-copied); the upstream DIRECT_STREAM rung */
  videoCopy: boolean
  transcodeInfo: TranscodingInfo | null

  /** audio streams in server order */
  audioStreams: MediaStream[]
  /** subtitle streams, the server profile's preferred language first (CurrentMediaInfo.kt) */
  subtitleStreams: MediaStream[]
  /** server index of the active audio stream, or null */
  audioIndex: number | null
  /** the user's raw subtitle choice: a stream index, TrackIndex.DISABLED (-2) or TrackIndex.ONLY_FORCED (-3) */
  subtitleChoice: number
  /** the concrete subtitle stream shown, or null */
  subtitleIndex: number | null
  audioReason: StreamChoiceReason | null
  subtitleReason: StreamChoiceReason | null
  /** loaded subtitle for the renderer */
  subtitle: SubtitleData | null
  subtitleLoading: boolean
  subtitleDelayMs: number
  /** the subtitle style sheet is open: a sample line stands in while no cue is on screen (SubtitleLayer) */
  subtitleSample: boolean

  positionMs: number
  durationMs: number
  bufferedMs: number
  paused: boolean
  muted: boolean
  volume: number
  playbackRate: number
  /** session max bitrate (bit/s), not persisted (spec 05 §3) */
  maxBitrate: number
  videoWidth: number
  videoHeight: number

  chapters: Chapter[]
  trickplay: TrickplayInfoDto | null
  segment: SegmentState | null
  segments: MediaSegmentDto[]
  /** last automatic segment skip (web addition: the UI shows a toast; upstream skips silently) */
  autoSkipped: { segmentId: string; type: MediaSegmentType; at: number } | null
  nextUp: NextUpState | null
  /** increments when the engine asks the UI to show its controls (end of item with "next up: never") */
  showControlsSignal: number

  stats: PlaybackStats
  lastReport: { kind: 'start' | 'progress' | 'stopped'; positionMs: number; at: number } | null
}

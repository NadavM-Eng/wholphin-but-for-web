import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { usePrefs } from '../../../stores/preferences'
import { observeResize } from '../../../ui'
import { getPlaybackEngine, usePlaybackStore } from './engine'
import styles from './SubtitleLayer.module.css'
import { activeCues, type SubtitleCue } from './subtitles/cues'
import { containedVideoRect, isHdrVideo, RAISED_BY, stylePrefsFor, subtitleBottomMargin, subtitleStyle, type SubtitleStylePrefs } from './subtitles/style'

// JASSUB (libass WASM + worker) is loaded only when an ASS/SSA track is selected, keeping it out of the player chunk.
const AssSubtitles = lazy(() => import('./AssSubtitles').then((m) => ({ default: m.AssSubtitles })))
// libpgs (canvas renderer + worker) is loaded only when a PGS track is selected.
const PgsSubtitles = lazy(() => import('./PgsSubtitles').then((m) => ({ default: m.PgsSubtitles })))

export interface SubtitleLayerProps {
  /** controls are visible: text subtitles move into the top-center 70% of the video (PlaybackPage.kt:520) */
  raised?: boolean
  /** hide subtitles (e.g. while the seek indicator is shown) */
  hidden?: boolean
}

/**
 * Minimal on-video subtitle renderer: text cues styled from the subtitle preferences, ASS/SSA through JASSUB,
 * PGS (image) subtitles through libpgs.
 * Must be rendered inside the same positioned container as the engine's <video> (see PlayerSurface).
 */
export function SubtitleLayer({ raised = false, hidden = false }: SubtitleLayerProps) {
  const subtitle = usePlaybackStore((s) => s.subtitle)
  const delayMs = usePlaybackStore((s) => s.subtitleDelayMs)
  if (!subtitle) return null
  if (subtitle.kind === 'pgs')
    // stays mounted while hidden: a new renderer would start a worker and parse the whole stream again
    return (
      <Suspense fallback={null}>
        <PgsSubtitles key={subtitle.streamIndex} data={subtitle.data} delayMs={delayMs} raised={raised} hidden={hidden} />
      </Suspense>
    )
  if (hidden) return null
  if (subtitle.kind === 'text') return <TextSubtitles key={subtitle.streamIndex} cues={subtitle.cues} delayMs={delayMs} raised={raised} />
  if (subtitle.kind === 'ass')
    return (
      <Suspense fallback={null}>
        <AssSubtitles key={subtitle.streamIndex} content={subtitle.content} fonts={subtitle.fonts} delayMs={delayMs} />
      </Suspense>
    )
  return null
}

function useVideoRect(ref: React.RefObject<HTMLElement | null>) {
  const vw = usePlaybackStore((s) => s.videoWidth)
  const vh = usePlaybackStore((s) => s.videoHeight)
  const [box, setBox] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const width = el.clientWidth
      const height = el.clientHeight
      setBox((b) => (b.width === width && b.height === height ? b : { width, height }))
    }
    read()
    return observeResize(el, read)
  }, [ref])
  return containedVideoRect(box.width, box.height, vw, vh)
}

function TextSubtitles({ cues, delayMs, raised }: { cues: SubtitleCue[]; delayMs: number; raised: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const rect = useVideoRect(ref)
  const [active, setActive] = useState<SubtitleCue[]>([])
  // the whole preferences object is referentially stable until a preference changes
  const allPrefs = usePrefs((p) => p)
  // the original (pre-transcode) item streams say whether the content is HDR, even when the server tone-maps
  const hdr = usePlaybackStore((s) => isHdrVideo(s.item?.MediaSources?.find((m) => m.Id === s.source?.Id)?.MediaStreams ?? s.source?.MediaStreams))
  const prefs: SubtitleStylePrefs = useMemo(() => stylePrefsFor(allPrefs, hdr), [allPrefs, hdr])
  const style = useMemo(() => subtitleStyle(prefs, rect.height), [prefs, rect.height])

  // cue timing needs frame accuracy: timeupdate fires only ~4x per second
  useEffect(() => {
    const video = getPlaybackEngine().video
    let raf = 0
    // null forces the first comparison to publish, including an empty cue set
    let last: string | null = null
    const tick = () => {
      const now = activeCues(cues, video.currentTime * 1000, delayMs)
      const key = now.map((c) => `${c.startMs}:${c.endMs}`).join('|')
      if (key !== last) {
        last = key
        setActive(now)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [cues, delayMs])

  // with the controls up the text keeps its size and steps up by the height of the control strip (style.ts RAISED_BY)
  const area: CSSProperties = { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
  const box: CSSProperties = raised ? { ...style.box, marginBottom: `calc(${subtitleBottomMargin(prefs.subMargin, rect.height)} + ${RAISED_BY})` } : style.box
  return (
    <div ref={ref} className={styles.layer} aria-live="off">
      <div className={styles.area} style={area}>
        {active.length > 0 && (
          <div className={styles.box} style={box}>
            {active.map((c) => (
              <div key={`${c.startMs}-${c.endMs}-${c.text}`} className={styles.cue} style={style.cue}>
                {c.text.split('\n').map((line, i) => (
                  <span key={i} className={styles.line}>
                    <span style={style.line}>{renderInline(line)}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** <i>/<b>/<u> markup to elements; everything else is plain text. */
function renderInline(line: string): ReactNode[] {
  const out: ReactNode[] = []
  const stack: Array<'i' | 'b' | 'u'> = []
  let key = 0
  for (const part of line.split(/(<\/?[ibu]>)/i)) {
    const tag = /^<(\/?)([ibu])>$/i.exec(part)
    if (tag) {
      const name = tag[2].toLowerCase() as 'i' | 'b' | 'u'
      if (tag[1]) {
        const at = stack.lastIndexOf(name)
        if (at >= 0) stack.splice(at, 1)
      } else stack.push(name)
      continue
    }
    if (!part) continue
    const css: CSSProperties = {}
    if (stack.includes('i')) css.fontStyle = 'italic'
    if (stack.includes('b')) css.fontWeight = 'bold'
    if (stack.includes('u')) css.textDecoration = 'underline'
    out.push(
      stack.length ? (
        <span key={key++} style={css}>
          {decode(part)}
        </span>
      ) : (
        decode(part)
      ),
    )
  }
  return out
}

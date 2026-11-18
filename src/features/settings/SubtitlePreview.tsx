import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dp, dpCss, useDp } from '../../theme/scale'
import eclipse from './assets/eclipse.jpeg'
import { cueTextStyle, cueWindowColor, DEFAULT_SUBTITLE_STYLE, MEDIA3_EDGE_DP, type SubtitleStyle } from './subtitleStyle'
import styles from './SubtitlePreview.module.css'

/** Media3 SubtitleView.DEFAULT_BOTTOM_PADDING_FRACTION */
const DEFAULT_BOTTOM_FRACTION = 0.08
/** Media3 SubtitleView.DEFAULT_TEXT_SIZE_FRACTION: text size of a view without setFixedTextSize, of its height. */
const DEFAULT_TEXT_SIZE_FRACTION = 0.0533
/** Height of the preview on the TV canvas (SubtitleStylePage: full 540dp height beside the 25% panel). */
const TV_PREVIEW_HEIGHT_DP = 540

/**
 * Frame size, and the factor that shrinks the samples when the frame is shorter than the TV preview (phones,
 * short windows), so the three samples keep a third of a TV-height canvas each instead of colliding.
 */
function useStage() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useDp()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // next frame, not inside the observer callback (Safari: ResizeObserver loop error, see src/ui/lib/observeResize)
    let raf = 0
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height })))
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])
  const scale = size.h > 0 ? Math.min(1, size.h / dp(TV_PREVIEW_HEIGHT_DP)) : 1
  return { ref, size, scale }
}

export type SubtitlePreviewMode = 'examples' | 'margin' | 'image'

type CueProps = {
  text: string
  style: SubtitleStyle
  bottomFraction: number
  /** CSS font size: the fixed sp size, or a fraction of the view height */
  fontSize: string
  /** outline stroke in dp; default the style's edge size (where upstream applies Media3SubtitleOverride) */
  outlineDp?: number
}

function Cue({ text, style, bottomFraction, fontSize, outlineDp }: CueProps) {
  const windowColor = cueWindowColor(style)
  return (
    <div className={styles.view} style={{ fontSize, paddingBottom: `calc(${bottomFraction} * 100cqh)` }}>
      <div className={styles.box}>
        {windowColor && <span className={styles.window} style={{ backgroundColor: windowColor }} />}
        <span className={styles.text} style={cueTextStyle(style, outlineDp)}>
          {text}
        </span>
      </div>
    </div>
  )
}

/**
 * Left side of SubtitleStylePage.kt: the sample frame (R.mipmap.eclipse, stretched) with three example cues,
 * or one "margin" cue placed at `margin`% of the height while the Margin row is focused, or a dimmed
 * default-style cue while Image subtitle opacity is focused.
 */
export function SubtitlePreview({ style, mode }: { style: SubtitleStyle; mode: SubtitlePreviewMode }) {
  const { t } = useTranslation()
  const { ref, size, scale } = useStage()
  return (
    <div ref={ref} className={styles.frame} aria-hidden>
      <img className={styles.image} src={eclipse} alt="" draggable={false} />
      <div
        className={styles.stage}
        style={
          scale < 1
            ? {
                width: size.w / scale,
                height: size.h / scale,
                transform: `translate(-50%, -50%) scale(${scale})`,
              }
            : undefined
        }
      >
        {mode === 'examples' && (
          <div className={styles.examples}>
            {(
              [
                ['web_subtitle_sample_1', 48],
                ['web_subtitle_sample_2', 24],
                ['web_subtitle_sample_3', 0],
              ] as const
            ).map(([key, pad]) => (
              <div key={key} className={styles.slot}>
                <div className={styles.slotView} style={{ marginBottom: dpCss(pad) }}>
                  <Cue text={t(key)} style={style} bottomFraction={DEFAULT_BOTTOM_FRACTION} fontSize={dpCss(style.fontSize)} />
                </div>
              </div>
            ))}
          </div>
        )}
        {mode === 'margin' && (
          <div className={styles.full}>
            {/* no Media3SubtitleOverride on this view upstream: the outline keeps Media3's 2dp whatever the edge size */}
            <Cue
              text={t('web_subtitle_sample_margin')}
              style={style}
              bottomFraction={style.margin / 100}
              fontSize={dpCss(style.fontSize)}
              outlineDp={MEDIA3_EDGE_DP}
            />
          </div>
        )}
        {mode === 'image' && (
          <div className={styles.full} style={{ opacity: style.imageOpacity / 100 }}>
            {/* default style and no setFixedTextSize upstream: Media3's fractional text size */}
            <Cue
              text={t('web_subtitle_sample_image')}
              style={DEFAULT_SUBTITLE_STYLE}
              bottomFraction={DEFAULT_BOTTOM_FRACTION}
              fontSize={`${DEFAULT_TEXT_SIZE_FRACTION * 100}cqh`}
              outlineDp={MEDIA3_EDGE_DP}
            />
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useTranslate } from '../common/useTranslate'
import { buildItemImageUrl, imagePx } from '../../api/images'
import { useSessionStore } from '../../stores/session'
import { QuickDetails, StreamChip } from '../../ui'
import { quickDetails, type TvProgram } from './guideModel'
import styles from './TvGuideHeader.module.css'

/** Header image height cap: the header is 30% of the guide area; 400dp covers 1080p at scale 1.25. */
const IMAGE_HEIGHT_DP = 320

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * `TvGuideHeader` (W/ui/detail/livetv/TvGuideHeader.kt): the focused program's title (75% wide, no logo), episode
 * name, quick details + "Repeat" label, overview (3 lines, not clickable), and its Primary image at the end
 * (300 ms cross-fade, the previous image stays until the next one loads). The header has a fixed height, so
 * the overview is the part that gives way when the lines above it leave less than its 76dp.
 */
export function TvGuideHeader({ program }: { program: TvProgram | null }) {
  const { t, locale } = useTranslate()
  const now = useNow(30_000)
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  const src =
    program && program.imageTag
      ? buildItemImageUrl(baseUrl, program.id, 'Primary', { tag: program.imageTag, maxHeight: imagePx(IMAGE_HEIGHT_DP) })
      : null
  const [shown, setShown] = useState<string | null>(null)
  return (
    <header className={styles.header}>
      <div className={styles.texts}>
        {/* TitleOrLogo with showLogo=false: headlineMedium SemiBold, one line on the TV (see the CSS); `program?.name ?: program?.id` */}
        <h2 className={styles.title} dir="auto">
          {/* a zero-width space keeps the line (and the layout under it) while no program is known */}
          {program ? (program.name ?? program.id) : '\u200b'}
        </h2>
        <div className={styles.details}>
          {program?.subtitle && (
            <p className={styles.subtitle} dir="auto">
              {program.subtitle}
            </p>
          )}
          <div className={styles.quickRow}>
            {program && <QuickDetails className={styles.quick} parts={quickDetails(program, now, t, locale)} />}
            {program?.isRepeat && <StreamChip text={t('live_tv_repeat')} />}
          </div>
          <div className={styles.overviewBox}>
            <p className={styles.overview} dir="auto">
              {program?.overview ?? ''}
            </p>
          </div>
        </div>
      </div>
      <div className={styles.imageBox}>
        {/* useExistingImageAsPlaceholder: keep the last image until the new one is decoded */}
        {shown && src !== shown && <img className={styles.image} src={shown} alt="" />}
        {src && (
          <img
            key={src}
            className={styles.image}
            data-fade
            src={src}
            alt=""
            onLoad={() => setShown(src)}
            onError={() => setShown(null)}
          />
        )}
      </div>
    </header>
  )
}

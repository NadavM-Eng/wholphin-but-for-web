import { formatClock } from '../../../lib/format'
import { dpCss } from '../../../theme/scale'
import { getPlaybackEngine, usePlaybackStore } from '../engine'
import styles from './TrickplayPreview.module.css'

const HEIGHT_DP = 160

/**
 * `TrickplayPreview` + `SeekPreviewImage` (overlay/TrickplayPreview.kt, SeekPreviewImage.kt): a 160dp tall
 * thumbnail cropped from the sprite sheet with a 1.5dp border, and the time chip below it. Without trickplay
 * only the chip shows. The chip's time is a clock ("1:02:03"), like the strip's two times (owner request;
 * upstream writes it in words).
 */
export function TrickplayPreview({ positionMs }: { positionMs: number }) {
  const trickplay = usePlaybackStore((s) => s.trickplay)
  const img = trickplay ? getPlaybackEngine().trickplayImage(positionMs) : null
  const ratio = img ? img.width / img.height : 16 / 9
  const scale = img ? HEIGHT_DP / img.height : 1
  return (
    <div className={styles.root}>
      {img && (
        <div
          className={styles.image}
          style={{
            height: dpCss(HEIGHT_DP),
            width: dpCss(HEIGHT_DP * ratio),
            backgroundImage: `url("${img.url}")`,
            backgroundSize: `${dpCss(img.sheetWidth * scale)} ${dpCss(img.sheetHeight * scale)}`,
            backgroundPosition: `calc(-1 * ${dpCss(img.x * scale)}) calc(-1 * ${dpCss(img.y * scale)})`,
          }}
        />
      )}
      <span className={styles.chip} dir="ltr" data-player-preview-time>
        {formatClock(positionMs)}
      </span>
    </div>
  )
}

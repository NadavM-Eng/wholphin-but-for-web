import { useState, type CSSProperties, type FocusEvent, type MouseEvent } from 'react'
import { buildItemImageUrl, imagePx } from '../../api/images'
import { useSessionStore } from '../../stores/session'
import { FaIcon } from '../../ui'
import styles from './ChannelCell.module.css'
import type { TvChannel } from './guideModel'

type Props = {
  channel: TvChannel
  row: number
  style: CSSProperties
  tabbable: boolean
  /** its dialog is open: keep the focused look (a Compose dialog is another window; focus stays on the cell) */
  held: boolean
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  onFocus: (e: FocusEvent<HTMLButtonElement>) => void
}

/** Logo box height: the 64dp row minus 2dp outer and 4dp inner padding, minus the 10sp name line. */
const LOGO_HEIGHT_DP = 40

/**
 * `Channel` (W/ui/detail/livetv/Components.kt:145-228): Surface with 8dp corners, surface@2dp (inverseSurface when
 * focused), 2dp outside / 4dp inside; the channel number, then the logo over the name (10sp, or 16sp when there is
 * no logo); a red heart at the top-end for favorites.
 */
export function ChannelCell({ channel, row, style, tabbable, held, onClick, onFocus }: Props) {
  const baseUrl = useSessionStore((s) => s.current?.api.basePath ?? null)
  const [failed, setFailed] = useState(false)
  // Upstream always requests the Primary image and hides it on error; without a tag there is nothing to show,
  // so the request (a guaranteed 404) is skipped.
  const src = channel.imageTag
    ? buildItemImageUrl(baseUrl, channel.id, 'Primary', { tag: channel.imageTag, maxHeight: imagePx(LOGO_HEIGHT_DP) })
    : null
  const showImage = !!src && !failed
  return (
    <div className={styles.box} style={style}>
      <button
        type="button"
        className={styles.cell}
        data-focusable
        data-focus-key={`lt-channel:${channel.id}`}
        data-row={row}
        data-channel
        data-held={held || undefined}
        tabIndex={tabbable ? 0 : -1}
        aria-label={[channel.number, channel.name].filter(Boolean).join(' ')}
        onClick={onClick}
        onFocus={onFocus}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span className={styles.row}>
          <span className={styles.number}>{channel.number ?? ''}</span>
          <span className={styles.column}>
            {showImage && <img className={styles.logo} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />}
            {channel.name && (
              <span className={styles.name} style={{ fontSize: showImage ? undefined : 'var(--name-large)' } as CSSProperties} dir="auto">
                {channel.name}
              </span>
            )}
          </span>
        </span>
        {channel.favorite && <FaIcon name="heart" size={16} className={styles.heart} />}
      </button>
    </div>
  )
}

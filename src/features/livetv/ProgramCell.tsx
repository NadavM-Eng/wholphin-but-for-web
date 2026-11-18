import type { CSSProperties, FocusEvent, MouseEvent, PointerEvent } from 'react'
import { FaIcon } from '../../ui'
import { CATEGORY_COLOR, isFake, type TvProgram } from './guideModel'
import styles from './ProgramCell.module.css'
import { RecordingMarker } from './RecordingMarker'

type Props = {
  program: TvProgram
  subtitle: string | null
  startedBeforeGuide: boolean
  colorCode: boolean
  /** absolute box in the guide content, CSS px */
  style: CSSProperties
  row: number
  column: number
  tabbable: boolean
  /** its dialog is open: keep the focused look (a Compose dialog is another window; focus stays on the cell) */
  held: boolean
  isDefault: boolean
  onClick: (e: MouseEvent<HTMLButtonElement>) => void
  onFocus: (e: FocusEvent<HTMLButtonElement>) => void
  onPointerEnter: (e: PointerEvent<HTMLButtonElement>) => void
}

/**
 * `Program` (W/ui/detail/livetv/Components.kt:36-142): a Surface inset 2dp in its box, 4dp corners (end corners
 * only, plus a caret, when the program started before the guide), category color or surface@1dp, inverted when
 * focused, scale .95 when pressed; title 16sp one line, "S1 E2 - Episode" 14sp; recording dots bottom-end.
 */
export function ProgramCell({
  program,
  subtitle,
  startedBeforeGuide,
  colorCode,
  style,
  row,
  column,
  tabbable,
  held,
  isDefault,
  onClick,
  onFocus,
  onPointerEnter,
}: Props) {
  const color = colorCode ? CATEGORY_COLOR[program.category ?? 'FAKE'] : null
  const title = program.name ?? program.id
  return (
    <div className={styles.box} style={style}>
      <button
        type="button"
        className={styles.cell}
        data-focusable
        data-focus-default={isDefault || undefined}
        data-focus-key={`lt-program:${program.id}`}
        data-row={row}
        data-col={column}
        data-fake={isFake(program) || undefined}
        data-before={startedBeforeGuide || undefined}
        data-held={held || undefined}
        tabIndex={tabbable ? 0 : -1}
        style={color ? ({ '--cell-bg': color } as CSSProperties) : undefined}
        onClick={onClick}
        onFocus={onFocus}
        onPointerEnter={onPointerEnter}
        onContextMenu={(e) => e.preventDefault()}
      >
        {startedBeforeGuide && <FaIcon name="caret_left" size={16} className={styles.caret} />}
        <span className={styles.texts}>
          <span className={styles.title} dir="auto">
            {title}
          </span>
          {subtitle && (
            <span className={styles.subtitle} dir="auto">
              {subtitle}
            </span>
          )}
        </span>
        <RecordingMarker isRecording={program.isRecording} isSeriesRecording={program.isSeriesRecording} />
      </button>
    </div>
  )
}

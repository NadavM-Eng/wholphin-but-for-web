import type { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models'
import { useRef } from 'react'
import type { Translate } from '../../../lib/format'
import { Dialog, FaIcon, ListItem } from '../../../ui'
import { handleListArrowKeys } from '../../../ui/lib/focus'
import type { SortAndDirection } from '../model/homeRowConfig'
import { BOX_SET_SORT_OPTIONS, sortLabelKey } from './editorModel'
import styles from './HomeSettings.module.css'

type Props = {
  open: boolean
  t: Translate
  title: string
  current: SortAndDirection
  onPick: (sort: ItemSortBy) => void
  onClose: () => void
}

/** surfaceColorAtElevation(5.dp): surfaceTint (= primary) at (4.5 ln(5+1) + 2)% over surface. */
const SURFACE_AT_5DP = `color-mix(in srgb, var(--c-primary) ${(4.5 * Math.log(6) + 2).toFixed(1)}%, var(--c-surface))`

/**
 * `ByParentSortDialogContent` in a BasicDialog (elevation 5dp, 320dp wide): `BoxSetSortOptions`, the
 * active one marked with a caret for its direction. Upstream sets the dialog window's gravity to START, so
 * the list opens at the start edge, over the settings panel (auto end margin in the centring backdrop).
 */
export function SortDialog({ open, t, title, current, onPick, onClose }: Props) {
  const list = useRef<HTMLDivElement>(null)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="basic"
      label={title}
      style={{ background: SURFACE_AT_5DP, marginInlineEnd: 'auto' }}
    >
      <div ref={list} className={styles.sortList} role="menu" aria-label={title} onKeyDown={(e) => list.current && handleListArrowKeys(e, list.current)}>
        {BOX_SET_SORT_OPTIONS.map((sort) => {
          const active = sort === current.sort
          return (
            <ListItem
              key={sort}
              role="menuitemradio"
              selected={active}
              leading={<span className={styles.caret}>{active && <FaIcon name={current.direction === 'Ascending' ? 'caret_up' : 'caret_down'} />}</span>}
              headline={t(sortLabelKey(sort))}
              onClick={() => onPick(sort)}
            />
          )
        })}
      </div>
    </Dialog>
  )
}

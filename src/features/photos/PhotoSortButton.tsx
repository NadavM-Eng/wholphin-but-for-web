import type { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DropdownMenu, DropdownMenuItem, FaIcon, TextButton } from '../../ui'
import styles from './PhotoFolderView.module.css'
import { flipDirection, nextSort, sortLabelKey, type SortAndDirection } from './photoQuery'

export type PhotoSortButtonProps = {
  options: readonly ItemSortBy[]
  current: SortAndDirection
  onChange: (s: SortAndDirection) => void
}

/**
 * `SortByButton` (W/ui/components/SortByButton.kt): text button "caret + sort name"; the menu marks the current
 * sort with its direction caret; picking it again flips the direction. Long-press (right-click here) flips.
 */
export function PhotoSortButton({ options, current, onChange }: PhotoSortButtonProps) {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const caret = current.direction === 'Ascending' ? 'caret_up' : 'caret_down'
  return (
    <>
      <TextButton
        ref={setAnchor}
        className={styles.sort}
        onClick={() => setOpen((v) => !v)}
        onContextMenu={(e) => {
          e.preventDefault()
          onChange({ ...current, direction: flipDirection(current.direction) })
        }}
      >
        <FaIcon name={caret} />
        <span>{t(sortLabelKey(current.sort))}</span>
      </TextButton>
      <DropdownMenu open={open} anchor={anchor} onClose={() => setOpen(false)} label={t(sortLabelKey(current.sort))}>
        {options.map((o) => (
          <DropdownMenuItem
            key={o}
            selected={o === current.sort}
            leading={o === current.sort ? <FaIcon name={caret} /> : <span />}
            onClick={() => {
              setOpen(false)
              onChange(nextSort(current, o))
            }}
          >
            {t(sortLabelKey(o))}
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    </>
  )
}

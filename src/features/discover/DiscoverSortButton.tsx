import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { nextSort, sortLabelKey, type DiscoverSort, type DiscoverSortAndDirection } from '../../api/seerr'
import { DropdownMenu, DropdownMenuItem, FaIcon, TextButton } from '../../ui'

export type DiscoverSortButtonProps = {
  options: readonly DiscoverSort[]
  current: DiscoverSortAndDirection
  onChange: (s: DiscoverSortAndDirection) => void
}

/** Upstream `DiscoverSortByButton`: "▼ Popularity"; picking the current option flips the direction; long-press (right-click) flips. */
export function DiscoverSortButton({ options, current, onChange }: DiscoverSortButtonProps) {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const caret = current.direction === 'asc' ? 'caret_up' : 'caret_down'
  return (
    <>
      <TextButton
        ref={setAnchor}
        onClick={() => setOpen((v) => !v)}
        onContextMenu={(e) => {
          e.preventDefault()
          onChange({
            ...current,
            direction: current.direction === 'asc' ? 'desc' : 'asc',
          })
        }}
        label={t('web_seerr_sort_label', { p1: t(sortLabelKey(current.sort)) })}
      >
        <FaIcon name={caret} /> {t(sortLabelKey(current.sort))}
      </TextButton>
      <DropdownMenu open={open} anchor={anchor} onClose={() => setOpen(false)} label={t('sort')}>
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

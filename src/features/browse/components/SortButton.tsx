import type { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models'
import { useState } from 'react'
import { DropdownMenu, DropdownMenuItem, FaIcon, TextButton } from '../../../ui'
import { useTranslate } from '../../common/useTranslate'
import { flipDirection, pickSort, sortLabelKey, type SortAndDirection } from '../model/sort'
import styles from './GridHeader.module.css'

type Props = {
  options: readonly ItemSortBy[]
  current: SortAndDirection
  onChange: (s: SortAndDirection) => void
}

const caret = (s: SortAndDirection) => (s.direction === 'Ascending' ? 'caret_up' : 'caret_down')

/**
 * `SortByButton` (W/ui/components/SortByButton.kt): a text button "caret + sort name" opening the sort
 * list; picking the current sort flips the direction. TV long-press flips it too: on the web that is a
 * right-click / touch long-press on the button.
 */
export function SortButton({ options, current, onChange }: Props) {
  const { t } = useTranslate()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <TextButton
        className={styles.sort}
        onClick={(e) => {
          const el = e.currentTarget
          setAnchor((a) => (a ? null : el))
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onChange({ ...current, direction: flipDirection(current.direction) })
        }}
        title={t('web_sort_flip_hint')}
      >
        <FaIcon name={caret(current)} />
        <span>{t(sortLabelKey(current.sort))}</span>
      </TextButton>
      <DropdownMenu open={!!anchor} anchor={anchor} onClose={() => setAnchor(null)} label={t('sort')}>
        {options.map((s) => (
          <DropdownMenuItem
            key={s}
            selected={s === current.sort}
            leading={s === current.sort ? <FaIcon name={caret(current)} /> : <span />}
            onClick={() => {
              setAnchor(null)
              onChange(pickSort(current, s))
            }}
          >
            {t(sortLabelKey(s))}
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
    </>
  )
}

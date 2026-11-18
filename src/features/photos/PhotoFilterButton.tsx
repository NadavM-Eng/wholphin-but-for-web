import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CircularProgress, DropdownMenu, DropdownMenuItem, ExpandableButton, FaIcon, MaterialIcon } from '../../ui'
import {
  clearFilters,
  countFilters,
  getFilterValue,
  PHOTO_FILTER_OPTIONS,
  setFilterValue,
  toggleFilterValue,
  type PhotoFilter,
} from './photoQuery'
import styles from './PhotoFolderView.module.css'
import { useFilterValues } from './useFilterValues'

type Option = (typeof PHOTO_FILTER_OPTIONS)[number]

export type PhotoFilterButtonProps = {
  current: PhotoFilter
  /** Library id the value lists come from. */
  parentId: string
  onChange: (f: PhotoFilter) => void
}

/**
 * `FilterByButton` (W/ui/components/FilterByButton.kt): expandable filter button with the active-filter count.
 * Menu 1: red "Remove" (any filter active), then each filter with a check when active. Menu 2: "Remove" for that
 * filter, then its values; multi-value filters stay open, Played / Favorite close it.
 */
export function PhotoFilterButton({ current, parentId, onChange }: PhotoFilterButtonProps) {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [nested, setNested] = useState<Option | null>(null)
  const count = countFilters(current)
  return (
    <>
      <span className={styles.filterWrap}>
        <ExpandableButton
          ref={setAnchor}
          iconKind="fa"
          icon={<FaIcon name="filter" size={16} />}
          label={t('filter')}
          onClick={() => setOpen((v) => !v)}
        />
        {count > 0 && (
          <span className={styles.filterCount} aria-hidden>
            {count}
          </span>
        )}
      </span>
      <DropdownMenu
        open={open && !nested}
        anchor={anchor}
        onClose={() => {
          setOpen(false)
          setNested(null)
        }}
        label={t('filter')}
      >
        {count > 0 && (
          <DropdownMenuItem
            leading={<MaterialIcon name="delete" />}
            leadingColor="var(--fx-delete-red)"
            className={styles.removeItem}
            onClick={() => {
              onChange(clearFilters())
              setOpen(false)
            }}
          >
            {t('remove')}
          </DropdownMenuItem>
        )}
        {PHOTO_FILTER_OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.kind}
            leading={getFilterValue(current, o.kind) != null ? <MaterialIcon name="check" /> : <span />}
            trailing={<MaterialIcon name="chevron_right" className={styles.flipRtl} />}
            onClick={() => setNested(o)}
          >
            {t(o.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenu>
      {nested && (
        <FilterValuesMenu
          option={nested}
          anchor={anchor}
          parentId={parentId}
          current={current}
          onChange={(f, closeNested) => {
            onChange(f)
            if (closeNested) setNested(null)
          }}
          onClose={() => setNested(null)}
        />
      )}
    </>
  )
}

function FilterValuesMenu({
  option,
  anchor,
  parentId,
  current,
  onChange,
  onClose,
}: {
  option: Option
  anchor: HTMLElement | null
  parentId: string
  current: PhotoFilter
  onChange: (f: PhotoFilter, closeNested: boolean) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const values = useFilterValues(option.kind, parentId)
  const active = getFilterValue(current, option.kind)
  const isSelected = (v: boolean | number | string) =>
    Array.isArray(active) ? (active as (number | string)[]).includes(v as number | string) : active === v
  return (
    <DropdownMenu open anchor={anchor} onClose={onClose} label={t(option.labelKey)} header={t(option.labelKey)}>
      {active != null && (
        <DropdownMenuItem
          leading={<MaterialIcon name="delete" />}
          leadingColor="var(--fx-delete-red)"
          className={styles.removeItem}
          onClick={() => onChange(setFilterValue(current, option.kind, undefined), true)}
        >
          {t('remove')}
        </DropdownMenuItem>
      )}
      {values.isPending ? (
        <div className={styles.menuSpinner}>
          <CircularProgress size={48} />
        </div>
      ) : values.isError ? (
        <p className={styles.menuEmpty}>{t('no_results')}</p>
      ) : (values.data ?? []).length === 0 ? (
        <p className={styles.menuEmpty}>{t('no_results')}</p>
      ) : (
        (values.data ?? []).map((v) => (
          <DropdownMenuItem
            key={String(v.value)}
            selected={isSelected(v.value)}
            leading={isSelected(v.value) ? <MaterialIcon name="check" /> : <span />}
            onClick={() => onChange(toggleFilterValue(current, option.kind, v.value), !option.multiple)}
          >
            {option.kind === 'communityRating' ? (
              <span className={styles.rating}>
                <MaterialIcon name="star" className={styles.star} />
                {new Intl.NumberFormat(i18n.language).format(Number(v.value))}+
              </span>
            ) : (
              <span dir="auto">{v.label}</span>
            )}
          </DropdownMenuItem>
        ))
      )}
    </DropdownMenu>
  )
}

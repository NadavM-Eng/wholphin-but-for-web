import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  clearFilters,
  countFilters,
  getFilterValue,
  setFilterValue,
  toggleFilterValue,
  useFilterValues,
  type DiscoverFilter,
  type DiscoverFilterOption,
} from '../../api/seerr'
import { CircularProgress, DropdownMenu, DropdownMenuItem, FaIcon, MaterialIcon, Button } from '../../ui'
import styles from './DiscoverGrid.module.css'

export type DiscoverFilterButtonProps = {
  options: DiscoverFilterOption[]
  current: DiscoverFilter
  isTv: boolean
  onChange: (f: DiscoverFilter) => void
}

/**
 * Upstream `DiscoverFilterByButton` (FilterByButton.kt): a filter icon with the active-filter count; the
 * menu lists "Remove" (when any filter is set) and each filter with a check when active; a filter opens
 * its values. Picking a value keeps the menu open (all Discover filters are `supportMultiple`); the community rating is a
 * single "{n}+ ★" minimum. "Remove" in a values menu returns to the filter menu.
 */
export function DiscoverFilterButton({ options, current, isTv, onChange }: DiscoverFilterButtonProps) {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [nested, setNested] = useState<DiscoverFilterOption | null>(null)
  const count = countFilters(current, options)
  return (
    <>
      <Button ref={setAnchor} onClick={() => setOpen((v) => !v)} label={t('filter')} title={t('filter')}>
        <span className={styles.filterButton}>
          <FaIcon name="filter" size={16} />
          {count > 0 && <span>{count}</span>}
          <span className={styles.filterLabel}>{t('filter')}</span>
        </span>
      </Button>
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
            onClick={() => {
              onChange(clearFilters(current, options))
              setOpen(false)
            }}
          >
            {t('remove')}
          </DropdownMenuItem>
        )}
        {options.map((o) => (
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
          current={current}
          isTv={isTv}
          onChange={(f, closeNested) => {
            onChange(f)
            // Upstream only drops the nested menu (`nestedDropDown = null`); the filter menu stays open.
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
  current,
  isTv,
  onChange,
  onClose,
}: {
  option: DiscoverFilterOption
  anchor: HTMLElement | null
  current: DiscoverFilter
  isTv: boolean
  /** `closeNested`: go back to the filter menu (upstream: "Remove" and single-value filters). */
  onChange: (f: DiscoverFilter, closeNested: boolean) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const values = useFilterValues(option.kind, isTv)
  const active = getFilterValue(current, option.kind)
  const isSelected = (v: number | string) => (Array.isArray(active) ? (active as (number | string)[]).includes(v) : active === v)
  // Every Discover filter has `supportMultiple = true` upstream, so picking a value never closes the menu;
  // the rating is still rendered as a single "{n}+ ★" minimum.
  const single = option.kind === 'rating'
  return (
    <DropdownMenu open anchor={anchor} onClose={onClose} label={t(option.labelKey)} header={t(option.labelKey)}>
      {active != null && (
        <DropdownMenuItem
          leading={<MaterialIcon name="delete" />}
          leadingColor="var(--fx-delete-red)"
          onClick={() => onChange(setFilterValue(current, option.kind, null), true)}
        >
          {t('remove')}
        </DropdownMenuItem>
      )}
      {values.isPending ? (
        <div className={styles.menuSpinner}>
          <CircularProgress size={48} />
        </div>
      ) : values.isError ? (
        <p className={styles.menuEmpty}>{t('web_seerr_error_occurred')}</p>
      ) : (values.data ?? []).length === 0 ? (
        <p className={styles.menuEmpty}>{t('no_results')}</p>
      ) : (
        (values.data ?? []).map((v) => (
          <DropdownMenuItem
            key={String(v.value)}
            selected={isSelected(v.value)}
            leading={isSelected(v.value) ? <MaterialIcon name="check" /> : <span />}
            onClick={() => onChange(toggleFilterValue(current, option.kind, v.value), false)}
          >
            {single ? (
              <span className={styles.rating}>
                {new Intl.NumberFormat(i18n.language).format(Number(v.value))}+{' '}
                <MaterialIcon name="star" className={styles.star} />
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

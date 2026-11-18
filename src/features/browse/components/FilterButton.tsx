import clsx from 'clsx'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { dp } from '../../../theme/scale'
import { Button, CircularProgress, DropdownMenuItem, FaIcon, MaterialIcon } from '../../../ui'
import { handleListArrowKeys } from '../../../ui/lib/focus'
import { MENU_EDGE_MARGIN } from '../../../ui/lib/menuPosition'
import { useTranslate } from '../../common/useTranslate'
import {
  countFilters,
  deleteFilters,
  isValueSelected,
  selectValue,
  type FilterDef,
  type FilterValue,
  type GetItemsFilter,
} from '../model/filter'
import styles from './FilterButton.module.css'
import header from './GridHeader.module.css'

type Props = {
  options: readonly FilterDef[]
  current: GetItemsFilter
  onChange: (f: GetItemsFilter) => void
  getValues: (def: FilterDef) => Promise<FilterValue[]>
  /** The dropdown is open (upstream `onShow`: focus returns to the button after a reload). */
  onShow?: (open: boolean) => void
}

type Pos = { left: number; top: number }

/**
 * material3 DropdownMenuPositionProvider with a DpOffset (menu 2 uses DpOffset(80, 16)), the same rule as the
 * kit's `menuPositionBelow` (src/ui/lib/menuPosition.ts), which takes no offset: start edges aligned (+x),
 * below the anchor (+y), else above it (-y), else centred on its top, else 48dp from the window edge nearer the
 * anchor. Anchored to the button's layout box, not its 1.1-scaled focused box.
 */
function place(anchor: HTMLElement, panel: HTMLElement, dx: number, dy: number): Pos {
  const b = anchor.getBoundingClientRect()
  const aw = anchor.offsetWidth || b.width
  const ah = anchor.offsetHeight || b.height
  const cx = (b.left + b.right) / 2
  const cy = (b.top + b.bottom) / 2
  const r = { left: cx - aw / 2, right: cx + aw / 2, top: cy - ah / 2, bottom: cy + ah / 2 }
  const w = panel.offsetWidth
  const h = panel.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight
  const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
  const margin = Math.min(dp(48), Math.max(MENU_EDGE_MARGIN, (vh - h) / 2))
  const fits = (y: number) => y >= margin && y + h <= vh - margin
  const edge = cy < vh / 2 ? margin : vh - margin - h
  const top = [r.bottom + dy, r.top - dy - h, r.top - h / 2].find(fits) ?? edge
  const left = rtl ? r.right - w - dx : r.left + dx
  return {
    left: Math.min(Math.max(MENU_EDGE_MARGIN, left), Math.max(MENU_EDGE_MARGIN, vw - w - MENU_EDGE_MARGIN)),
    top: Math.min(Math.max(MENU_EDGE_MARGIN, top), Math.max(MENU_EDGE_MARGIN, vh - h - MENU_EDGE_MARGIN)),
  }
}

/**
 * `FilterByButton` (W/ui/components/FilterByButton.kt): an expandable filter button with the active
 * filter count; menu 1 lists the filters (check on active ones, a red "Remove" on top when any is
 * active), menu 2 (offset 80,16dp from the button) lists a filter's values. Multi-select values toggle
 * and keep menu 2 open; Played / Favorite set the value and close it.
 */
export function FilterButton({ options, current, onChange, getValues, onShow }: Props) {
  const { t } = useTranslate()
  const button = useRef<HTMLElement>(null)
  const panel1 = useRef<HTMLDivElement>(null)
  const panel2 = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [nested, setNested] = useState<FilterDef | null>(null)
  const [values, setValues] = useState<FilterValue[] | null>(null)
  const [pos1, setPos1] = useState<Pos | null>(null)
  const [pos2, setPos2] = useState<Pos | null>(null)
  const count = countFilters(current, options)
  const nestedOpener = useRef<HTMLElement | null>(null)

  const close = () => {
    setOpen(false)
    setNested(null)
    onShow?.(false)
    button.current?.focus({ preventScroll: true })
  }
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  // Values of the nested filter (spinner while loading).
  useEffect(() => {
    if (!nested) return
    let live = true
    setValues(null)
    void getValues(nested).then((v) => live && setValues(v))
    return () => {
      live = false
    }
    // getValues is recreated by the caller on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nested])

  useLayoutEffect(() => {
    if (open && button.current && panel1.current) setPos1(place(button.current, panel1.current, 0, 0))
    else setPos1(null)
  }, [open])

  // Focus the first row once the panel is placed: it is visibility:hidden until then and cannot take focus.
  const placed1 = pos1 != null
  useEffect(() => {
    if (placed1) panel1.current?.querySelector<HTMLElement>('[data-first-row] [data-focusable]')?.focus({ preventScroll: true })
  }, [placed1])

  useLayoutEffect(() => {
    if (nested && button.current && panel2.current) setPos2(place(button.current, panel2.current, dp(80), dp(16)))
    else setPos2(null)
  }, [nested, values])

  const placed2 = pos2 != null && !!nested && !!values
  useEffect(() => {
    if (placed2) panel2.current?.querySelector<HTMLElement>('[data-first-row] [data-focusable]')?.focus({ preventScroll: true })
  }, [placed2])

  // Outside press / resize closes everything.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (button.current?.contains(target) || panel1.current?.contains(target) || panel2.current?.contains(target)) return
      closeRef.current()
    }
    const onResize = () => closeRef.current()
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const closeNested = () => {
    setNested(null)
    nestedOpener.current?.focus({ preventScroll: true })
  }

  const onKey = (level: 1 | 2) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' || e.key === 'Tab' || (level === 2 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))) {
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl'
      const back = e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!back) return
      }
      e.preventDefault()
      e.stopPropagation()
      if (level === 2) closeNested()
      else close()
      return
    }
    const root = level === 1 ? panel1.current : panel2.current
    if (root) handleListArrowKeys(e, root)
  }

  const removeRow = (onClick: () => void) => (
    <>
      <DropdownMenuItem className={styles.remove} leading={<MaterialIcon name="delete" />} leadingColor="var(--fx-delete-red)" onClick={onClick}>
        {t('remove')}
      </DropdownMenuItem>
      <hr className={styles.divider} />
    </>
  )

  const nestedValue = nested ? nested.get(current) : null

  return (
    <>
      <Button
        ref={button}
        variant="expandable"
        label={t('filter')}
        title={t('filter')}
        className={clsx(header.expand, styles.button)}
        onClick={() => {
          if (open) return close()
          onShow?.(true)
          setOpen(true)
        }}
      >
        <span className={header.faBox}>
          <FaIcon name="filter" />
        </span>
        {count > 0 && <span className={styles.count}>{count}</span>}
        <span className={header.reveal} aria-hidden>
          <span className={header.revealInner}>
            <span className={header.label}>{t('filter')}</span>
          </span>
        </span>
      </Button>
      {open &&
        createPortal(
          <>
            <div
              ref={panel1}
              role="menu"
              aria-label={t('filter')}
              data-focus-trap
              className={styles.panel}
              style={pos1 ?? { visibility: 'hidden', left: 0, top: 0 }}
              onKeyDown={onKey(1)}
            >
              {count > 0 &&
                removeRow(() => {
                  onChange(deleteFilters(current, options))
                  close()
                })}
              {options.map((o, i) => (
                <div key={o.kind}>
                  <FilterRow
                    first={i === 0}
                    active={o.get(current) != null}
                    label={t(o.labelKey)}
                    onClick={(el) => {
                      nestedOpener.current = el
                      setNested(o)
                    }}
                  />
                </div>
              ))}
            </div>
            {nested && (
              <div
                ref={panel2}
                role="menu"
                aria-label={t(nested.labelKey)}
                data-focus-trap
                className={clsx(styles.panel, styles.panel2)}
                style={pos2 ?? { visibility: 'hidden', left: 0, top: 0 }}
                onKeyDown={onKey(2)}
              >
                {nestedValue != null &&
                  removeRow(() => {
                    onChange(nested.set(current, null))
                    closeNested()
                  })}
                {values == null ? (
                  <div className={styles.spinner}>
                    <CircularProgress size={48} label={t('loading')} />
                  </div>
                ) : values.length === 0 ? (
                  <p className={styles.empty}>{t('no_results')}</p>
                ) : (
                  values.map((v, i) => {
                    const selected = isValueSelected(nested, current, v)
                    return (
                      <ValueRow
                        key={`${v.name}:${String(v.value)}`}
                        first={i === 0}
                        selected={selected}
                        label={nested.kind === 'CommunityRating' ? `${v.name}+` : v.name === 'True' || v.name === 'False' ? t(v.name === 'True' ? 'web_true' : 'web_false') : v.name}
                        star={nested.kind === 'CommunityRating'}
                        onClick={() => {
                          onChange(selectValue(nested, current, v))
                          if (!nested.supportMultiple) closeNested()
                        }}
                      />
                    )
                  })
                )}
              </div>
            )}
          </>,
          document.body,
        )}
    </>
  )
}

function FilterRow({ first, active, label, onClick }: { first: boolean; active: boolean; label: string; onClick: (el: HTMLElement) => void }) {
  return (
    <span className={styles.rowWrap} {...(first ? { 'data-first-row': true } : null)}>
      <DropdownMenuItem
        className={first ? styles.firstMarker : undefined}
        leading={active ? <MaterialIcon name="check" /> : <span />}
        onClick={(e) => onClick(e.currentTarget)}
      >
        {label}
      </DropdownMenuItem>
    </span>
  )
}

function ValueRow({ first, selected, label, star, onClick }: { first: boolean; selected: boolean; label: string; star: boolean; onClick: () => void }) {
  return (
    <span className={styles.rowWrap} {...(first ? { 'data-first-row': true } : null)}>
      <DropdownMenuItem
        className={clsx(first && styles.firstMarker, star && styles.starRow)}
        selected={selected}
        leading={selected ? <MaterialIcon name="check" /> : <span />}
        onClick={onClick}
      >
        {star ? (
          <span className={styles.star}>
            <MaterialIcon name="star" className={styles.starIcon} />
            {label}
          </span>
        ) : (
          label
        )}
      </DropdownMenuItem>
    </span>
  )
}

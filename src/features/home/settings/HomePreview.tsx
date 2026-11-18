import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect, useId, useRef, useState, type FocusEvent } from 'react'
import { submitBackdrop } from '../../../app/backdrop'
import { usePrefs } from '../../../stores/preferences'
import { CircularProgress } from '../../../ui'
import { useCardContext } from '../../common/cardAdapters'
import type { Library } from '../../common/libraries'
import { useTranslate } from '../../common/useTranslate'
import type { HomeRowState } from '../data/useHomeData'
import { POS_ATTR } from '../homeCardLayout'
import { HomeHeader } from '../HomeHeader'
import { HomeRowView } from '../HomeRowView'
import { parsePos, type HomePos } from '../useHomeFocus'
import styles from './HomeSettings.module.css'

type Props = {
  /** Row queries of the working copy (`useHomeRows(configs, libraries, 8)`, upstream `fetchRowData`). */
  rows: HomeRowState[]
  libraries: readonly Library[]
  busy: boolean
  /** Scroll to and point at this row (a row was opened in the list); `n` changes on every request. */
  showRow: { index: number; n: number } | null
  label: string
}

function itemAt(rows: HomeRowState[], pos: HomePos | null): BaseItemDto | null {
  return pos ? (rows[pos.row]?.query.data?.items[pos.col] ?? null) : null
}

function firstItem(rows: HomeRowState[]): BaseItemDto | null {
  for (const r of rows) {
    const it = r.query.data?.items[0]
    if (it) return it
  }
  return null
}

/**
 * The live preview (HomeSettingsPage.kt:350-369): Home's header and rows from the working copy, inert cards,
 * empty rows shown, no View more, no clock. The header and backdrop follow the focused preview card, else
 * the row opened in the list, else the first item of the first non-empty row.
 */
export function HomePreview({ rows, libraries, busy, showRow, label }: Props) {
  const { t } = useTranslate()
  const ctx = useCardContext()
  const showLogo = usePrefs('showLogos')
  const toggles = usePrefs('displayToggles')
  const [pos, setPos] = useState<HomePos | null>(null)
  const list = useRef<HTMLDivElement>(null)

  // a row opened in the list moves the preview position there (guarded update during render) ...
  const [seenRequest, setSeenRequest] = useState<number | null>(null)
  if (showRow && showRow.n !== seenRequest) {
    setSeenRequest(showRow.n)
    setPos({ row: showRow.index, col: 0 })
  }
  // ... and scrolls the preview to it
  useEffect(() => {
    if (!showRow) return
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches
    list.current?.querySelector(`[data-preview-row="${showRow.index}"]`)?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
  }, [showRow])

  const headerItem = itemAt(rows, pos) ?? firstItem(rows)
  useEffect(() => {
    if (headerItem) submitBackdrop(headerItem)
  }, [headerItem])

  const loading = busy || rows.some((r) => r.query.isFetching)
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const p = parsePos((e.target as HTMLElement).closest(`[${POS_ATTR}]`)?.getAttribute(POS_ATTR))
    if (p) setPos(p)
  }
  const key = useId()

  return (
    <section className={styles.preview} aria-label={label}>
      <HomeHeader item={headerItem} showLogo={showLogo} toggles={toggles} />
      <div ref={list} className={styles.previewRows} onFocus={onFocus} data-focus-group>
        {rows.map((row) => (
          <div key={row.index} className={styles.previewRow} data-preview-row={row.index} data-focus-group>
            <HomeRowView
              row={row}
              libraries={libraries}
              t={t}
              ctx={ctx}
              clickToPlay={false}
              restoreKey={`home-preview:${key}:${row.index}`}
              focusColumn={-1}
              tabColumn={0}
              preview
            />
          </div>
        ))}
      </div>
      {loading && (
        <div className={styles.previewSpinner}>
          <CircularProgress size={40} label={t('loading')} />
        </div>
      )}
    </section>
  )
}

import clsx from 'clsx'
import { useRef, type ReactNode } from 'react'
import { TabRow, type TabItem } from '../../../ui'
import { useTranslate } from '../../common/useTranslate'
import { useFitViewport } from './fitViewport'
import styles from './TabbedPage.module.css'

type Props = {
  tabs: TabItem[]
  selected: string | null
  onSelect: (key: string) => void
  /** `showTabs`: the tab row collapses while the content is scrolled past its first row. */
  showTabs: boolean
  children: ReactNode
}

/**
 * `TabbedPage` / `KeyedTabbedPage` (W/ui/components/TabbedPage.kt): a collapsible TabRow (padding top/bottom
 * 16dp, end padding for the clock) above the selected tab's content, which fills the rest of the window.
 */
export function TabbedPage({ tabs, selected, onSelect, showTabs, children }: Props) {
  const { t } = useTranslate()
  const page = useRef<HTMLDivElement>(null)
  useFitViewport(page)
  return (
    <div ref={page} className={styles.page}>
      <div className={clsx(styles.collapse, !showTabs && styles.collapsed)}>
        <div className={styles.collapseInner}>
          <TabRow className={styles.tabs} tabs={tabs} selectedKey={selected} onSelect={onSelect} label={t('web_tabs')} />
        </div>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  )
}

/** A page without tabs (generic folders, filtered collections): the same full-height column. */
export function FullHeightPage({ children, className }: { children: ReactNode; className?: string }) {
  const page = useRef<HTMLDivElement>(null)
  useFitViewport(page)
  return (
    <div ref={page} className={clsx(styles.page, styles.plain, className)}>
      {children}
    </div>
  )
}

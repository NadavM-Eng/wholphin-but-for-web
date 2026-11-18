import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useBlocker } from 'react-router'
import { ConfirmDialog, ErrorMessage, LoadingPage } from '../../ui'
import { findLibrary, type Library } from '../common/libraries'
import { useTranslate } from '../common/useTranslate'
import { configTitle } from './data/rowFetchers'
import { rowTitleText } from './data/rowTitle'
import { useHomeRows } from './data/useHomeData'
import { AddRowPage } from './settings/AddRowPage'
import type { HomeSettingsDest, StackEntry } from './settings/destinations'
import { byParentRow, editorTitleKey, favoriteRow, libraryRow, metaRow, type EditorRow } from './settings/editorModel'
import { FavoritesPage } from './settings/FavoritesPage'
import { GlobalPage } from './settings/GlobalPage'
import styles from './settings/HomeSettings.module.css'
import { HomePreview } from './settings/HomePreview'
import { PresetsPage } from './settings/PresetsPage'
import { RemovedNextUpDialog } from './settings/RemovedNextUpDialog'
import { RowListPage } from './settings/RowListPage'
import { RowSettingsPage } from './settings/RowSettingsPage'
import { RowTypePage } from './settings/RowTypePage'
import { SaveHomeSettingsDialog } from './settings/SaveHomeSettingsDialog'
import { SearchForDialog, type SearchForKind } from './settings/SearchForDialog'
import { SourcePage } from './settings/SourcePage'
import { useHomeSettingsEditor } from './settings/useHomeSettingsEditor'

/** `HomeSettingsViewModel.fetchRowData`: the preview loads 8 items per row. */
const PREVIEW_LIMIT = 8

const touchOnly = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches

/**
 * Home customization (W/ui/main/settings/HomeSettingsPage.kt): the settings panel with its own inner back
 * stack, the live preview, and the Save dialog.
 *
 * Back (spec 02 §1.6 / §5.3): on an inner page it pops that page, even with unsaved changes; on the row list
 * with changes it opens the Save dialog; otherwise it leaves. On the web every way back (Escape, the floating
 * Back button, browser Back) is a router navigation, so one blocker applies the rule to all of them. Leaving
 * by other means with unsaved changes (a link, a new URL) asks too; closing the tab shows the browser's
 * own "leave site?" prompt.
 */
export default function HomeSettingsPage() {
  const { t, locale } = useTranslate()
  const editor = useHomeSettingsEditor(t)
  const { rows, configs, libraries, actions } = editor
  const preview = useHomeRows(editor.ready ? configs : undefined, editor.ready ? libraries : undefined, PREVIEW_LIMIT)

  const [stack, setStack] = useState<StackEntry[]>([{ dest: { kind: 'rowList' } }])
  const [confirm, setConfirm] = useState<(() => void) | null>(null)
  const [searchFor, setSearchFor] = useState<SearchForKind | null>(null)
  const [removedOpen, setRemovedOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [showRow, setShowRow] = useState<{ index: number; n: number } | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  const top = stack[stack.length - 1].dest
  const push = (dest: HomeSettingsDest, returnKey?: string) =>
    setStack((s) => [...s.slice(0, -1), { ...s[s.length - 1], returnKey }, { dest }])
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), [])
  const toRoot = () => setStack((s) => [s[0]])
  const requestRow = (index: number) => setShowRow((r) => ({ index, n: (r?.n ?? 0) + 1 }))

  /** `addRow(func)`: pop to the row list, add, then show the new (last) row in the preview. */
  const addAndShow = (config: ReturnType<typeof metaRow>) => {
    toRoot()
    actions.addRow(config)
    requestRow(rows.length)
  }

  // ---- Back ----
  const stackRef = useRef(stack)
  const changedRef = useRef(editor.changed)
  const leaving = useRef(false)
  const lastBackish = useRef(false)
  useLayoutEffect(() => {
    stackRef.current = stack
    changedRef.current = editor.changed
  })
  const blocker = useBlocker(({ currentLocation, nextLocation, historyAction }) => {
    if (leaving.current || currentLocation.pathname === nextLocation.pathname) return false
    lastBackish.current = historyAction !== 'PUSH'
    if (lastBackish.current && stackRef.current.length > 1) return true
    return changedRef.current
  })
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (lastBackish.current && stackRef.current.length > 1) {
      pop()
      blocker.reset()
      return
    }
    setSaveOpen(true)
  }, [blocker, pop])
  const leave = () => {
    leaving.current = true
    setSaveOpen(false)
    if (blocker.state === 'blocked') blocker.proceed()
  }
  useEffect(() => {
    if (!editor.changed) return
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [editor.changed])

  // ---- focus: first entry of a new inner page, the opener when one is popped (not on touch-only screens) ----
  const prevDepth = useRef(0)
  useLayoutEffect(() => {
    if (!editor.ready) return
    const depth = stack.length
    const popped = depth < prevDepth.current
    prevDepth.current = depth
    if (touchOnly() || !panel.current) return
    const returnKey = popped ? stack[depth - 1].returnKey : undefined
    const target =
      (returnKey && panel.current.querySelector<HTMLElement>(`[data-hs-key="${CSS.escape(returnKey)}"] [data-focusable]`)) ||
      panel.current.querySelector<HTMLElement>('[data-focusable]')
    target?.focus({ preventScroll: false })
  }, [stack, editor.ready])

  if (editor.error) {
    return (
      <div className={styles.page}>
        <ErrorMessage title={t('compose_error_message_title')} detail={editor.error instanceof Error ? editor.error.message : String(editor.error)} />
      </div>
    )
  }
  if (!editor.ready) {
    return (
      <div className={styles.page}>
        <LoadingPage label={t('loading')} />
      </div>
    )
  }

  const titleOf = (row: EditorRow): string => {
    const key = editorTitleKey(row.config)
    if (key) return t(key)
    const data = preview[rows.indexOf(row)]?.query.data
    if (row.config.type === 'ByParent' && data) return rowTitleText(t, data.title)
    return rowTitleText(t, configTitle(row.config, libraries)) || t('unknown')
  }

  const page = () => {
    switch (top.kind) {
      case 'rowList':
        return (
          <RowListPage
            t={t}
            rows={rows}
            source={editor.source}
            titleOf={titleOf}
            onAdd={() => push({ kind: 'addRow' }, 'add')}
            onSource={() => push({ kind: 'source' }, 'source')}
            onSettings={() => push({ kind: 'global' }, 'settings')}
            onPresets={() => push({ kind: 'presets' }, 'presets')}
            onRow={(index, row) => {
              push({ kind: 'rowSettings', rowId: row.id }, `row:${row.id}`)
              requestRow(index)
            }}
            onMove={actions.move}
            onReorder={actions.reorder}
            onDelete={actions.remove}
          />
        )
      case 'addRow':
        return (
          <AddRowPage
            t={t}
            libraries={libraries}
            onMeta={(type) => addAndShow(metaRow(type))}
            onLibrary={(l: Library) => push({ kind: 'rowType', libraryId: l.id }, `lib:${l.id}`)}
            onFavorites={() => push({ kind: 'favorites' }, 'favorites')}
            onCollection={() => setSearchFor('BoxSet')}
            onPlaylist={() => setSearchFor('Playlist')}
          />
        )
      case 'rowType': {
        const library = findLibrary(libraries, top.libraryId)
        if (!library) return null
        return (
          <RowTypePage
            t={t}
            library={library}
            onPick={(type) => {
              const config = libraryRow(library, type)
              if (config) addAndShow(config)
              else setSearchFor(type === 'PLAYLIST' ? 'Playlist' : 'BoxSet')
            }}
          />
        )
      }
      case 'favorites':
        return <FavoritesPage t={t} libraries={libraries} onPick={(kind) => addAndShow(favoriteRow(kind))} />
      case 'presets':
        return <PresetsPage t={t} onApply={(p) => void actions.applyPreset(p)} />
      case 'global':
        return <GlobalPage t={t} onResize={actions.resize} onViewRemoved={() => setRemovedOpen(true)} />
      case 'source': {
        const ask = (fn: () => void) => () => setConfirm(() => fn)
        return (
          <SourcePage
            t={t}
            pluginActive={editor.pluginActive}
            onLoadServer={ask(() => void actions.loadFromServer())}
            onLoadPlugin={ask(() => void actions.loadFromPlugin())}
            onLoadWeb={ask(() => void actions.loadFromWeb())}
            onReset={ask(() => {
              toRoot()
              void actions.resetToDefault()
            })}
          />
        )
      }
      case 'rowSettings': {
        const row = rows.find((r) => r.id === top.rowId)
        if (!row) return null
        return (
          <RowSettingsPage
            key={row.id}
            t={t}
            row={row}
            title={titleOf(row)}
            onViewOptions={(vo) => actions.updateViewOptions(row.id, vo)}
            onConfig={(c) => actions.updateConfig(row.id, c)}
            onCombine={() => {
              actions.combine(row.id)
              pop()
            }}
            onSplit={() => {
              actions.split(row.id)
              pop()
            }}
          />
        )
      }
    }
  }

  return (
    <div className={styles.page}>
      <div ref={panel} className={styles.panel} data-focus-group>
        {page()}
      </div>
      <HomePreview rows={preview} libraries={libraries} busy={editor.busy} showRow={showRow} label={t('web_home_preview')} />
      <ConfirmDialog
        open={confirm != null}
        title={t('confirm')}
        body={t('overwrite_local_settings')}
        cancelLabel={t('cancel')}
        confirmLabel={t('confirm')}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const fn = confirm
          setConfirm(null)
          fn?.()
        }}
      />
      <SearchForDialog
        key={searchFor ?? 'none'}
        kind={searchFor}
        t={t}
        onClose={() => setSearchFor(null)}
        onPick={(item) => {
          setSearchFor(null)
          if (item.Id) addAndShow(byParentRow(item.Id))
        }}
      />
      <RemovedNextUpDialog open={removedOpen} t={t} locale={locale} onClose={() => setRemovedOpen(false)} />
      <SaveHomeSettingsDialog
        open={saveOpen}
        t={t}
        onClose={() => {
          setSaveOpen(false)
          if (blocker.state === 'blocked') blocker.reset()
        }}
        onSaveLocal={() => void actions.saveLocal().then((ok) => ok && leave())}
        onSaveServer={() => void actions.saveServer().then((ok) => ok && leave())}
        onDiscard={leave}
      />
    </div>
  )
}

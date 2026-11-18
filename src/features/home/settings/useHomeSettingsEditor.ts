// State of the home customization screen (W/ui/main/settings/HomeSettingsViewModel.kt): an in-memory working
// copy of the row list; only Save writes it (spec 02 §5.5). The 4 global preferences persist on change.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useState } from 'react'
import { qk } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'
import { libraryDrawerId } from '../../../app/shell/drawerItems'
import { getNavPins } from '../../../app/shell/navPins'
import { toast } from '../../../app/toast'
import type { Translate } from '../../../lib/format'
import { findLibrary, useLibraries, type Library } from '../../common/libraries'
import { homeSettingsKey, useHomeSettings } from '../data/useHomeData'
import { SUPPORTED_HOME_PAGE_SETTINGS_VERSION, type HomeRowConfig, type HomeRowViewOptions } from '../model/homeRowConfig'
import { applyPreset, createDefaultRows, type HomeRowPresets } from '../model/homeRowPresets'
import {
  isServerPluginInstalled,
  loadFromPlugin,
  loadFromServer,
  parseFromWebConfig,
  saveLocal,
  saveToServer,
  setSource,
  type HomeSettingsSource,
  type ResolvedHomeSettings,
} from '../model/homeSettings'
import {
  combineRows,
  moveRow,
  reorderRow,
  resizeAll,
  rowsChanged,
  splitRow,
  withIds,
  type EditorRow,
  type MoveDirection,
} from './editorModel'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import type { CollectionType } from '@jellyfin/sdk/lib/generated-client/models'

type Working = { rows: EditorRow[]; nextId: number; source: HomeSettingsSource; original: HomeRowConfig[] }

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err))

export type HomeSettingsEditor = ReturnType<typeof useHomeSettingsEditor>

export function useHomeSettingsEditor(t: Translate) {
  const api = useApi()
  const qc = useQueryClient()
  const session = useSession()
  const settings = useHomeSettings()
  const libraries = useLibraries()
  const [work, setWork] = useState<Working | null>(null)
  /** Upstream `loading`: Loading while a source load / reset runs (the preview spinner). */
  const [busy, setBusy] = useState(false)

  const plugin = useQuery({
    queryKey: qk('home', 'serverPlugin'),
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => isServerPluginInstalled(api, signal),
    enabled: !!session,
  })

  // Init once from the current settings (upstream waits for HomeSettingsService.currentSettings).
  // (a guarded state update during render: React re-renders at once, no effect round trip)
  const resolved = settings.data
  if (resolved && !work) {
    setWork({ rows: withIds(resolved.rows), nextId: resolved.rows.length, source: resolved.source, original: resolved.rows })
  }

  const rows = useMemo(() => work?.rows ?? [], [work])
  const configs = useMemo(() => rows.map((r) => r.config), [rows])
  const changed = !!work && rowsChanged(configs, work.original)

  const update = useCallback((fn: (w: Working) => Partial<Working>) => setWork((w) => (w ? { ...w, ...fn(w) } : w)), [])
  const setRows = useCallback((fn: (rows: EditorRow[], w: Working) => EditorRow[]) => update((w) => ({ rows: fn(w.rows, w) })), [update])

  /** Appends a row; returns its id. */
  const addRow = useCallback(
    (config: HomeRowConfig): number => {
      let id = -1
      setWork((w) => {
        if (!w) return w
        id = w.nextId
        return { ...w, rows: [...w.rows, { id, config }], nextId: w.nextId + 1 }
      })
      return id
    },
    [],
  )

  const replaceAll = useCallback(
    (list: HomeRowConfig[], source: HomeSettingsSource) => update(() => ({ rows: withIds(list), nextId: list.length, source })),
    [update],
  )

  const pinnedLibraries = (all: readonly Library[]) => {
    const pins = getNavPins()
    return all.filter((l) => pins[libraryDrawerId(l.id)]?.type !== 'UNPINNED')
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast(t('web_home_settings_error', { p1: errMsg(err) }), { long: true })
    } finally {
      setBusy(false)
    }
  }

  const userId = session?.user.id ?? ''
  const serverId = session?.server.id ?? ''

  const actions = {
    move: (direction: MoveDirection, index: number) => setRows((r) => moveRow(r, direction, index)),
    reorder: (from: number, to: number) => setRows((r) => reorderRow(r, from, to)),
    remove: (index: number) => setRows((r) => (r.length > 1 ? r.filter((_, i) => i !== index) : r)),
    addRow,
    updateViewOptions: (rowId: number, vo: HomeRowViewOptions) =>
      setRows((r) => r.map((row) => (row.id === rowId ? { ...row, config: { ...row.config, viewOptions: vo } } : row))),
    updateConfig: (rowId: number, config: HomeRowConfig) => setRows((r) => r.map((row) => (row.id === rowId ? { ...row, config } : row))),
    combine: (rowId: number) => setRows((r) => combineRows(r, rowId)),
    split: (rowId: number) => update((w) => ({ rows: splitRow(w.rows, rowId, w.nextId), nextId: w.nextId + 1 })),
    resize: (relative: number) => setRows((r) => resizeAll(r, relative)),
    applyPreset: (preset: HomeRowPresets) =>
      run(async () => {
        // collection type: the loaded libraries first, else GET /Items/{id} (HomeSettingsViewModel.applyPreset)
        const types = new Map<string, CollectionType | null>()
        for (const row of rows) {
          if (!('parentId' in row.config)) continue
          const id = row.config.parentId
          if (types.has(id)) continue
          const lib = findLibrary(libraries.data, id)
          if (lib) types.set(id, lib.collectionType)
          else {
            try {
              types.set(id, (await getLibraryApi(api).getItem({ itemId: id, userId })).data.CollectionType ?? null)
            } catch {
              types.set(id, null)
            }
          }
        }
        setRows((r) => {
          const next = applyPreset(
            r.map((x) => x.config),
            preset,
            (id) => types.get(id) ?? null,
          )
          return r.map((x, i) => ({ ...x, config: next[i] }))
        })
      }),
    loadFromServer: () =>
      run(async () => {
        const s = await loadFromServer(api, userId)
        if (s) replaceAll(s.rows, 'SERVER_PROFILE')
        else toast(t('web_no_server_home_settings'))
      }),
    loadFromPlugin: () =>
      run(async () => {
        const s = await loadFromPlugin(api)
        if (s) replaceAll(s.rows, 'PLUGIN')
        else toast(t('web_no_plugin_home_settings'))
      }),
    loadFromWeb: () =>
      run(async () => {
        const list = await parseFromWebConfig(api, userId, libraries.data ?? [])
        // the editor records a web-client import as LOCAL (HomeSettingsViewModel.kt:581-608)
        if (list) replaceAll(list, 'LOCAL')
        else toast(t('web_no_web_home_settings'))
      }),
    resetToDefault: () =>
      run(async () => {
        let s: { rows: HomeRowConfig[]; source: HomeSettingsSource } | null = null
        if (plugin.data) {
          try {
            const p = await loadFromPlugin(api)
            if (p) s = { rows: p.rows, source: 'PLUGIN' }
          } catch {
            s = null
          }
        }
        s ??= { rows: createDefaultRows(pinnedLibraries(libraries.data ?? [])), source: 'DEFAULT' }
        replaceAll(s.rows, s.source)
      }),
    /** Save > "Save only to this device". Returns true on success. */
    saveLocal: async (): Promise<boolean> => {
      try {
        saveLocal(serverId, userId, { rows: configs, version: SUPPORTED_HOME_PAGE_SETTINGS_VERSION })
        setSource(serverId, userId, 'LOCAL')
        commit('LOCAL')
        return true
      } catch (err) {
        toast(t('web_error_saving', { p1: errMsg(err) }), { long: true })
        return false
      }
    },
    /** Save > "Save to server user profile". */
    saveServer: async (): Promise<boolean> => {
      try {
        await saveToServer(api, userId, { rows: configs, version: SUPPORTED_HOME_PAGE_SETTINGS_VERSION })
        setSource(serverId, userId, 'SERVER_PROFILE')
        commit('SERVER_PROFILE')
        return true
      } catch (err) {
        toast(t('web_error_saving', { p1: errMsg(err) }), { long: true })
        return false
      }
    },
  }

  /** `updateCurrent`: Home shows the saved rows at once. */
  function commit(source: HomeSettingsSource) {
    qc.setQueryData<ResolvedHomeSettings>(homeSettingsKey(), { source, rows: configs })
    update(() => ({ original: configs, source }))
    toast(t('settings_saved'))
  }

  return {
    ready: !!work && !!libraries.data,
    error: settings.error ?? libraries.error,
    rows,
    configs,
    source: work?.source ?? 'UNSET',
    changed,
    busy,
    libraries: libraries.data ?? [],
    pluginActive: plugin.data === true,
    actions,
  }
}

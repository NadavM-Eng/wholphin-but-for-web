import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { qk } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'
import { moveFocus } from '../../../app/spatialNav'
import { toast } from '../../../app/toast'
import { Button, CircularProgress, Dialog, ListItem, MaterialIcon, SearchField, TextField } from '../../../ui'
import { useTranslate } from '../../common/useTranslate'
import styles from './AddToPlaylistDialog.module.css'
import { fieldArrowExit } from '../../../ui/lib/fieldArrowExit'
import { addToPlaylist, createPlaylist, editablePlaylists } from './playlists'

const MEDIA_TYPE_KEY: Record<string, string> = { Video: 'video', Audio: 'audio', Photo: 'photos' }

const errorText = (t: (k: string) => string, err: unknown) => `${t('error')}: ${err instanceof Error ? err.message : String(err)}`

/**
 * Upstream `PlaylistDialog` + `PlaylistList` (W/ui/detail/PlaylistList.kt): search box (750 ms debounce, the
 * search button fires at once), the editable playlists with media type and item count, and "Create new
 * playlist". Picking one adds the item and shows "Success".
 */
export function AddToPlaylistDialog({ item, onClose }: { item: BaseItemDto; onClose: () => void }) {
  const { t } = useTranslate()
  const api = useApi()
  const qc = useQueryClient()
  const userId = useSession()?.user.id ?? ''
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const searchFocused = useRef(false)

  useEffect(() => {
    if (input === query) return
    const h = window.setTimeout(() => setQuery(input), 750)
    return () => window.clearTimeout(h)
  }, [input, query])

  const playlists = useQuery({
    queryKey: qk('detail', 'editablePlaylists', query),
    queryFn: ({ signal }) => editablePlaylists(api, userId, query, t('unknown'), signal),
    staleTime: 0,
  })

  // Focus moves to the list once it loads, unless the user is in the search box.
  useEffect(() => {
    if (playlists.isSuccess && !searchFocused.current) {
      listRef.current?.querySelector<HTMLElement>('[data-focusable]')?.focus({ preventScroll: true })
    }
  }, [playlists.isSuccess, playlists.data])

  const itemId = item.Id ?? ''
  const pick = async (playlistId: string) => {
    onClose()
    try {
      await addToPlaylist(api, playlistId, itemId, userId)
      toast(t('success'))
      void qc.invalidateQueries({ queryKey: qk('detail', 'playlist', playlistId) })
    } catch (err) {
      toast(errorText(t, err))
    }
  }

  const create = async (name: string) => {
    setCreating(false)
    onClose()
    try {
      const id = await createPlaylist(api, name, [itemId], userId)
      if (id) toast(t('success'))
      else toast(t('web_error_creating_playlist'), { long: true })
    } catch (err) {
      toast(errorText(t, err))
    }
  }

  return (
    <>
      {/* PlaylistList.kt:290-305: focus starts on an invisible placeholder, not in the search box (no on-screen
          keyboard over the list on a phone); the first playlist takes it once the list loads. */}
      <Dialog
        open
        onClose={onClose}
        variant="basic"
        elevation={3}
        label={t('add_to_playlist')}
        className={styles.panel}
        initialFocus={() => columnRef.current}
      >
        <div ref={columnRef} className={styles.column} tabIndex={-1}>
          <h2 className={styles.title}>{t('add_to_playlist')}</h2>
          {/* spatialNav leaves arrow keys to text inputs; PlaylistList.kt's D-pad still moves out of the field. */}
          <div
            onFocus={() => (searchFocused.current = true)}
            onBlur={() => (searchFocused.current = false)}
            onKeyDown={(e) => {
              const el = e.target
              if (!(el instanceof HTMLInputElement)) return
              const rtl = getComputedStyle(el).direction === 'rtl'
              const dir = fieldArrowExit(e.key, el, rtl, e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
              if (dir && moveFocus(dir)) e.preventDefault()
            }}
          >
            <SearchField
              value={input}
              onChange={setInput}
              onSearch={(q) => {
                if (q.trim() !== '') {
                  setInput(q)
                  setQuery(q)
                }
              }}
              label={t('search')}
              placeholder={t('search')}
              className={styles.search}
            />
          </div>
          {playlists.isPending ? (
            <div className={styles.spinner}>
              <CircularProgress size={48} />
            </div>
          ) : playlists.isError ? (
            <p className={styles.error}>{errorText(t, playlists.error)}</p>
          ) : (
            <div ref={listRef} className={styles.list} role="menu" aria-label={t('add_to_playlist')}>
              {playlists.data.map((p) => (
                <ListItem
                  key={p.id}
                  role="menuitem"
                  headline={<span dir="auto">{p.name}</span>}
                  supporting={t(MEDIA_TYPE_KEY[p.mediaType ?? ''] ?? 'unknown')}
                  trailing={t('items', { count: p.count })}
                  onClick={() => void pick(p.id)}
                />
              ))}
              <hr className={styles.divider} />
              <ListItem
                role="menuitem"
                headline={t('create_playlist')}
                leading={<MaterialIcon name="add" />}
                onClick={() => setCreating(true)}
              />
            </div>
          )}
        </div>
      </Dialog>
      {creating && <CreatePlaylistDialog onCancel={() => setCreating(false)} onSubmit={(name) => void create(name)} />}
    </>
  )
}

/** The name prompt of "Create new playlist". Upstream's keyboard Done submits a blank name; here it does not. */
function CreatePlaylistDialog({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (name: string) => void }) {
  const { t } = useTranslate()
  const [name, setName] = useState('')
  const valid = name.trim() !== ''
  return (
    <Dialog open onClose={onCancel} variant="basic" elevation={3} label={t('create_playlist')}>
      <form
        className={styles.create}
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onSubmit(name)
        }}
      >
        <p className={styles.createLabel}>{t('name')}</p>
        <TextField value={name} onChange={setName} label={t('name')} autoFocus autoCapitalize="words" enterKeyHint="done" />
        <Button type="submit" disabled={!valid}>
          {t('submit')}
        </Button>
      </form>
    </Dialog>
  )
}

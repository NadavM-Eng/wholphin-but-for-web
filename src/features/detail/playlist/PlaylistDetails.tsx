import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { qk } from '../../../api/queryKeys'
import { useApi, useSession } from '../../../api/session'
import { useNav } from '../../../app/nav'
import { toast } from '../../../app/toast'
import { formatDuration, formatTimeOfDay, roundMinutesMs, roundSecondsMs, ticksToMs } from '../../../lib/format'
import { useMusicQueue } from '../../../stores/musicQueue'
import { Button, Dialog, FaIcon, ListItem, TextButton, WatchedBadge } from '../../../ui'
import { MusicQueueMarker } from '../../music/components/MusicQueueMarker'
import { useMusicContextMenu } from '../../music/menu/useMusicContextMenu'
import { itemSubtitle, itemTitle } from '../../common/itemText'
import { useTranslate } from '../../common/useTranslate'
import { useMinuteClock } from '../common/useMinuteClock'
import { getItemMenuHandlers } from '../../common/itemMenuHandlers'
import { canEditPlaylist, entryIdFor, moveInPlaylist, playlistCanEditKey, playlistEntries, removeFromPlaylist } from '../common/playlists'
import { sortedListDeps } from '../common/sortOptions'
import { FullHeightPage } from '../../browse/components/TabbedPage'
import { LibraryGrid, type GridSource, type ListRowArgs } from '../../browse/components/LibraryGrid'
import { gridItemsParams, itemsLetterIndex, itemsPageFetcher } from '../../browse/data/gridRequests'
import type { GridState } from '../../browse/data/useGridState'
import { countFilters, DEFAULT_FILTER_OPTIONS, type GetItemsFilter } from '../../browse/model/filter'
import { PLAYLIST_SORT_OPTIONS, type SortAndDirection } from '../../browse/model/sort'
import { VIEW_OPTIONS_DEFAULT, type ViewOptions } from '../../browse/model/viewOptions'
import styles from './PlaylistDetails.module.css'
import { playlistMediaType, type PlayMediaType } from './playlistModel'

/** `playlistDefaultViewOptions` (PlaylistDetails.kt:750): a list with the details pane, no spacing. */
const PLAYLIST_VIEW_OPTIONS: ViewOptions = Object.freeze({ ...VIEW_OPTIONS_DEFAULT, spacing: 0, showDetails: true, type: 'LIST' })
const DEFAULT_SORT: SortAndDirection = Object.freeze({ sort: 'Default', direction: 'Ascending' })
const NO_FILTER: GetItemsFilter = Object.freeze({})

const errorText = (t: (k: string) => string, err: unknown) => `${t('error')}: ${err instanceof Error ? err.message : String(err)}`

/**
 * Upstream `PlaylistDetails` (W/ui/detail/PlaylistDetails.kt): a `CollectionFolderViewContent` over the playlist
 * (title, Sort / Filter / View options, Random / Play / Shuffle; list, dense list or grid with the details pane),
 * saved per playlist like a library. Its list rows are `PlaylistItem`s: position number (Default sort), the music
 * queue marker on songs, favorite, title, subtitle, runtime and "Ends at", watched check, Move up / down when the
 * user may edit the playlist, and a More button with the item menu, or the music menu on a song (+ "Remove from
 * playlist"). The Play key on an item plays a video playlist from it and a song by itself. It is the page of every
 * playlist, audio ones included (DestinationContent.kt: PLAYLIST -> PlaylistDetails).
 */
export function PlaylistDetails({ item }: { item: BaseItemDto }) {
  const { t } = useTranslate()
  const api = useApi()
  const qc = useQueryClient()
  const go = useNav()
  const userId = useSession()?.user.id ?? ''
  const id = item.Id ?? ''
  const [playAs, setPlayAs] = useState<{ index: number; target: BaseItemDto; shuffle: boolean; s: GridState } | null>(null)

  const canEdit =
    useQuery({
      queryKey: playlistCanEditKey(id),
      queryFn: ({ signal }) => canEditPlaylist(api, id, userId, signal),
    }).data ?? false

  const listKey = qk('detail', 'playlist', id)
  const entries = useQuery({
    queryKey: [...listKey, 'entries'],
    enabled: canEdit,
    queryFn: ({ signal }) => playlistEntries(api, id, userId, signal),
  }).data
  const refresh = () => void qc.invalidateQueries({ queryKey: listKey })

  const paramsFor = (s: GridState) =>
    gridItemsParams({ parentId: id, collectionType: null, recursive: false, filter: s.filter, sort: s.sort }, userId)

  const source = useMemo(
    () =>
      (s: GridState): GridSource => {
        const params = gridItemsParams({ parentId: id, collectionType: null, recursive: false, filter: s.filter, sort: s.sort }, userId)
        return {
          key: [...listKey, 'items', params],
          fetchPage: itemsPageFetcher(api, params),
          deps: sortedListDeps(s.sort.sort),
          letterIndex: (letter, total) => itemsLetterIndex(api, params, letter, total),
        }
      },
    // listKey is derived from id
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api, id, userId],
  )

  /** `determineMediaType`: the server's type, else one shared kind among the first 50 items of the current list. */
  const mediaTypeFor = async (s: GridState): Promise<PlayMediaType> => {
    if (item.MediaType === 'Video' || item.MediaType === 'Audio') return item.MediaType
    const res = await getLibraryApi(api).getItems({ ...paramsFor(s), startIndex: 0, limit: 50, enableTotalRecordCount: true })
    return playlistMediaType(item.MediaType, res.data.TotalRecordCount ?? null, res.data.Items ?? [])
  }

  /**
   * `play(index, item, shuffle)`: `target` is the playlist for Play all / Shuffle and the row's item for the Play
   * key and the music menu's Play.
   */
  const play = async (index: number, target: BaseItemDto, shuffle: boolean, s: GridState, override?: PlayMediaType) => {
    let type = override
    try {
      type ??= await mediaTypeFor(s)
    } catch (err) {
      toast(errorText(t, err))
      return
    }
    if (type === 'Video') {
      const filtered = countFilters(s.filter, DEFAULT_FILTER_OPTIONS) > 0
      go.playList(id, {
        index,
        shuffle,
        ...(s.sort.sort !== 'Default' ? { sort: s.sort.sort, order: s.sort.direction === 'Ascending' ? 'asc' : 'desc' } : {}),
        // PlaybackList(filter = state.filter), as the GetItemsFilter JSON (browse's playAllPath).
        ...(filtered ? { filter: JSON.stringify(s.filter) } : {}),
      })
    } else if (type === 'Audio') {
      // MusicViewModel.play(item, index, shuffled): the playlist's songs from `index` on go to the music queue; a
      // song (Play key or menu Play on a row) becomes a one-song queue. The handler is the one MusicHost installs,
      // which the item menu's Play / Shuffle use too.
      getItemMenuHandlers().playMusic(target, { startIndex: index, shuffle })
    } else {
      setPlayAs({ index, target, shuffle, s })
    }
  }

  // Songs get the music menu (PlaylistDetails.kt showContextMenu: ContextMenu.ForMusic), everything else the item
  // menu. The grid's state (sort, filter) when the menu was opened decides what its Play and "Remove from
  // playlist" act on: it is recorded by the open handlers below, not while rendering.
  const menuState = useRef<GridState | null>(null)
  const musicMenu = useMusicContextMenu({
    pageItemId: id,
    onPlay: (index, song) => menuState.current && void play(index, song, false, menuState.current, 'Audio'),
    onRemoveFromPlaylist: canEdit ? (index, song) => menuState.current && void remove(song, index, menuState.current) : undefined,
    defaults: { showRemoveFromPlaylist: canEdit },
  })

  const remove = async (it: BaseItemDto, index: number, s: GridState) => {
    try {
      await removeFromPlaylist(api, id, entryIdFor(entries, it, index, s.sort.sort === 'Default'))
      refresh()
    } catch (err) {
      toast(errorText(t, err))
    }
  }

  const move = async (it: BaseItemDto, index: number, delta: -1 | 1, s: GridState) => {
    const row = document.querySelector<HTMLElement>(`[data-grid-index="${index + delta}"] [data-focusable]`)
    try {
      await moveInPlaylist(api, id, entryIdFor(entries, it, index, s.sort.sort === 'Default'), index + delta)
      refresh()
      // Focus follows the moved row (upstream moves focus one row up / down).
      row?.focus({ preventScroll: false })
    } catch (err) {
      toast(errorText(t, err))
    }
  }

  return (
    <FullHeightPage>
      <LibraryGrid
        displayId={id}
        item={item}
        recursive={false}
        pageFilter={NO_FILTER}
        initialSort={DEFAULT_SORT}
        defaultViewOptions={PLAYLIST_VIEW_OPTIONS}
        source={source}
        sortOptions={PLAYLIST_SORT_OPTIONS}
        filterOptions={DEFAULT_FILTER_OPTIONS}
        filterParentId={id}
        playEnabled
        onPlayAll={(s, shuffle) => void play(0, item, shuffle, s)}
        onPlayItem={(index, it, s) => void play(index, it, false, s)}
        title={item.Name ?? null}
        showTitle
        menuOptions={{ showGoTo: true, showStreamChoices: false }}
        menuOptionsFor={(_it, index, s) => (canEdit ? { removeFromPlaylist: { index, onRemove: (x, i) => void remove(x, i, s) } } : undefined)}
        menuFor={(it, index, s) => {
          if (it.Type !== 'Audio') return undefined
          const actions = musicMenu.cardActions(it, { index })
          return {
            ...actions,
            onContextMenu: (e) => {
              menuState.current = s
              actions.onContextMenu?.(e)
            },
            onMore: (anchor) => {
              menuState.current = s
              actions.onMore?.(anchor)
            },
          }
        }}
        renderListRow={(row) => (
          <PlaylistRow
            row={row}
            canEdit={canEdit}
            onMove={(it, delta) => void move(it, row.index, delta, row.state)}
          />
        )}
      />
      {playAs && (
        <Dialog open onClose={() => setPlayAs(null)} variant="basic" elevation={3} label={t('play_as_type')}>
          <div className={styles.playAs}>
            <p className={styles.playAsTitle}>{t('play_as_type')}</p>
            <div className={styles.playAsButtons}>
              {/* Upstream never closes this dialog on a choice (spec 08 BR-25); here it does. */}
              {(['Audio', 'Video'] as const).map((type) => (
                <TextButton
                  key={type}
                  onClick={() => {
                    const p = playAs
                    setPlayAs(null)
                    void play(p.index, p.target, p.shuffle, p.s, type)
                  }}
                >
                  {t(type === 'Audio' ? 'audio' : 'video')}
                </TextButton>
              ))}
            </div>
          </div>
        </Dialog>
      )}
      {musicMenu.element}
    </FullHeightPage>
  )
}

/** `PlaylistItem` (PlaylistDetails.kt:432-605). */
function PlaylistRow({
  row,
  canEdit,
  onMove,
}: {
  row: ListRowArgs
  canEdit: boolean
  onMove: (it: BaseItemDto, delta: -1 | 1) => void
}) {
  const { t, locale } = useTranslate()
  const now = useMinuteClock()
  const { item, index, dense, state } = row
  // MusicQueueMarker on songs: the one that is playing, the ones in the queue
  const songId = item?.Type === 'Audio' ? (item.Id ?? null) : null
  const isPlaying = useMusicQueue((q) => songId != null && q.entries[q.currentIndex]?.id === songId)
  const isQueued = useMusicQueue((q) => songId != null && q.entries.some((e) => e.id === songId))
  if (!item) return <div className={dense ? styles.rowPlaceholderDense : styles.rowPlaceholder} />
  const showIndex = state.sort.sort === 'Default'
  // Moving needs playlist positions: not offered while a filter hides rows.
  const canMove = canEdit && countFilters(state.filter, DEFAULT_FILTER_OPTIONS) === 0
  const audio = item.Type === 'Audio'
  const runMs = item.RunTimeTicks != null ? ticksToMs(item.RunTimeTicks) : null
  const duration = runMs != null ? (audio ? roundSecondsMs(runMs) : roundMinutesMs(runMs)) : null
  const played = item.UserData?.Played ?? false
  const favorite = item.UserData?.IsFavorite ?? false
  return (
    <div className={styles.row}>
      <ListItem
        className={styles.rowItem}
        dense={dense}
        href={row.href}
        onClick={row.onClick}
        onContextMenu={row.onContextMenu}
        leading={
          showIndex || favorite || isPlaying || isQueued ? (
            <span className={styles.leading}>
              {showIndex && <span className={styles.index}>{`${index + 1}.`}</span>}
              {audio && <MusicQueueMarker isPlaying={isPlaying} isQueued={isQueued} />}
              {/* FavoriteIndicator(): a 20sp heart in holo_red_light (ItemCardImage.kt:284-293) */}
              {favorite && <FaIcon name="heart" size={20} color="var(--fx-favorite-heart)" />}
            </span>
          ) : undefined
        }
        headline={<span dir="auto">{itemTitle(item) ?? ''}</span>}
        supporting={<span dir="auto">{itemSubtitle(t, item) ?? ''}</span>}
        trailing={
          duration != null ? (
            <span className={styles.trailing}>
              <span className={styles.durationCol}>
                <span>{formatDuration(t, duration)}</span>
                {!audio && !dense && <span className={styles.endsAt}>{t('ends_at', { p1: formatTimeOfDay(new Date(now + duration), locale) })}</span>}
              </span>
              {played && <WatchedBadge size={24} className={styles.watched} />}
            </span>
          ) : undefined
        }
      />
      <div className={styles.rowButtons}>
        {canMove && (
          <>
            <Button className={styles.smallButton} disabled={index === 0} label={t('web_move_up')} title={t('web_move_up')} onClick={() => onMove(item, -1)}>
              <FaIcon name="caret_up" />
            </Button>
            <Button className={styles.smallButton} disabled={row.isLast} label={t('web_move_down')} title={t('web_move_down')} onClick={() => onMove(item, 1)}>
              <FaIcon name="caret_down" />
            </Button>
          </>
        )}
        <Button className={styles.smallButton} label={t('more')} title={t('more')} onClick={(e) => row.openMenu(e.currentTarget)}>
          <FaIcon name="ellipsis_vertical" />
        </Button>
      </div>
    </div>
  )
}

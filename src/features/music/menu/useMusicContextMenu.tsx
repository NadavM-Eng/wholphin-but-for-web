import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '../../../api/session'
import { usePrefs } from '../../../stores/preferences'
import { ConfirmDialog, ContextMenu, contextMenuPoint, type CardActions, type MenuPoint } from '../../../ui'
import { getItemMenuHandlers } from '../../common/itemMenuHandlers'
import { itemTitle } from '../../common/itemText'
import { canDeleteItem, useItemActions } from '../../common/useItemActions'
import { useTranslate } from '../../common/useTranslate'
import { addToQueue, playItem, playNext } from '../service/musicService'
import { buildMusicMenu, type MusicMenuActions, type MusicMenuOptions } from './musicMenu'

type OpenOptions = Omit<MusicMenuOptions, 'canDelete'>
type OpenState = { item: BaseItemDto; point: MenuPoint | null; options: OpenOptions }

export type MusicPageMenuConfig = {
  /** The page's own item: deleting it goes back, deleting anything else refreshes the page (MU-6). */
  pageItemId?: string | null
  /** Page-specific Play (album songs: the album from that song). Default: play the pressed item. */
  onPlay?: (index: number, item: BaseItemDto) => void
  onRemoveFromPlaylist?: (index: number, item: BaseItemDto) => void
  defaults?: Partial<OpenOptions>
}

export type MusicContextMenu = {
  open: (item: BaseItemDto, point: MenuPoint | null, options?: Partial<OpenOptions>) => void
  /** Right-click / Menu key / long-press and the touch "more" button of a card or row. */
  cardActions: (item: BaseItemDto, options?: Partial<OpenOptions>) => Pick<CardActions, 'onContextMenu' | 'onMore' | 'moreLabel'>
  element: ReactNode
}

/**
 * The music long-press menu (`ContextMenu.ForMusic` + `ContextMenuDialog`) for album, artist, song and playlist
 * pages, built on the shared menu UI and item actions. The Delete entry keeps the menu open and asks first.
 */
export function useMusicContextMenu(config: MusicPageMenuConfig = {}): MusicContextMenu {
  const { t } = useTranslate()
  const navigate = useNavigate()
  const actions = useItemActions()
  const session = useSession()
  const manageMedia = usePrefs('manageMedia')
  const [state, setState] = useState<OpenState | null>(null)
  const [toDelete, setToDelete] = useState<BaseItemDto | null>(null)
  const { pageItemId, onPlay, onRemoveFromPlaylist } = config
  const defaultsKey = JSON.stringify(config.defaults ?? {})

  const open = useCallback(
    (item: BaseItemDto, point: MenuPoint | null, options?: Partial<OpenOptions>) =>
      setState({ item, point, options: { index: 0, ...(JSON.parse(defaultsKey) as Partial<OpenOptions>), ...options } }),
    [defaultsKey],
  )

  const cardActions = useCallback<MusicContextMenu['cardActions']>(
    (item, options) => ({
      onContextMenu: (e: MouseEvent<HTMLElement>) => {
        e.preventDefault()
        open(item, contextMenuPoint(e), options)
      },
      onMore: () => open(item, null, options),
      moreLabel: t('more'),
    }),
    [open, t],
  )

  const items = useMemo(() => {
    if (!state) return []
    const a: MusicMenuActions = {
      navigate: (p) => void navigate(p),
      // MU-5: upstream's album page plays the album at the pressed index even for a "More like this" card
      play: onPlay ?? ((_i, item) => void playItem(item)),
      playNext: (_i, item) => void playNext(item),
      addToQueue: (item) => void addToQueue(item),
      removeFromQueue: () => undefined,
      removeFromPlaylist: (i, item) => onRemoveFromPlaylist?.(i, item),
      addToPlaylist: (item) => getItemMenuHandlers().addToPlaylist(item),
      requestDelete: setToDelete,
      setFavorite: (item, v) => void actions.setFavorite(item, v),
    }
    return buildMusicMenu(
      state.item,
      { ...state.options, showRemoveFromPlaylist: state.options.showRemoveFromPlaylist && !!onRemoveFromPlaylist, canDelete: canDeleteItem(state.item, manageMedia, session?.userDto) },
      t,
      a,
    )
  }, [state, navigate, onPlay, onRemoveFromPlaylist, actions, manageMedia, session?.userDto, t])

  const element = (
    <>
      {state && <ContextMenu open title={itemTitle(state.item) ?? ''} items={items} point={state.point} onClose={() => setState(null)} />}
      {toDelete && (
        <ConfirmDialog
          open
          variant="delete"
          title={t('delete_item')}
          body={itemTitle(toDelete)}
          cancelLabel={t('cancel')}
          confirmLabel={t('confirm')}
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const item = toDelete
            setToDelete(null)
            setState(null)
            void actions.deleteItem(item).then(() => {
              if (pageItemId && item.Id === pageItemId) void navigate(-1)
            })
          }}
        />
      )}
    </>
  )

  return { open, cardActions, element }
}

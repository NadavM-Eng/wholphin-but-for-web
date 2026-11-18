import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '../../api/session'
import { usePrefs } from '../../stores/preferences'
import { ConfirmDialog, ContextMenu, DialogPopup, contextMenuPoint, type CardActions, type MenuPoint } from '../../ui'
// Media information / add to playlist / choose stream dialogs opened from the menu (installs their handlers).
import { ItemDialogsHost } from '../detail/common/ItemDialogsHost'
import { buildItemMenu, buildPlayWithMenu, type ItemMenuOptions } from './itemMenu'
import { getItemMenuHandlers } from './itemMenuHandlers'
import { itemTitle } from './itemText'
import { canDeleteItem, useItemActions } from './useItemActions'
import { useTranslate } from './useTranslate'

type OpenState = { item: BaseItemDto; point: MenuPoint | null; options: ItemMenuOptions }

export type ItemContextMenu = {
  /** Opens the menu for `item`; `point` = pointer position for a mouse right-click, null = centered dialog. */
  open: (item: BaseItemDto, point: MenuPoint | null, options?: ItemMenuOptions) => void
  /**
   * Card wiring: right-click / long-press / keyboard Menu key (`onContextMenu`) and the touch "more"
   * button (`onMore`). Spread into any UI kit card: `<BannerCard {...props} {...menu.cardActions(item)} />`.
   */
  cardActions: (item: BaseItemDto, options?: ItemMenuOptions) => Pick<CardActions, 'onContextMenu' | 'onMore' | 'moreLabel'>
  /** Render once in the page. */
  element: ReactNode
}

/**
 * The item long-press menu (upstream `ContextMenuDialog` for `ContextMenu.ForBaseItem`) with its delete
 * confirmation and "Play with" sub-menu. `defaults` apply to every open; per-open options override them.
 */
export function useItemContextMenu(defaults: ItemMenuOptions = {}): ItemContextMenu {
  const { t } = useTranslate()
  const navigate = useNavigate()
  const actions = useItemActions()
  const session = useSession()
  const manageMedia = usePrefs('manageMedia')
  const [state, setState] = useState<OpenState | null>(null)
  const [toDelete, setToDelete] = useState<{ item: BaseItemDto; onDelete?: (item: BaseItemDto) => void } | null>(null)
  const [playWith, setPlayWith] = useState<BaseItemDto | null>(null)
  const defaultsKey = JSON.stringify(defaults)

  const open = useCallback(
    (item: BaseItemDto, point: MenuPoint | null, options?: ItemMenuOptions) =>
      setState({ item, point, options: { ...(JSON.parse(defaultsKey) as ItemMenuOptions), ...options } }),
    [defaultsKey],
  )

  const cardActions = useCallback<ItemContextMenu['cardActions']>(
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

  const tr = t
  const items = useMemo(() => {
    if (!state) return []
    return buildItemMenu(state.item, state.options, {
      t: tr,
      navigate: (p) => void navigate(p),
      canDelete: canDeleteItem(state.item, manageMedia, session?.userDto),
      setPlayed: (i, v) => void actions.setPlayed(i, v),
      setFavorite: (i, v) => void actions.setFavorite(i, v),
      removeFromNextUp: (i) => void actions.removeFromNextUp(i),
      requestDelete: (item) => setToDelete({ item, onDelete: state.options.onDelete }),
      openPlayWith: setPlayWith,
      handlers: getItemMenuHandlers(),
      closeMenu: () => setState(null),
    })
  }, [state, tr, navigate, manageMedia, session?.userDto, actions])

  const element = (
    <>
      <ItemDialogsHost />
      {state && (
        <ContextMenu open title={itemTitle(state.item) ?? ''} items={items} point={state.point} onClose={() => setState(null)} />
      )}
      {toDelete && (
        <ConfirmDialog
          open
          variant="delete"
          title={t('delete_item')}
          body={itemTitle(toDelete.item)}
          cancelLabel={t('cancel')}
          confirmLabel={t('confirm')}
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const { item, onDelete } = toDelete
            setToDelete(null)
            // Close the menu too: the item is gone (and a detail page's onDelete navigates Back).
            setState(null)
            if (onDelete) onDelete(item)
            else void actions.deleteItem(item)
          }}
        />
      )}
      {playWith && (
        <DialogPopup
          open
          title={t('play_with')}
          elevation={3}
          items={buildPlayWithMenu(playWith, { t: tr, navigate: (p) => void navigate(p) })}
          onClose={() => setPlayWith(null)}
        />
      )}
    </>
  )

  return { open, cardActions, element }
}

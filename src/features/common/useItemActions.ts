// Favorite / watched / remove-from-next-up / delete (W/services/FavoriteWatchManager.kt,
// LatestNextUpService.removeFromNextUp, MediaManagementService) with optimistic cache updates.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, UserDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getUserDataApi } from '@jellyfin/sdk/lib/utils/api/user-data-api'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useApi, useSession } from '../../api/session'
import { toast } from '../../app/toast'
import { i18next } from '../../i18n'
import { invalidateDatePlayed } from './datePlayed'
import { addRemovedNextUp } from './displayPreferences'
import { invalidateItemDeps, patchItemInCaches, removeItemFromCaches, withUserData } from './itemCache'

/** `MediaManagementService.canDelete`: the "manage media" preference, the item's CanDelete, and for recordings the Live TV management policy. */
export function canDeleteItem(item: BaseItemDto, manageMedia: boolean, user: UserDto | null | undefined): boolean {
  if (!manageMedia || item.CanDelete !== true) return false
  return item.Type === 'Recording' ? user?.Policy?.EnableLiveTvManagement === true : true
}

function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return `${i18next.t('error')}: ${msg}`
}

export type ItemActions = {
  setFavorite: (item: BaseItemDto, favorite: boolean) => Promise<void>
  setPlayed: (item: BaseItemDto, played: boolean) => Promise<void>
  /** "Remove series from next up": mark the episode unplayed and record the series in display preferences. */
  removeFromNextUp: (item: BaseItemDto) => Promise<void>
  /** `DELETE /Items/{id}` (call only after the confirm dialog). */
  deleteItem: (item: BaseItemDto) => Promise<void>
}

function playedPatch(played: boolean) {
  // Marking played or unplayed resets the resume point on the server.
  return played
    ? { Played: true, PlaybackPositionTicks: 0, PlayedPercentage: 0, UnplayedItemCount: 0 }
    : { Played: false, PlaybackPositionTicks: 0, PlayedPercentage: 0 }
}

export function createItemActions(api: Api, qc: QueryClient, userId: string): ItemActions {
  const userData = () => getUserDataApi(api)

  const setFavorite: ItemActions['setFavorite'] = async (item, favorite) => {
    const id = item.Id
    if (!id) return
    const before = item.UserData?.IsFavorite ?? false
    patchItemInCaches(qc, id, (i) => withUserData(i, { IsFavorite: favorite }))
    try {
      const res = favorite
        ? await userData().markFavoriteItem({ itemId: id, userId })
        : await userData().unmarkFavoriteItem({ itemId: id, userId })
      patchItemInCaches(qc, id, (i) => withUserData(i, res.data))
      await invalidateItemDeps(qc, ['favorite'])
    } catch (err) {
      patchItemInCaches(qc, id, (i) => withUserData(i, { IsFavorite: before }))
      toast(errorText(err))
    }
  }

  const setPlayed: ItemActions['setPlayed'] = async (item, played) => {
    const id = item.Id
    if (!id) return
    const before = { ...item.UserData }
    invalidateDatePlayed(item)
    patchItemInCaches(qc, id, (i) => withUserData(i, playedPatch(played)))
    try {
      const res = played ? await userData().markPlayedItem({ itemId: id, userId }) : await userData().markUnplayedItem({ itemId: id, userId })
      patchItemInCaches(qc, id, (i) => withUserData(i, res.data))
      await invalidateItemDeps(qc, ['played'])
    } catch (err) {
      patchItemInCaches(qc, id, (i) => withUserData(i, before))
      toast(errorText(err))
    }
  }

  const removeFromNextUp: ItemActions['removeFromNextUp'] = async (item) => {
    const id = item.Id
    if (!id || item.Type !== 'Episode') return
    invalidateDatePlayed(item)
    try {
      await userData().markUnplayedItem({ itemId: id, userId })
      if (item.SeriesId) await addRemovedNextUp(api, userId, item.SeriesId)
      // Only the next-up lists drop it; the episode itself still exists (Recently added, seasons...).
      removeItemFromCaches(qc, id, 'nextUp')
      await invalidateItemDeps(qc, ['played', 'nextUp'])
    } catch (err) {
      toast(errorText(err))
      await invalidateItemDeps(qc, ['played', 'nextUp'])
    }
  }

  const deleteItem: ItemActions['deleteItem'] = async (item) => {
    const id = item.Id
    if (!id) return
    try {
      await getLibraryApi(api).deleteItem({ itemId: id })
      removeItemFromCaches(qc, id)
      await invalidateItemDeps(qc, ['deleted'])
    } catch (err) {
      toast(errorText(err))
    }
  }

  return { setFavorite, setPlayed, removeFromNextUp, deleteItem }
}

/** Item mutations for the signed-in user. Every list tagged with `itemQueryMeta` stays in sync. */
export function useItemActions(): ItemActions {
  const api = useApi()
  const qc = useQueryClient()
  const userId = useSession()?.user.id ?? ''
  return useMemo(() => createItemActions(api, qc, userId), [api, qc, userId])
}

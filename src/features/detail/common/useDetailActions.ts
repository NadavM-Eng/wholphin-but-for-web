// Detail-page actions on the page's own item: delete-and-go-back (MediaManagementService.deleteItem +
// `navigationManager.goBack()`), and the delete permission (`canDelete` = manage-media pref + CanDelete).
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useApi, useSession } from '../../../api/session'
import { useGoBack } from '../../../app/shell'
import { toast } from '../../../app/toast'
import { usePrefs } from '../../../stores/preferences'
import { invalidateItemDeps, removeItemFromCaches } from '../../common/itemCache'
import { canDeleteItem } from '../../common/useItemActions'
import { useTranslate } from '../../common/useTranslate'

/** Whether the page shows Delete for `item` (MediaManagementService.canDelete). */
export function useCanDelete(item: BaseItemDto | undefined): boolean {
  const manageMedia = usePrefs('manageMedia')
  const user = useSession()?.userDto
  return !!item && canDeleteItem(item, manageMedia, user)
}

/**
 * `deleteItem(context, mediaManagementService, item) { goBack() }`: `DELETE /Items/{id}`, toast "Deleted"
 * and Back on success, toast "Error deleting item: …" on failure.
 */
export function useDeleteAndGoBack(): (item: BaseItemDto) => Promise<void> {
  const api = useApi()
  const qc = useQueryClient()
  const goBack = useGoBack()
  const { t } = useTranslate()
  return useCallback(
    async (item: BaseItemDto) => {
      const id = item.Id
      if (!id) return
      try {
        await getLibraryApi(api).deleteItem({ itemId: id })
      } catch (err) {
        toast(t('web_error_deleting_item', { p1: err instanceof Error ? err.message : String(err) }))
        return
      }
      toast(t('web_deleted'))
      removeItemFromCaches(qc, id)
      void invalidateItemDeps(qc, ['deleted'])
      goBack()
    },
    [api, qc, goBack, t],
  )
}

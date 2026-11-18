// The screensaver's item list (ScreensaverService.createPager / createItemFlow, W/services/ScreensaverService.kt).
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, BaseItemKind, ImageType } from '@jellyfin/sdk/lib/generated-client/models'
import type { LibraryApiGetItemsRequest } from '@jellyfin/sdk/lib/generated-client/api/library-api'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { buildItemImageUrl, getItemImageUrl } from '../../api/images'
import { formatDate } from '../../lib/format'
import { resizedPhotoUrl } from './photoUrls'

export const SCREENSAVER_PAGE_SIZE = 100

/**
 * `createPager()`: random order, recursive, the chosen item types, only items with a backdrop unless photos are
 * included, and the parental-rating cap (`maxAgeFilter` >= 0 -> `maxOfficialRating=<age>&hasParentalRating=true`).
 */
export function screensaverRequest(p: { userId: string; itemTypes: readonly string[]; maxAge: number }): LibraryApiGetItemsRequest {
  const kinds = p.itemTypes as BaseItemKind[]
  const maxAge = p.maxAge >= 0 ? p.maxAge : null
  const imageTypes: ImageType[] | undefined = kinds.includes('Photo') ? undefined : ['Backdrop']
  return {
    userId: p.userId,
    recursive: true,
    includeItemTypes: kinds,
    imageTypes,
    sortBy: ['Random'],
    maxOfficialRating: maxAge != null ? String(maxAge) : undefined,
    hasParentalRating: maxAge != null ? true : undefined,
  }
}

export interface ScreensaverItemView {
  id: string
  imageUrl: string
  logoUrl: string | null
  title: string
}

/**
 * One emitted item: a photo shows itself (resized for the screen on the web) with its date as the title; other
 * items show their backdrop with the logo, or the title when there is no logo.
 */
export function screensaverView(
  base: string,
  item: BaseItemDto,
  o: { edge: number; locale?: string },
): ScreensaverItemView | null {
  if (!item.Id) return null
  const isPhoto = item.Type === 'Photo'
  const imageUrl = isPhoto
    ? resizedPhotoUrl(base, item, o.edge)
    : (() => {
        const tag = item.BackdropImageTags?.[0]
        if (!tag) return getItemImageUrl(base, item, 'Backdrop', { fillWidth: o.edge })
        return buildItemImageUrl(base, item.Id, 'Backdrop', { tag, maxWidth: o.edge })
      })()
  if (!imageUrl) return null
  const title = isPhoto ? (formatDate(item.PremiereDate, o.locale) ?? '') : ((item.Type === 'Episode' ? item.SeriesName : item.Name) ?? item.Name ?? '')
  // upstream always asks for a logo and falls back to the title when it fails; skip the request without a tag
  const hasLogo = !!item.ImageTags?.Logo || (!!item.ParentLogoImageTag && (item.Type === 'Episode' || item.Type === 'Season'))
  const logoUrl = !isPhoto && hasLogo ? getItemImageUrl(base, item, 'Logo', { fillHeight: 240 }) : null
  return { id: item.Id, imageUrl, logoUrl, title }
}

export async function fetchScreensaverPage(
  api: Api,
  req: LibraryApiGetItemsRequest,
  page: number,
  signal: AbortSignal,
): Promise<{ items: BaseItemDto[]; total: number }> {
  const res = await getLibraryApi(api).getItems(
    { ...req, startIndex: page * SCREENSAVER_PAGE_SIZE, limit: SCREENSAVER_PAGE_SIZE, enableTotalRecordCount: page === 0, fields: ['PrimaryImageAspectRatio'] },
    { signal },
  )
  return { items: res.data.Items ?? [], total: res.data.TotalRecordCount ?? res.data.Items?.length ?? 0 }
}

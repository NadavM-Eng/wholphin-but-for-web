import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getItemImageUrl } from '../../api/images'

/**
 * `rememberLogoUrl` (W/ui/components/TitleOrLogo.kt:90-110): the series logo for an episode/season that
 * has a parent logo, else the item's own Logo when it has one, else null (the title text shows).
 * `fillHeight` (device px) caps the download to the displayed size (upstream lets Coil downsample).
 */
export function logoUrl(baseUrl: string | null | undefined, item: BaseItemDto | null | undefined, fillHeight?: number | null): string | null {
  if (!item) return null
  const size = { fillHeight }
  if ((item.Type === 'Episode' || item.Type === 'Season') && item.SeriesId && item.ParentLogoImageTag) {
    return getItemImageUrl(baseUrl, item, 'Logo', size)
  }
  if (item.ImageTags?.Logo) return getItemImageUrl(baseUrl, { ...item, SeriesId: null }, 'Logo', size)
  return null
}

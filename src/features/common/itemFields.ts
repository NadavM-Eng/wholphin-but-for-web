// `fields=` sets (W/ui/UiConstants.kt:47-92, spec 03 §0.1).
import type { ItemFields } from '@jellyfin/sdk/lib/generated-client/models'

export const SLIM_ITEM_FIELDS: ItemFields[] = ['Overview', 'SortName', 'MediaSourceCount', 'CanDelete']
export const ITEM_ROW_FIELDS: ItemFields[] = [...SLIM_ITEM_FIELDS, 'PrimaryImageAspectRatio']
export const DETAIL_ITEM_FIELDS: ItemFields[] = [
  'Overview',
  'Trickplay',
  'SortName',
  'Chapters',
  'MediaSources',
  'MediaSourceCount',
  'CanDelete',
  'PrimaryImageAspectRatio',
]
export const HOME_ITEM_FIELDS: ItemFields[] = ['Overview', 'CanDelete']
export const HOME_ITEM_FIELDS_BOX_SETS: ItemFields[] = [...HOME_ITEM_FIELDS, 'ChildCount']
export const PHOTO_ITEM_FIELDS: ItemFields[] = [...DETAIL_ITEM_FIELDS, 'Width', 'Height']
export const PROGRAM_ITEM_FIELDS: ItemFields[] = [...DETAIL_ITEM_FIELDS, 'ChannelInfo']

/** `DEFAULT_PAGE_SIZE` (UiConstants.kt:45). */
export const DEFAULT_PAGE_SIZE = 100

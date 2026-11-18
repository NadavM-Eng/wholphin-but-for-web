// Shared view-option enums (upstream PrefContentScale, ui/AspectRatio, ViewOptionImageType) with the
// exact serialized names, so JSON written by the Android app (home settings) reads back unchanged.
import type { ImageType } from '@jellyfin/sdk/lib/generated-client/models'
import type { ImageFit } from '../../ui'

/** `PrefContentScale` (note the mixed-case `Fill_WIDTH`, as serialized upstream). */
export type ContentScale = 'FIT' | 'NONE' | 'CROP' | 'FILL' | 'Fill_WIDTH' | 'FILL_HEIGHT'
export const CONTENT_SCALES: readonly ContentScale[] = ['FIT', 'NONE', 'CROP', 'FILL', 'Fill_WIDTH', 'FILL_HEIGHT']

/** `AspectRatio` (UiConstants.kt:103-119). */
export type AspectRatioName = 'TALL' | 'WIDE' | 'FOUR_THREE' | 'SQUARE'
export const ASPECT_RATIOS: readonly AspectRatioName[] = ['TALL', 'WIDE', 'FOUR_THREE', 'SQUARE']

/** `ViewOptionImageType`. */
export type ViewImageType = 'PRIMARY' | 'THUMB'
export const VIEW_IMAGE_TYPES: readonly ViewImageType[] = ['PRIMARY', 'THUMB']

export const ASPECT_RATIO_VALUE: Record<AspectRatioName, number> = {
  TALL: 2 / 3,
  WIDE: 16 / 9,
  FOUR_THREE: 4 / 3,
  SQUARE: 1,
}

/** Card heights (`Cards`, UiConstants.kt:93-101). */
export const CARD_HEIGHT = { poster: 172, episode: 128, liveTv: 96 } as const

export function aspectValue(name: AspectRatioName | null | undefined): number {
  return ASPECT_RATIO_VALUE[name ?? 'TALL'] ?? 2 / 3
}

export function imageTypeOf(t: ViewImageType | null | undefined): ImageType {
  return t === 'THUMB' ? 'Thumb' : 'Primary'
}

/**
 * Compose ContentScale -> CSS object-fit. FillWidth / FillHeight scale to one axis and crop the other;
 * `cover` is the closest CSS equivalent for a card whose box is set by the row (they only differ when
 * the image is smaller than the box on the other axis).
 */
export function contentScaleFit(s: ContentScale | null | undefined): ImageFit {
  switch (s) {
    case 'FIT':
      return 'contain'
    case 'NONE':
      return 'none'
    case 'CROP':
    case 'Fill_WIDTH':
    case 'FILL_HEIGHT':
      return 'cover'
    default:
      return 'fill'
  }
}

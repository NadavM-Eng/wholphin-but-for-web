// W/services/ExtrasService.kt + W/data/ExtrasItem.kt: special features grouped by ExtraType. Pure.
import type { BaseItemDto, ExtraType } from '@jellyfin/sdk/lib/generated-client/models'
import type { Translate } from '../../../lib/format'

export type ExtrasItem =
  | {
      kind: 'single'
      type: ExtraType
      item: BaseItemDto
      title: string
      subtitle: string | null
    }
  | {
      kind: 'group'
      type: ExtraType
      items: BaseItemDto[]
      title: string
      subtitle: string
      played: boolean
      /** The random member whose Primary image the card shows (upstream picks `items.random()`). */
      imageItem: BaseItemDto
    }

const ORDER: Record<string, number> = {
  Trailer: 0,
  Featurette: 1,
  Short: 2,
  Clip: 3,
  Scene: 4,
  Sample: 5,
  DeletedScene: 6,
  Interview: 7,
  BehindTheScenes: 8,
  ThemeSong: 9,
  ThemeVideo: 10,
  Unknown: 11,
}

/** Plural resource base (`ExtraType.pluralRes`); `${base}_one` is the singular. */
const PLURAL: Record<string, string> = {
  Unknown: 'other_extras',
  Clip: 'clips',
  Trailer: 'trailers',
  BehindTheScenes: 'behind_the_scenes',
  DeletedScene: 'deleted_scenes',
  Interview: 'interviews',
  Scene: 'scenes',
  Sample: 'samples',
  ThemeSong: 'theme_songs',
  ThemeVideo: 'theme_videos',
  Featurette: 'featurettes',
  Short: 'shorts',
}

/** Group title (`ExtraType.stringRes`). */
const TITLE: Record<string, string> = {
  Unknown: 'other_extras_title',
  Clip: 'clips_title',
  Trailer: 'trailers_title',
  BehindTheScenes: 'behind_the_scenes_title',
  DeletedScene: 'deleted_scenes_title',
  Interview: 'interviews_title',
  Scene: 'scenes_title',
  Sample: 'samples_title',
  ThemeSong: 'theme_songs_title',
  ThemeVideo: 'theme_videos_title',
  Featurette: 'featurettes_title',
  Short: 'shorts_title',
}

export const extraTypeTitleKey = (type: ExtraType) => TITLE[type] ?? TITLE.Unknown

/** `ExtrasService.getExtras`: drops theme songs/videos and trailers, one card per type. */
export function groupExtras(t: Translate, features: readonly BaseItemDto[], random: () => number = Math.random): ExtrasItem[] {
  const groups = new Map<ExtraType, BaseItemDto[]>()
  for (const f of features) {
    if (f.ExtraType === 'ThemeSong' || f.ExtraType === 'ThemeVideo' || f.ExtraType === 'Trailer') continue
    const type: ExtraType = f.ExtraType ?? 'Unknown'
    const g = groups.get(type)
    if (g) g.push(f)
    else groups.set(type, [f])
  }
  const out: ExtrasItem[] = []
  for (const [type, items] of groups) {
    const singular = t(`${PLURAL[type] ?? PLURAL.Unknown}`, { count: 1 })
    if (items.length === 1) {
      const item = items[0]
      const name = item.Name && item.Name.trim() !== '' ? item.Name : null
      out.push({ kind: 'single', type, item, title: name ?? singular, subtitle: name ? singular : null })
    } else {
      out.push({
        kind: 'group',
        type,
        items,
        title: t(extraTypeTitleKey(type)),
        subtitle: t('items', { count: items.length }),
        played: items.every((i) => i.UserData?.Played === true),
        imageItem: items[Math.floor(random() * items.length)] ?? items[0],
      })
    }
  }
  return out.sort((a, b) => (ORDER[a.type] ?? 11) - (ORDER[b.type] ?? 11))
}

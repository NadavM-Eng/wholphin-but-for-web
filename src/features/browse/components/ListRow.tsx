import type { BaseItemDto, CollectionType } from '@jellyfin/sdk/lib/generated-client/models'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { formatRuntime } from '../../../lib/format'
import { FaIcon, ListItem, WatchedBadge } from '../../../ui'
import { itemSubtitle, itemTitle } from '../../common/itemText'
import { useTranslate } from '../../common/useTranslate'
import styles from './ListRow.module.css'

type Props = {
  item: BaseItemDto | undefined
  dense: boolean
  collectionType: CollectionType | null | undefined
  href?: string
  onClick?: (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void
  onContextMenu?: (e: MouseEvent<HTMLElement>) => void
}

const Heart = () => (
  <span className={styles.heart} aria-hidden>
    <FaIcon name="heart" />
  </span>
)

/**
 * `CollectionFolderListItem` (W/ui/components/CollectionFolderList.kt:215-500): a tv ListItem at
 * surface+1dp @50%, focus scale 1.0. Rows by library type: movies (runtime + watched check), TV
 * (unplayed count or watched check), music albums, everything else (runtime). A favorite gets a heart.
 */
export function ListRow({ item, dense, collectionType, href, onClick, onContextMenu }: Props) {
  const { t } = useTranslate()
  const title = itemTitle(item) ?? ''
  const subtitle = item ? itemSubtitle(t, item) : null
  const year = item?.ProductionYear ?? null
  const runtime = formatRuntime(t, item?.RunTimeTicks) ?? ''
  const played = item?.UserData?.Played === true
  let headline = title
  let supporting: ReactNode = subtitle
  let overline: ReactNode = undefined
  let trailing: ReactNode = runtime
  switch (collectionType) {
    case 'movies':
      if (dense && item && itemTitle(item) && year != null) headline = `${title} (${year})`
      supporting = dense ? undefined : (subtitle ?? '')
      trailing = (
        <span className={styles.trailing}>
          {runtime}
          {played && <WatchedBadge />}
        </span>
      )
      break
    case 'tvshows': {
      if (dense && item) headline = `${title} (${subtitle ?? ''})`
      supporting = dense ? undefined : (subtitle ?? '')
      const unplayed = item?.UserData?.UnplayedItemCount ?? 0
      trailing = unplayed > 0 ? String(unplayed) : played ? <WatchedBadge /> : undefined
      break
    }
    case 'music': {
      if (dense && item && itemTitle(item) && year != null) headline = `${title} (${year})`
      const sub = item?.Type === 'MusicAlbum' ? (year != null ? String(year) : null) : subtitle
      supporting = !dense && sub != null ? sub : undefined
      overline = !dense && item?.AlbumArtist ? item.AlbumArtist : undefined
      trailing = item?.Type === 'MusicAlbum' ? runtime : undefined
      break
    }
    default:
      supporting = subtitle ?? undefined
  }
  return (
    <ListItem
      className={styles.row}
      dense={dense}
      noScale
      href={href}
      onClick={onClick}
      onContextMenu={onContextMenu}
      leading={item?.UserData?.IsFavorite ? <Heart /> : undefined}
      headline={<span dir="auto">{headline}</span>}
      overline={overline}
      supporting={supporting || undefined}
      trailing={trailing === '' ? undefined : trailing}
    />
  )
}

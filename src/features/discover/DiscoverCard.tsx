import { useTranslation } from 'react-i18next'
import { cardAvailability, yearOfDate, type DiscoverItem } from '../../api/seerr'
import { DiscoverItemCard } from '../../ui'
import { isHoverPointer, useHoverIntent } from '../common/hoverIntent'
import { availabilityLabel, plainT } from './seerrText'
import { useSpaLink } from './useSpaLink'

export type DiscoverCardProps = {
  item: DiscoverItem
  href: string
  /** Hover / keyboard focus (updates the page header and backdrop). */
  onActive?: (item: DiscoverItem) => void
  width?: number | 'fill'
  showOverlay?: boolean
  index?: number
  /** Stable key for focus restore on Back (`data-focus-key`, see app/shell/useFocusRestore). */
  focusKey?: string
}

const TYPE_LABEL: Record<DiscoverItem['type'], string | null> = {
  movie: 'movies',
  tv: 'tv_shows',
  person: 'people',
  unknown: null,
}

/** `DiscoverItemCard` for a Seerr item: type chip (`movies`/`tv_shows`/`people` plural, 1) and availability badge. */
export function DiscoverCard({ item, href, onActive, width, showOverlay = true, index, focusKey }: DiscoverCardProps) {
  const { t } = useTranslation()
  const link = useSpaLink()
  const typeKey = TYPE_LABEL[item.type]
  const year = yearOfDate(item.releaseDate)
  // Mouse hover takes the header and backdrop only after the shared intent delay; keyboard focus is immediate.
  const hover = useHoverIntent<string>()
  return (
    <div
      dir="auto"
      onFocus={onActive ? () => onActive(item) : undefined}
      onPointerEnter={onActive ? (e) => isHoverPointer(e) && hover.over('card', () => onActive(item)) : undefined}
      onPointerLeave={onActive ? hover.leave : undefined}
      style={width === 'fill' ? { width: '100%' } : undefined}
    >
      <DiscoverItemCard
        href={href}
        onClick={link(href)}
        title={item.title}
        subtitle={year != null ? String(year) : ''}
        posterSrc={item.posterUrl}
        mediaType={item.type}
        typeLabel={typeKey ? t(typeKey, { count: 1 }) : null}
        availability={cardAvailability(item.availability)}
        availabilityLabel={availabilityLabel(item.availability, plainT(t))}
        showOverlay={showOverlay}
        width={width}
        surfaceProps={{
          ...(index != null ? { 'data-index': index } : {}),
          'data-focus-key': focusKey ?? `discover:${item.type}:${item.id}:${index ?? 0}`,
        }}
      />
    </div>
  )
}

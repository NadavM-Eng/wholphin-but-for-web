import type { BaseItemDto, BaseItemPerson } from '@jellyfin/sdk/lib/generated-client/models'
import { useState } from 'react'
import { getPersonImageUrl, imagePx } from '../../../api/images'
import { itemDestination, useNav } from '../../../app/nav'
import { ContextMenu, FaIcon, ItemRow, MaterialIcon, PersonCard, contextMenuPoint, type MenuPoint } from '../../../ui'
import { useCardContext } from '../../common/cardAdapters'
import { useLinkClick } from '../../common/links'
import { useItemActions } from '../../common/useItemActions'
import { useTranslate } from '../../common/useTranslate'
import { personRole } from './detailText'

/** `personRowCardWidth`. */
const PERSON_WIDTH = 108
/** PersonRow.kt: LazyRow contentPadding 8dp, 16dp between cards (ItemRow's default gap). */
const CONTENT_PADDING = 8

/**
 * Upstream `PersonRow` (W/ui/cards/PersonRow.kt): "People", circular 108dp cards in server order, role text
 * from `personRole`. Long-press (right-click / Menu key / ⋮) opens the person menu: Go To, Favorite.
 */
export function PeopleRow({
  people,
  favorites,
  restoreKey,
  title,
  withMenu = true,
  focusPrefix = 'people',
}: {
  people: BaseItemPerson[]
  favorites: Record<string, boolean> | undefined
  restoreKey: string
  /** Row title (default "People"; the series overview uses "Cast & Crew" and "Guest stars"). */
  title?: string
  /** The person long-press menu (the series overview rows have none). */
  withMenu?: boolean
  /** Prefix of the cards' focus keys (unique per row on the page). */
  focusPrefix?: string
}) {
  const { t } = useTranslate()
  const ctx = useCardContext()
  const linkClick = useLinkClick()
  const go = useNav()
  const actions = useItemActions()
  const [menu, setMenu] = useState<{ person: BaseItemPerson; point: MenuPoint | null } | null>(null)
  if (people.length === 0) return null
  // The 108dp square the circle shows, in device pixels (bucketed so rows share cached files).
  const imgPx = imagePx(PERSON_WIDTH)
  const fav = (p: BaseItemPerson) => favorites?.[p.Id ?? ''] ?? false
  return (
    <>
      <ItemRow
        title={title ?? t('people_title')}
        count={people.length}
        itemWidth={PERSON_WIDTH}
        contentPadding={CONTENT_PADDING}
        restoreKey={restoreKey}
        previousLabel={t('web_previous')}
        nextLabel={t('web_next')}
        getItemKey={(i) => `${people[i].Id}:${i}`}
        renderItem={(i) => {
          const p = people[i]
          const href = itemDestination({ Id: p.Id ?? '', Type: 'Person' })
          return (
            <div data-focus-key={`${focusPrefix}:${i}`}>
              <PersonCard
                name={p.Name}
                role={personRole(t, p.Role, p.Type)}
                imageSrc={p.Id && p.PrimaryImageTag ? getPersonImageUrl(ctx.baseUrl, { Id: p.Id, PrimaryImageTag: p.PrimaryImageTag }, { fillWidth: imgPx, fillHeight: imgPx }) : null}
                width={PERSON_WIDTH}
                href={href}
                onClick={linkClick(href)}
                onContextMenu={
                  withMenu
                    ? (e) => {
                        e.preventDefault()
                        setMenu({ person: p, point: contextMenuPoint(e) })
                      }
                    : undefined
                }
                onMore={withMenu ? () => setMenu({ person: p, point: null }) : undefined}
                moreLabel={t('more')}
              />
            </div>
          )
        }}
      />
      {menu && (
        <ContextMenu
          open
          title={menu.person.Name ?? ''}
          point={menu.point}
          onClose={() => setMenu(null)}
          items={[
            { key: 'goTo', headline: t('go_to'), leading: <MaterialIcon name="arrow_forward" />, onSelect: () => go.item(menu.person.Id ?? '') },
            {
              key: 'favorite',
              headline: t(fav(menu.person) ? 'remove_favorite' : 'add_favorite'),
              leading: <FaIcon name="heart" />,
              leadingColor: fav(menu.person) ? 'var(--fx-favorite-active)' : undefined,
              onSelect: () => void actions.setFavorite({ Id: menu.person.Id, UserData: { IsFavorite: fav(menu.person) } } as BaseItemDto, !fav(menu.person)),
            },
          ]}
        />
      )}
    </>
  )
}

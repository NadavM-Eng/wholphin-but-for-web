import { useTranslation } from 'react-i18next'
import type { DiscoverItem } from '../../api/seerr'
import { ItemRow, PersonCard } from '../../ui'
import { discoveredItemHref } from './links'
import { useSpaLink } from './useSpaLink'

/** `DiscoverPersonRow`: "People", cast then crew, 108dp circle cards; always opens the Seerr person page. */
export function DiscoverPeopleRow({ people }: { people: DiscoverItem[] }) {
  const { t } = useTranslation()
  const link = useSpaLink()
  if (people.length === 0) return null
  return (
    <ItemRow
      title={t('people_title')}
      count={people.length}
      itemWidth={108}
      previousLabel={t('web_previous')}
      nextLabel={t('web_next')}
      getItemKey={(i) => `${people[i].id}-${i}`}
      renderItem={(i) => (
        <div dir="auto">
          <PersonCard
            name={people[i].title}
            role={people[i].subtitle}
            imageSrc={people[i].posterUrl}
            href={discoveredItemHref(people[i])}
            onClick={link(discoveredItemHref(people[i]))}
          />
        </div>
      )}
    />
  )
}

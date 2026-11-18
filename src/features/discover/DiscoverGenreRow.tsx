import type { UseQueryResult } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { DiscoverGenre } from '../../api/seerr'
import { ErrorMessage, GenreCard, ItemRow } from '../../ui'
import { isHoverPointer, useHoverIntent } from '../common/hoverIntent'
import styles from './DiscoverRow.module.css'
import { useSpaLink } from './useSpaLink'

export type DiscoverGenreRowProps = {
  title: string
  query: Pick<UseQueryResult<DiscoverGenre[]>, 'data' | 'error' | 'isPending' | 'isError'>
  hrefOf: (genre: DiscoverGenre) => string
  onActive?: (genre: DiscoverGenre, index: number) => void
  restoreKey?: string
}

/** Genre-card height `Cards.heightEpisode` (128dp), 16:9. */
const CARD_HEIGHT = 128

/** Upstream `DiscoverGenreRow`: colored genre cards over a random backdrop of the genre. */
export function DiscoverGenreRow({ title, query, hrefOf, onActive, restoreKey }: DiscoverGenreRowProps) {
  const { t } = useTranslation()
  const link = useSpaLink()
  // Mouse hover takes the header and backdrop only after the shared intent delay; keyboard focus is immediate.
  const hover = useHoverIntent<number>()
  if (query.isError) {
    return <ErrorMessage title={t('web_seerr_error_occurred')} message={title} detail={query.error?.message} />
  }
  if (query.isPending) {
    return (
      <section className={styles.loading} aria-busy>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.loadingText}>{t('loading')}</p>
      </section>
    )
  }
  const genres = query.data ?? []
  const width = (CARD_HEIGHT * 16) / 9
  return (
    <ItemRow
      title={title}
      count={genres.length}
      itemWidth={width}
      restoreKey={restoreKey}
      previousLabel={t('web_previous')}
      nextLabel={t('web_next')}
      getItemKey={(i) => genres[i].id}
      renderItem={(i) => (
        <div
          dir="auto"
          onFocus={onActive ? () => onActive(genres[i], i) : undefined}
          onPointerEnter={onActive ? (e) => isHoverPointer(e) && hover.over(i, () => onActive(genres[i], i)) : undefined}
          onPointerLeave={onActive ? hover.leave : undefined}
        >
          <GenreCard
            id={String(genres[i].id)}
            name={genres[i].name}
            imageSrc={genres[i].imageUrl}
            width={width}
            href={hrefOf(genres[i])}
            onClick={link(hrefOf(genres[i]))}
            surfaceProps={{ 'data-index': i }}
          />
        </div>
      )}
    />
  )
}

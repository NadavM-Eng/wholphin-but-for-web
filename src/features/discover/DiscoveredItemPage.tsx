import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { DiscoverBackdrop } from './DiscoverBackdrop'
import styles from './DiscoverDetails.module.css'
import { DiscoverMovieDetails } from './DiscoverMovieDetails'
import { DiscoverPersonPage } from './DiscoverPersonPage'
import { DiscoverSeriesDetails } from './DiscoverSeriesDetails'
import { SeerrGate } from './SeerrGate'

/**
 * `Destination.DiscoveredItem(item, startIndex)`: /discover/:mediaType/:tmdbId dispatches on the type
 * (movie, tv, person; anything else shows "Unknown discover type"). Person pages take `?name=&start=`.
 */
export default function DiscoveredItemPage() {
  const { t } = useTranslation()
  const { mediaType, tmdbId } = useParams()
  const [params] = useSearchParams()
  const id = Number(tmdbId)
  const valid = Number.isInteger(id) && id > 0
  let content
  if (!valid) content = <p className={styles.unknown}>{t('web_seerr_unknown_type')}</p>
  else if (mediaType === 'movie') content = <DiscoverMovieDetails key={id} id={id} />
  else if (mediaType === 'tv') content = <DiscoverSeriesDetails key={id} id={id} />
  else if (mediaType === 'person')
    content = (
      <DiscoverPersonPage key={id} id={id} name={params.get('name')} startIndex={Math.max(0, Number(params.get('start')) || 0)} />
    )
  else content = <p className={styles.unknown}>{t('web_seerr_unknown_type')}</p>
  return (
    <div>
      <DiscoverBackdrop />
      <SeerrGate>{content}</SeerrGate>
    </div>
  )
}

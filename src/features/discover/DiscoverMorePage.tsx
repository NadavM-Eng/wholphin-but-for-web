import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { decodeFilter, REQUEST_TYPE_TITLE, requestTypeFromSlug } from '../../api/seerr'
import { ErrorMessage } from '../../ui'
import { DiscoverBackdrop } from './DiscoverBackdrop'
import { clearDiscoverBackdrop } from './backdropStore'
import { DiscoverGrid } from './DiscoverGrid'
import styles from './DiscoverPage.module.css'
import { SeerrGate } from './SeerrGate'

/**
 * `Destination.DiscoverMoreResult(type, startIndex, initialFilter, titleOverride)`: the full grid behind a
 * Discover row's "View more" or a genre card. `?start=` (default 0 here; rows link with 20), `?f=` the
 * fixed filter, `?title=` the genre title.
 */
export default function DiscoverMorePage() {
  const { t } = useTranslation()
  const { type: slug } = useParams()
  const [params] = useSearchParams()
  const type = requestTypeFromSlug(slug)
  const f = params.get('f')
  const filter = useMemo(() => decodeFilter(f), [f])
  const start = Math.max(0, Number(params.get('start')) || 0)
  const title = params.get('title') || (type ? t(REQUEST_TYPE_TITLE[type]) : '')
  useEffect(() => clearDiscoverBackdrop(), [])

  return (
    <div className={styles.page}>
      <DiscoverBackdrop />
      <SeerrGate>
        <div className={styles.content}>
          {type ? (
            <DiscoverGrid
              key={`${slug}-${f ?? ''}`}
              type={type}
              initialFilter={filter}
              title={title}
              startIndex={start}
              stateKey={`more-${slug}`}
            />
          ) : (
            <ErrorMessage title={t('web_seerr_unknown_type')} detail={slug} />
          )}
        </div>
      </SeerrGate>
    </div>
  )
}

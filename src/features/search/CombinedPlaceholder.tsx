import type { Translate } from '../../lib/format'
import { LoadingRow } from '../../ui'
import styles from './SearchPage.module.css'
import type { SearchResult } from './useSearchResults'

/** `SearchResultPlaceholder` titled "Results" (16dp padding): searching, error text or "No results". */
export function CombinedPlaceholder({ t, result }: { t: Translate; result: SearchResult<unknown> }) {
  const message = result.status === 'searching' ? t('searching') : result.status === 'error' ? result.message : t('no_results')
  return <LoadingRow className={styles.combinedPlaceholder} title={t('results')} message={message} error={result.status === 'error'} />
}

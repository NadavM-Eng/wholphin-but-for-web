import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useSearchParams } from 'react-router'
import { useDiscoverSearch } from '../../api/seerr'
import { CardGrid, SearchField } from '../../ui'
import { DiscoverCard } from './DiscoverCard'
import { clearDiscoverBackdrop } from './backdropStore'
import styles from './DiscoverSearchTab.module.css'
import { itemDestinationHref } from './links'

/** Upstream debounce before searching while typing. */
const DEBOUNCE_MS = 750

/**
 * Tab 3 "Search" (`DiscoverSearchPage`): debounced 750 ms, Enter searches at once; the same query is not
 * re-run, a blank query resets. Movies and TV only. The query lives in the URL (`?q=`) so it survives Back.
 */
export function DiscoverSearchTab() {
  const { t } = useTranslation()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const committed = params.get('q') ?? ''
  const [text, setText] = useState(committed)
  useEffect(() => clearDiscoverBackdrop(), [])

  const commit = (q: string) => {
    if (q === committed) return
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (q) next.set('q', q)
        else next.delete('q')
        return next
      },
      { replace: true },
    )
  }

  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })
  useEffect(() => {
    const timer = setTimeout(() => commitRef.current(text), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])

  const results = useDiscoverSearch(committed)
  // Upstream `SearchCombinedResults`: "Results" placeholder with "Searching…", the error message in the error
  // colour, or "No results"; otherwise the "Results" title above the grid (`SearchGrid`).
  const placeholder = (message: string, error = false) => (
    <section className={styles.placeholder} aria-live="polite">
      <h2 className={styles.resultsTitle}>{t('results')}</h2>
      <p className={error ? styles.messageError : styles.message} dir="auto">
        {message}
      </p>
    </section>
  )
  let body
  if (!committed.trim()) body = null
  else if (results.isPending) body = placeholder(t('searching'))
  else if (results.isError) body = placeholder(results.error.message || t('web_seerr_error_occurred'), true)
  else if (results.data.length === 0) body = placeholder(t('no_results'))
  else {
    const list = results.data
    body = (
      <section className={styles.results}>
        <h2 className={styles.resultsTitle}>{t('results')}</h2>
        <CardGrid
          count={list.length}
          columns={{ kind: 'auto', minCardWidth: 140 }}
          gap={16}
          restoreKey={`discover-search-${location.key}`}
          getItemKey={(i) => `${list[i].type}-${list[i].id}`}
          renderItem={(i) => <DiscoverCard item={list[i]} href={itemDestinationHref(list[i])} width="fill" index={i} />}
        />
      </section>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.field}>
        <SearchField
          value={text}
          onChange={setText}
          onSearch={(q) => commit(q)}
          label={t('search')}
          placeholder={t('search')}
          autoFocus={!committed}
        />
      </div>
      {body}
    </div>
  )
}

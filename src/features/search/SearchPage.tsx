import type { BaseItemDto, BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router'
import { useSession } from '../../api/session'
import { clearBackdrop } from '../../app/backdrop'
import { nav } from '../../app/nav'
import { mayTakeInitialFocus } from '../../app/shell/shellFocus'
import { moveFocus } from '../../app/spatialNav'
import { useScrollRestore } from '../../app/useScrollRestore'
import { getPref, setPref, usePrefs } from '../../stores/preferences'
import { TabRow, lastInput, lastPointerType } from '../../ui'
import { itemHref, useCardContext } from '../common/cardAdapters'
import { hasTvAccess, useLibraries } from '../common/libraries'
import { useLinkClick } from '../common/links'
import { useItemContextMenu } from '../common/useItemContextMenu'
import { useTranslate } from '../common/useTranslate'
import { SearchCombinedDiscover } from './SearchCombinedDiscover'
import { SearchCombinedResults } from './SearchCombinedResults'
import { SearchDiscoverRow } from './SearchDiscoverRow'
import { getSearchProgramHandler, useActiveDiscoverProvider } from './searchExtensions'
import { SearchHeader } from './SearchHeader'
import styles from './SearchPage.module.css'
import { SearchRowResult } from './SearchRowResult'
import { determineSearchableTypes, isProgramType, searchCardKind, searchTypeTitleKey } from './searchTypes'
import { SearchTypeOptionsDialog } from './SearchTypeOptionsDialog'
import { SearchViewOptionsDialog } from './SearchViewOptionsDialog'
import { useCombinedResults, useDiscoverResults, useTypeResults, type SearchResult } from './useSearchResults'
import { useVoiceInput } from './useVoiceInput'
import { resumeMs } from '../common/itemMenu'

/** `delay(750.milliseconds)` before a typed query is searched. */
export const SEARCH_DEBOUNCE_MS = 750

/** Location state marking the page's own `?q=` / `?tab=` replacements (typing, choosing a tab). */
type TypingState = { searchTyping: true }
const isTypingState = (s: unknown) => (s as Partial<TypingState> | null)?.searchTyping === true

/**
 * Search (W/ui/search/SearchPage.kt + SearchViewModel.kt). A fresh page instance per navigation to
 * /search (drawer, links, Back), but not for the page's own `?q=` updates while typing.
 */
export default function SearchPage() {
  const location = useLocation()
  const navType = useNavigationType()
  const [instance, setInstance] = useState(location.key)
  if ((navType === 'POP' || !isTypingState(location.state)) && instance !== location.key) setInstance(location.key)
  return <SearchContent key={instance} />
}

function SearchContent() {
  const { t, locale } = useTranslate()
  const [params, setParams] = useSearchParams()
  const navType = useNavigationType()
  const navigate = useNavigate()
  const session = useSession()
  const libraries = useLibraries()
  const ctx = useCardContext()
  const menu = useItemContextMenu({ showGoTo: true, showStreamChoices: false })
  const linkClick = useLinkClick()
  const combined = usePrefs('searchCombinedResults')
  const showVoicePref = usePrefs('searchShowVoiceButton')
  const excluded = usePrefs('searchExcludedTypes')
  const includeDiscover = usePrefs('searchIncludeDiscover')
  const discover = useActiveDiscoverProvider()
  const { voice, state: voiceState, partial } = useVoiceInput(locale)

  const [text, setText] = useState(() => params.get('q') ?? '')
  // The searched query. A deep link or Back shows its results at once (upstream waits 750 ms here too).
  const [query, setQuery] = useState(text)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [focusResults, setFocusResults] = useState(false)
  const [viewOptions, setViewOptions] = useState(false)
  const [typeOptions, setTypeOptions] = useState(false)
  // The selected tab lives in the URL (replaced), so Back and reload return to it (SearchPage.kt:117
  // rememberSaveable).
  const tab: 'library' | 'discover' = params.get('tab') === 'discover' ? 'discover' : 'library'
  const setTab = (k: 'library' | 'discover') => {
    if (k === tab) return
    const state: TypingState = { searchTyping: true }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (k === 'discover') next.set('tab', k)
        else next.delete('tab')
        return next
      },
      { replace: true, preventScrollReset: true, state },
    )
  }
  const inputRef = useRef<HTMLInputElement | null>(null)
  const scrollEl = useRef<HTMLDivElement | null>(null)
  const restoreScroll = useScrollRestore<HTMLDivElement>('search')
  const location = useLocation()

  useEffect(() => clearBackdrop(), [])

  // Debounced search of the typed text; Enter / the voice result search at once (and cancel this).
  useEffect(() => {
    if (text === query) return
    debounce.current = setTimeout(() => {
      debounce.current = null
      setQuery(text)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (debounce.current) clearTimeout(debounce.current)
      debounce.current = null
    }
    // query is read only to skip a no-op timer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const searchNow = (q: string) => {
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = null
    setQuery(q)
    setFocusResults(q.trim() !== '')
  }

  // ?q= follows the text field; replaced, so Back leaves the search page instead of undoing keystrokes.
  const urlQ = params.get('q') ?? ''
  useEffect(() => {
    if (urlQ === text) return
    const state: TypingState = { searchTyping: true }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (text) next.set('q', text)
        else next.delete('q')
        return next
      },
      { replace: true, preventScrollReset: true, state },
    )
    // urlQ is only compared
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, setParams])

  // Focus the field on arrival, except on touch screens (no surprise on-screen keyboard). A direct load or reload
  // is a POP too: the field takes focus then as well; on Back the shell's focus restore puts the remembered card
  // back over it. Keyboard arrival from the drawer finds it as the default.
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.setAttribute('data-focus-default', '')
    if (navType === 'POP' && !mayTakeInitialFocus()) return
    const touchFirst = matchMedia('(hover: none) and (pointer: coarse)').matches
    if (lastInput() !== 'keyboard' && (touchFirst || lastPointerType() === 'touch' || lastPointerType() === 'pen')) return
    const a = document.activeElement
    if (!a || a === document.body || !a.closest('[data-page-root]')) input.focus({ preventScroll: true })
    // on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- types ----
  const tvAccess = hasTvAccess(session?.userDto)
  const collectionTypes = useMemo(() => (libraries.data ?? []).map((l) => l.collectionType), [libraries.data])
  const possibleTypes = useMemo(() => determineSearchableTypes(collectionTypes, tvAccess, []), [collectionTypes, tvAccess])
  const includedTypes = useMemo(() => determineSearchableTypes(collectionTypes, tvAccess, excluded), [collectionTypes, tvAccess, excluded])
  const typesReady = !!libraries.data || libraries.isError

  // ---- results ----
  const typeResults = useTypeResults(query, includedTypes, typesReady && !combined)
  const combinedResult = useCombinedResults(query, includedTypes, typesReady && combined)
  const discoverResult = useDiscoverResults(query, discover, includeDiscover)
  const discoverShown = !!discover && includeDiscover
  const showTabs = combined && discoverShown && query.trim() !== ''
  const activeTab = showTabs ? tab : 'library'

  // After an explicit search: focus the first row with results once every row above it finished.
  useEffect(() => {
    if (!focusResults) return
    const ordered: { key: string; r: SearchResult<unknown> | null | undefined }[] = combined
      ? [{ key: activeTab === 'library' ? 'combined' : 'discover-grid', r: activeTab === 'library' ? combinedResult : discoverResult }]
      : [...includedTypes.map((type) => ({ key: type as string, r: typeResults.get(type) })), ...(discoverShown ? [{ key: 'discover', r: discoverResult }] : [])]
    for (const { key, r } of ordered) {
      if (!r || r.status === 'searching') return
      if (r.status === 'success' && r.items.length > 0) {
        setFocusResults(false)
        const a = document.activeElement
        const inHeader = !a || a === document.body || !!a.closest('[data-search-header]')
        if (!inHeader) return
        requestAnimationFrame(() => {
          const scope = key === 'combined' || key === 'discover-grid' ? scrollEl.current : scrollEl.current?.querySelector(`[data-search-row="${key}"]`)
          scope?.querySelector<HTMLElement>('[data-focusable]')?.focus()
        })
        return
      }
    }
    setFocusResults(false)
  }, [focusResults, combined, activeTab, combinedResult, discoverResult, includedTypes, typeResults, discoverShown])

  // ---- actions ----
  const onClickItem = (item: BaseItemDto) => (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    if (isProgramType(item.Type)) {
      const handler = getSearchProgramHandler()
      if (handler) {
        e.preventDefault()
        handler(item, (p) => void navigate(p))
        return
      }
    }
    linkClick(itemHref(item))(e)
  }

  const onToggleType = (type: BaseItemKind) => {
    const cur = getPref('searchExcludedTypes')
    setPref('searchExcludedTypes', cur.includes(type) ? cur.filter((x) => x !== type) : [...cur, type])
  }

  // Play key on a combined-grid card (CardGrid onClickPlay -> Destination.Playback).
  const onResultsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'MediaPlayPause' && e.key !== 'MediaPlay') return
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-search-item]')?.dataset.searchItem
    if (id) {
      e.preventDefault()
      // Destination.Playback(item) = the item's resume position
      const item = combinedResult?.status === 'success' ? combinedResult.items.find((i) => i.Id === id) : undefined
      void navigate(nav.play(id, { t: item ? resumeMs(item) : undefined }))
    }
  }

  const blank = query.trim() === ''
  const restoreBase = `${location.key}:search`

  return (
    <div className={styles.page} data-focus-group>
      <SearchHeader
        t={t}
        text={text}
        onTextChange={setText}
        onSearch={() => searchNow(text)}
        inputRef={inputRef}
        voice={showVoicePref ? { voice, state: voiceState, partial } : null}
        onSpeechResult={(spoken) => {
          setText(spoken)
          searchNow(spoken)
        }}
        onViewOptions={() => setViewOptions(true)}
        onEscape={() => {
          // TV: Back in the field moves focus on (FocusDirection.Next)
          if (!moveFocus('down')) inputRef.current?.blur()
        }}
      />
      {showTabs && (
        <TabRow
          className={styles.tabs}
          tabs={[
            { key: 'library', label: t('library') },
            { key: 'discover', label: t('discover') },
          ]}
          selectedKey={activeTab}
          onSelect={(k) => setTab(k === 'discover' ? 'discover' : 'library')}
        />
      )}
      <div
        className={styles.results}
        ref={(el) => {
          scrollEl.current = el
          restoreScroll(el)
        }}
        onKeyDown={onResultsKey}
      >
        {!blank && combined && activeTab === 'library' && combinedResult && (
          <SearchCombinedResults
            result={combinedResult}
            t={t}
            ctx={ctx}
            menu={menu}
            restoreKey={`${restoreBase}:combined`}
            getScrollElement={() => scrollEl.current}
            hrefFor={itemHref}
            onClickItem={onClickItem}
          />
        )}
        {!blank && combined && activeTab === 'discover' && discoverResult && (
          <SearchCombinedDiscover
            result={discoverResult}
            t={t}
            restoreKey={`${restoreBase}:discover-grid`}
            getScrollElement={() => scrollEl.current}
          />
        )}
        {!blank && !combined && (
          <div className={styles.rows}>
            {includedTypes.map((type) => {
              const r = typeResults.get(type)
              if (!r) return null
              return (
                <SearchRowResult
                  key={type}
                  rowKey={type}
                  title={t(searchTypeTitleKey(type))}
                  result={r}
                  kind={searchCardKind(type)}
                  t={t}
                  ctx={ctx}
                  menu={menu}
                  restoreKey={`${restoreBase}:${type}`}
                  hrefFor={itemHref}
                  onClickItem={onClickItem}
                />
              )
            })}
            {discoverShown && discoverResult && <SearchDiscoverRow result={discoverResult} t={t} restoreKey={`${restoreBase}:discover`} />}
          </div>
        )}
      </div>
      {menu.element}
      <SearchViewOptionsDialog
        open={viewOptions}
        t={t}
        combinedResults={combined}
        onCombinedResultsChange={(v) => setPref('searchCombinedResults', v)}
        voiceAvailable={voice.available}
        voiceSearchButtonVisible={showVoicePref}
        onVoiceSearchButtonVisibleChange={(v) => setPref('searchShowVoiceButton', v)}
        onClickFilterTypes={() => setTypeOptions(true)}
        onClose={() => setViewOptions(false)}
      />
      <SearchTypeOptionsDialog
        open={typeOptions}
        t={t}
        searchableTypes={possibleTypes}
        excluded={excluded}
        discoverAvailable={!!discover}
        discoverEnabled={includeDiscover}
        onToggle={onToggleType}
        onToggleDiscover={() => setPref('searchIncludeDiscover', !includeDiscover)}
        onClose={() => setTypeOptions(false)}
      />
    </div>
  )
}

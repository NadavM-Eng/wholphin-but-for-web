import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApi, useSession } from '../../api/session'
import { clearBackdrop } from '../../app/backdrop'
import { nav } from '../../app/nav'
import { LibraryGrid } from '../browse/components/LibraryGrid'
import { TabbedPage } from '../browse/components/TabbedPage'
import { TileGrid } from '../browse/components/TileGrid'
import { folderSource } from '../browse/data/librarySource'
import { useTabState } from '../browse/data/useTabState'
import { DEFAULT_FILTER_OPTIONS, type GetItemsFilter } from '../browse/model/filter'
import { ALBUM_SORT_OPTIONS, ARTIST_SORT_OPTIONS, SONG_SORT_OPTIONS } from '../browse/model/sort'
import { VIEW_OPTIONS_SQUARE } from '../browse/model/viewOptions'
import { useTranslate } from '../common/useTranslate'
import { artistGridSource } from './library/musicSources'
import { MUSIC_TABS, MUSIC_TAB_LABEL, parseMusicTab, type MusicTab } from './library/musicTabs'
import { RecommendedMusic } from './library/RecommendedMusic'
import { playLibrary, setQueue } from './service/musicService'

export type MusicLibraryPageProps = {
  /** the music CollectionFolder / UserView (collectionType "music") */
  library: BaseItemDto
}

const ALBUMS_FILTER: GetItemsFilter = { includeItemTypes: ['MusicAlbum'] }
const ARTISTS_FILTER: GetItemsFilter = { override: 'ARTIST' }
const SONGS_FILTER: GetItemsFilter = { includeItemTypes: ['Audio'] }

/**
 * `CollectionFolderMusic` (W/ui/detail/CollectionFolderMusic.kt): a TabbedPage with Recommended, Albums, Artists,
 * Genres and Songs. Albums, Artists and Songs are the shared library grid (`CollectionFolderView`, square cards,
 * 6 columns) and Genres the genre tile grid, exactly like the movie and TV libraries. The three grids read and
 * write the library's one saved sort / filter / view options, as upstream (same item id). The selected tab is
 * kept in the URL (`?tab=`) so Back returns to it, and per library with "Remember selected tab".
 */
export function MusicLibraryPage({ library }: MusicLibraryPageProps) {
  const { t } = useTranslate()
  const api = useApi()
  const session = useSession()
  const userId = session?.user.id ?? ''
  const id = library.Id ?? ''
  const tabs = MUSIC_TABS.map((k) => ({ key: k, label: t(MUSIC_TAB_LABEL[k]), href: nav.library(id, { tab: k }) }))
  const [selected, setTab] = useTabState(id, MUSIC_TABS)
  const tab: MusicTab = parseMusicTab(selected)
  // showHeader: the tabs hide while the content is past its first row
  // (kept per tab, so a new tab starts with the tabs shown)
  const [scrolledTab, setScrolledTab] = useState<MusicTab | null>(null)
  const scrolled = scrolledTab === tab
  const onScrolled = useCallback((s: boolean) => setScrolledTab((cur) => (s ? tab : cur === tab ? null : cur)), [tab])
  useEffect(() => {
    if (tab !== 'recommended') clearBackdrop()
  }, [tab])
  const itemsSource = useMemo(() => folderSource(api, userId, library, true), [api, userId, library])
  const artistsSource = useMemo(() => artistGridSource(api, userId, library), [api, userId, library])
  // onClickPlayAll: every song of the library, whatever the tab's sort and filter
  const onPlayAll = useCallback((_s: unknown, shuffle: boolean) => void playLibrary(id, shuffle), [id])
  // onClickPlayRemoteButton: the Play key on a song card queues just that song; other cards do nothing
  const onPlayItem = useCallback((_i: number, item: BaseItemDto) => {
    if (item.Type === 'Audio') void setQueue([item], false)
  }, [])

  return (
    <TabbedPage tabs={tabs} selected={tab} onSelect={setTab} showTabs={!scrolled}>
      {tab === 'recommended' && <RecommendedMusic key="recommended" libraryId={id} onScrolled={onScrolled} />}
      {(tab === 'albums' || tab === 'artists' || tab === 'songs') && (
        <LibraryGrid
          key={tab}
          displayId={id}
          item={library}
          pageFilter={tab === 'albums' ? ALBUMS_FILTER : tab === 'artists' ? ARTISTS_FILTER : SONGS_FILTER}
          defaultViewOptions={VIEW_OPTIONS_SQUARE}
          source={tab === 'artists' ? artistsSource : itemsSource}
          sortOptions={tab === 'albums' ? ALBUM_SORT_OPTIONS : tab === 'artists' ? ARTIST_SORT_OPTIONS : SONG_SORT_OPTIONS}
          filterOptions={DEFAULT_FILTER_OPTIONS}
          filterParentId={id}
          playEnabled={tab !== 'artists'}
          useSeriesForPrimary
          onPlayAll={onPlayAll}
          onPlayItem={onPlayItem}
          collectionType="music"
          onScrolled={onScrolled}
        />
      )}
      {tab === 'genres' && <TileGrid key="genres" kind="Genre" parent={library} includeItemTypes={['MusicAlbum']} collectionType="music" />}
    </TabbedPage>
  )
}

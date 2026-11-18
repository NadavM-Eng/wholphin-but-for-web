import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useMemo } from 'react'
import { useApi, useSession } from '../../api/session'
import { LibraryGrid } from '../browse/components/LibraryGrid'
import { folderSource } from '../browse/data/librarySource'
import { DEFAULT_FILTER_OPTIONS, type GetItemsFilter } from '../browse/model/filter'
import { MOVIE_SORT_OPTIONS, VIDEO_SORT_OPTIONS } from '../browse/model/sort'
import { VIEW_OPTIONS_DEFAULT, VIEW_OPTIONS_POSTER } from '../browse/model/viewOptions'

const EMPTY_FILTER: GetItemsFilter = Object.freeze({})

type Props = {
  folder: BaseItemDto
  /**
   * `tab`: a recording-folder tab of the Live TV page (CollectionFolderLiveTv.kt: `VideoSortOptions`,
   * `ViewOptions()`, no title). `page`: the Recordings page (CollectionFolderRecordings.kt: `MovieSortOptions`,
   * `ViewOptionsPoster`, the folder name as the grid title).
   */
  variant: 'tab' | 'page'
  /** Collapse the Live TV tab row while the grid is scrolled (upstream: tab row hidden past the first row). */
  onScrolled?: (scrolled: boolean) => void
}

/**
 * A recording folder drawn with browse's shared `CollectionFolderView` (LibraryGrid): `recursive = false`,
 * `playEnabled = false`, with the sort chip, Filter, View options, dice, letter column and counter. The caller
 * gives it a height-bounded box (the grid scrolls inside).
 */
export function RecordingFolderGrid({ folder, variant, onScrolled }: Props) {
  const api = useApi()
  const userId = useSession()?.user.id ?? ''
  const source = useMemo(() => folderSource(api, userId, folder, false), [api, userId, folder])
  const page = variant === 'page'
  return (
    <LibraryGrid
      displayId={folder.Id ?? ''}
      item={folder}
      recursive={false}
      pageFilter={EMPTY_FILTER}
      defaultViewOptions={page ? VIEW_OPTIONS_POSTER : VIEW_OPTIONS_DEFAULT}
      source={source}
      sortOptions={page ? MOVIE_SORT_OPTIONS : VIDEO_SORT_OPTIONS}
      filterOptions={DEFAULT_FILTER_OPTIONS}
      filterParentId={folder.Id ?? null}
      playEnabled={false}
      title={page ? (folder.Name ?? null) : null}
      showTitle={page}
      collectionType={folder.CollectionType ?? null}
      onScrolled={onScrolled}
    />
  )
}

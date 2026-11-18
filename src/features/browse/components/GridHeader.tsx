import type { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models'
import clsx from 'clsx'
import { ExpandableButton, FaIcon, MaterialIcon } from '../../../ui'
import { useTranslate } from '../../common/useTranslate'
import type { FilterDef, FilterValue, GetItemsFilter } from '../model/filter'
import type { SortAndDirection } from '../model/sort'
import { FilterButton } from './FilterButton'
import styles from './GridHeader.module.css'
import { SortButton } from './SortButton'

export type GridHeaderProps = {
  title?: string | null
  showTitle: boolean
  sortOptions: readonly ItemSortBy[]
  sort: SortAndDirection
  onSortChange: (s: SortAndDirection) => void
  filterOptions: readonly FilterDef[]
  filter: GetItemsFilter
  onFilterChange: (f: GetItemsFilter) => void
  getFilterValues: (def: FilterDef) => Promise<FilterValue[]>
  onFilterShow?: (open: boolean) => void
  onViewOptions: () => void
  onRandom: () => void
  playEnabled: boolean
  onPlay: (shuffle: boolean) => void
  listNotEmpty: boolean
  /** The alphabet column is shown (end padding +24dp). */
  letters: boolean
}

/**
 * `CollectionFolderHeader` (W/ui/components/CollectionFolderGrid.kt:264-398): optional title, then
 * [Sort] [Filter] [View options] ... [Random] [Play] [Shuffle]; the icon buttons show their label on
 * focus / hover. Random, Play and Shuffle are disabled while the list is empty.
 */
export function GridHeader(p: GridHeaderProps) {
  const { t } = useTranslate()
  return (
    <div className={styles.header}>
      {p.showTitle && p.title && (
        <h1 className={styles.title}>
          <span className={styles.titleText} dir="auto">
            {p.title}
          </span>
        </h1>
      )}
      <div className={clsx(styles.row, p.letters && styles.rowLetters)}>
        <div className={styles.group}>
          {p.sortOptions.length > 0 && <SortButton options={p.sortOptions} current={p.sort} onChange={p.onSortChange} />}
          {p.filterOptions.length > 0 && (
            <FilterButton
              options={p.filterOptions}
              current={p.filter}
              onChange={p.onFilterChange}
              getValues={p.getFilterValues}
              onShow={p.onFilterShow}
            />
          )}
          <ExpandableButton iconKind="fa" icon={<FaIcon name="sliders" />} label={t('view_options')} onClick={p.onViewOptions} />
        </div>
        <span className={styles.spacer} />
        <div className={styles.group}>
          <ExpandableButton
            iconKind="fa"
            icon={<FaIcon name="dice" />}
            label={t('sort_by_random')}
            onClick={p.onRandom}
            disabled={!p.listNotEmpty}
          />
          {p.playEnabled && (
            <>
              <ExpandableButton icon={<MaterialIcon name="play_arrow" />} label={t('play')} onClick={() => p.onPlay(false)} disabled={!p.listNotEmpty} />
              <ExpandableButton iconKind="fa" icon={<FaIcon name="shuffle" />} label={t('shuffle')} onClick={() => p.onPlay(true)} disabled={!p.listNotEmpty} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

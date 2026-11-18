import { Fragment, useState } from 'react'
import type { Translate } from '../../../lib/format'
import { arrayLabels } from './arrayLabels'
import { ChoicePreference } from './ChoicePreference'
import {
  CHOICE_VALUES,
  nextSort,
  prefGroupsFor,
  resetViewOptionsFor,
  setViewOption,
  sortLabelKey,
  thumbOptions,
  type EditorRow,
} from './editorModel'
import styles from './HomeSettings.module.css'
import { SettingsListItem } from './SettingsListItem'
import { SliderPreference } from './SliderPreference'
import { SortDialog } from './SortDialog'
import { SwitchPreference } from './SwitchPreference'
import { FaIcon } from '../../../ui'
import type { HomeRowConfig, HomeRowViewOptions } from '../model/homeRowConfig'

type Props = {
  t: Translate
  row: EditorRow
  title: string
  onViewOptions: (vo: HomeRowViewOptions) => void
  onConfig: (config: HomeRowConfig) => void
  onCombine: () => void
  onSplit: () => void
}

/**
 * `HomeRowSettings`: the view-option preferences of one row (groups per row kind; group subtitles only
 * when there is more than one group), then Split / Combine for the watching rows or Sort for ByParent.
 */
export function RowSettingsPage({ t, row, title, onViewOptions, onConfig, onCombine, onSplit }: Props) {
  const [sortOpen, setSortOpen] = useState(false)
  const config = row.config
  const vo = config.viewOptions
  const groups = prefGroupsFor(config)
  return (
    <>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.list}>
        {groups.map((g) => (
          <Fragment key={g.titleKey}>
            {groups.length > 1 && <div className={styles.subTitle}>{t(g.titleKey)}</div>}
            {g.items.map((p) => {
              switch (p.kind) {
                case 'slider':
                  return (
                    <SliderPreference
                      key={p.key}
                      title={t(p.titleKey)}
                      value={vo[p.key]}
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      summary={String(vo[p.key])}
                      onChange={(v) => onViewOptions(setViewOption(vo, p.key, v))}
                    />
                  )
                case 'switch':
                  return <SwitchPreference key={p.key} title={t(p.titleKey)} value={vo[p.key]} onChange={(v) => onViewOptions(setViewOption(vo, p.key, v))} />
                case 'choice': {
                  const values = CHOICE_VALUES[p.key] as readonly string[]
                  return (
                    <ChoicePreference
                      key={p.key}
                      title={t(p.titleKey)}
                      labels={arrayLabels(t, p.arrayKey)}
                      selectedIndex={Math.max(0, values.indexOf(vo[p.key]))}
                      onChange={(i) => onViewOptions(setViewOption(vo, p.key, values[i]))}
                    />
                  )
                }
                case 'action':
                  return (
                    <SettingsListItem
                      key={p.action}
                      headline={t(p.titleKey)}
                      onClick={() => onViewOptions(p.action === 'reset' ? resetViewOptionsFor(config) : thumbOptions(vo))}
                    />
                  )
              }
            })}
          </Fragment>
        ))}
        {config.type === 'ContinueWatchingCombined' && <SettingsListItem headline={t('split_into_separate_rows')} onClick={onSplit} />}
        {(config.type === 'ContinueWatching' || config.type === 'NextUp') && (
          <SettingsListItem headline={t('combine_continue_next')} onClick={onCombine} />
        )}
        {config.type === 'ByParent' && (
          <>
            <SettingsListItem
              headline={t('sort')}
              supporting={
                <>
                  <FaIcon name={(config.sort?.direction ?? 'Ascending') === 'Ascending' ? 'caret_up' : 'caret_down'} /> {t(sortLabelKey(config.sort?.sort ?? 'Default'))}
                </>
              }
              onClick={() => setSortOpen(true)}
            />
            <SortDialog
              open={sortOpen}
              t={t}
              title={t('sort')}
              current={config.sort ?? { sort: 'Default', direction: 'Ascending' }}
              onClose={() => setSortOpen(false)}
              onPick={(s) => {
                setSortOpen(false)
                onConfig({ ...config, sort: nextSort(config.sort, s) })
              }}
            />
          </>
        )}
      </div>
    </>
  )
}

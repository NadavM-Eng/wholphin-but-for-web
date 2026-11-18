import { Dialog, ListItem, Switch } from '../../../ui'
import { useTranslate } from '../../common/useTranslate'
import { ASPECT_RATIOS, CONTENT_SCALES, VIEW_IMAGE_TYPES } from '../../common/viewOptions'
import { ChoicePreference } from '../../settings/ChoicePreference'
import { ClickPreference } from '../../settings/ClickPreference'
import pref from '../../settings/Preference.module.css'
import { SliderPreference } from '../../settings/SliderPreference'
import { VIEW_OPTIONS_TYPES, withImageType, withLayout, type ViewOptions } from '../model/viewOptions'
import styles from './ViewOptionsDialog.module.css'

type Props = {
  open: boolean
  value: ViewOptions
  defaults: ViewOptions
  onChange: (v: ViewOptions) => void
  onClose: () => void
}

type Choice = { titleKey: string; arrayKey: string; values: readonly string[]; get: (v: ViewOptions) => string; set: (v: ViewOptions, x: string) => ViewOptions }

const LAYOUT: Choice = {
  titleKey: 'layout',
  arrayKey: 'view_options_types',
  values: VIEW_OPTIONS_TYPES,
  get: (v) => v.type,
  set: (v, x) => withLayout(v, x as ViewOptions['type']),
}
const IMAGE_TYPE: Choice = {
  titleKey: 'image_type',
  arrayKey: 'image_types',
  values: VIEW_IMAGE_TYPES,
  get: (v) => v.imageType,
  set: (v, x) => withImageType(v, x as ViewOptions['imageType']),
}
const ASPECT: Choice = {
  titleKey: 'aspect_ratio',
  arrayKey: 'aspect_ratios',
  values: ASPECT_RATIOS,
  get: (v) => v.aspectRatio,
  set: (v, x) => ({ ...v, aspectRatio: x as ViewOptions['aspectRatio'] }),
}
const SCALE: Choice = {
  titleKey: 'global_content_scale',
  arrayKey: 'content_scale',
  values: CONTENT_SCALES,
  get: (v) => v.contentScale,
  set: (v, x) => ({ ...v, contentScale: x as ViewOptions['contentScale'] }),
}

/**
 * `ViewOptionsDialog` (W/ui/components/ViewOptionsDialog.kt): 256dp panel, max 380dp tall, surface at 6dp,
 * "View options" title, then the grid or list rows. Each row is upstream's `ComposablePreference`, the same
 * composable the settings screens use (titleSmall / bodySmall, 64dp rows, 1.05 focus scale, selected-dot
 * choice dialog, 72dp slider row), so the rows are the settings feature's preference components. Changes
 * apply live; closing keeps them. The TV dialog does not dim the page (dim amount 0), so the grid behind
 * updates visibly.
 */
export function ViewOptionsDialog({ open, value, defaults, onChange, onClose }: Props) {
  const { t } = useTranslate()
  const labels = (c: Choice) => t(c.arrayKey, { returnObjects: true }) as unknown as string[]
  const grid = value.type === 'GRID'

  const choiceRow = (c: Choice) => {
    const names = labels(c)
    const selected = c.values.indexOf(c.get(value))
    return (
      <ChoicePreference
        key={c.titleKey}
        id={`view-${c.titleKey}`}
        title={t(c.titleKey)}
        summary={names[selected] ?? c.get(value)}
        options={c.values.map((x, i) => ({ label: names[i] ?? x }))}
        selectedIndex={selected}
        onSelect={(i) => onChange(c.set(value, c.values[i]))}
      />
    )
  }
  // SwitchPreference.kt; built here (not the settings component) so the row keeps its switch role and state
  const switchRow = (key: string, checked: boolean, set: (b: boolean) => void) => (
    <div key={key} className={pref.row} data-pref-id={`view-${key}`}>
      <ListItem
        className={pref.item}
        role="switch"
        checked={checked}
        headline={<span className={pref.title}>{t(key)}</span>}
        trailing={<Switch checked={checked} presentational />}
        onClick={() => set(!checked)}
      />
    </div>
  )
  // AppSliderPreference.summary: the value itself when there is no summarizer
  const sliderRow = (key: string, v: number, min: number, max: number, step: number, set: (n: number) => void) => (
    <SliderPreference key={key} id={`view-${key}`} title={t(key)} summary={String(v)} value={v} min={min} max={max} step={step} onChange={set} />
  )

  return (
    <Dialog open={open} onClose={onClose} variant="basic" scrim={false} label={t('view_options')} className={styles.panel}>
      <h2 className={styles.title}>{t('view_options')}</h2>
      <div className={styles.list}>
        {choiceRow(LAYOUT)}
        {grid && choiceRow(IMAGE_TYPE)}
        {grid && choiceRow(ASPECT)}
        {switchRow('show_details', value.showDetails, (b) => onChange({ ...value, showDetails: b }))}
        {switchRow('show_backdrop', value.showBackdrop, (b) => onChange({ ...value, showBackdrop: b }))}
        {grid && switchRow('show_titles', value.showTitles, (b) => onChange({ ...value, showTitles: b }))}
        {grid && sliderRow('columns', value.columns, 1, 12, 1, (n) => onChange({ ...value, columns: n }))}
        {sliderRow('spacing', value.spacing, 0, 32, 2, (n) => onChange({ ...value, spacing: n }))}
        {grid && choiceRow(SCALE)}
        <ClickPreference id="view-reset" title={t('reset')} onClick={() => onChange({ ...defaults })} />
      </div>
    </Dialog>
  )
}

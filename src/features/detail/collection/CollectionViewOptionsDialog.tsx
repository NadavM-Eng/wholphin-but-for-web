import { useState } from 'react'
import { Dialog, DialogPopup, ListItem, MaterialIcon, Slider, Switch } from '../../../ui'
import { useTranslate } from '../../common/useTranslate'
import { ASPECT_RATIOS, CONTENT_SCALES, VIEW_IMAGE_TYPES } from '../../common/viewOptions'
import { DEFAULT_COLLECTION_OPTIONS, setCollectionOptions, useCollectionOptions, type CollectionCardOptions } from './collectionOptions'
import styles from './CollectionViewOptionsDialog.module.css'

type Choice = {
  titleKey: string
  arrayKey: string
  values: readonly string[]
  get: (c: CollectionCardOptions) => string
  patch: (x: string) => Partial<CollectionCardOptions>
}

const IMAGE_TYPE: Choice = {
  titleKey: 'image_type',
  arrayKey: 'image_types',
  values: VIEW_IMAGE_TYPES,
  get: (c) => c.imageType,
  // Choosing an image type also sets its aspect ratio (ViewOptionsImageType setter).
  patch: (x) => ({ imageType: x as CollectionCardOptions['imageType'], aspectRatio: x === 'THUMB' ? 'WIDE' : 'TALL' }),
}
const ASPECT: Choice = {
  titleKey: 'aspect_ratio',
  arrayKey: 'aspect_ratios',
  values: ASPECT_RATIOS,
  get: (c) => c.aspectRatio,
  patch: (x) => ({ aspectRatio: x as CollectionCardOptions['aspectRatio'] }),
}
const SCALE: Choice = {
  titleKey: 'global_content_scale',
  arrayKey: 'content_scale',
  values: CONTENT_SCALES,
  get: (c) => c.contentScale,
  patch: (x) => ({ contentScale: x as CollectionCardOptions['contentScale'] }),
}

/**
 * Upstream `CollectionViewOptionsDialog`: a 256dp panel at the end edge with no dim. "Separate types" first;
 * separate: show details, show titles, reset; mixed: image type, aspect ratio, show details, show titles,
 * columns, spacing, content scale, reset. Every entry is a full-width preference row (ComposablePreference:
 * switches trailing, choices opening a list, Reset a clickable row). Changes apply and save at once.
 */
export function CollectionViewOptionsDialog({ onClose, onShowDetailsOff }: { onClose: () => void; onShowDetailsOff: () => void }) {
  const { t } = useTranslate()
  const o = useCollectionOptions()
  const c = o.cardViewOptions
  const [choice, setChoice] = useState<Choice | null>(null)
  const setCard = (patch: Partial<CollectionCardOptions>) => {
    setCollectionOptions({ ...o, cardViewOptions: { ...c, ...patch } })
    if (patch.showDetails === false) onShowDetailsOff()
  }
  const labels = (ch: Choice) => {
    const l = t(ch.arrayKey, { returnObjects: true }) as unknown
    return Array.isArray(l) ? (l as string[]) : []
  }
  const label = (ch: Choice) => labels(ch)[ch.values.indexOf(ch.get(c))] ?? ch.get(c)

  const choiceRow = (ch: Choice) => <ListItem key={ch.titleKey} noScale headline={t(ch.titleKey)} supporting={label(ch)} onClick={() => setChoice(ch)} />
  const switchRow = (key: string, checked: boolean, set: (b: boolean) => void) => (
    <ListItem key={key} noScale role="switch" checked={checked} headline={t(key)} trailing={<Switch checked={checked} presentational />} onClick={() => set(!checked)} />
  )
  const sliderRow = (key: string, v: number, min: number, max: number, step: number, set: (n: number) => void) => (
    <div key={key} className={styles.slider}>
      <div className={styles.sliderHead}>
        <span className={styles.sliderTitle}>{t(key)}</span>
        <span className={styles.sliderValue}>{v}</span>
      </div>
      <Slider value={v} min={min} max={max} step={step} label={t(key)} valueText={String(v)} onChange={set} />
    </div>
  )

  return (
    <>
      <Dialog open onClose={onClose} variant="basic" scrim={false} elevation={3} label={t('view_options')} className={styles.panel}>
        <h2 className={styles.title}>{t('view_options')}</h2>
        <div className={styles.list}>
          {switchRow('separate_types', o.separateTypes, (b) => setCollectionOptions({ ...o, separateTypes: b }))}
          {!o.separateTypes && choiceRow(IMAGE_TYPE)}
          {!o.separateTypes && choiceRow(ASPECT)}
          {switchRow('show_details', c.showDetails, (b) => setCard({ showDetails: b }))}
          {switchRow('show_titles', c.showTitles, (b) => setCard({ showTitles: b }))}
          {!o.separateTypes && sliderRow('columns', c.columns, 1, 12, 1, (n) => setCard({ columns: n }))}
          {!o.separateTypes && sliderRow('spacing', c.spacing, 0, 32, 2, (n) => setCard({ spacing: n }))}
          {!o.separateTypes && choiceRow(SCALE)}
          <ListItem noScale headline={t('reset')} onClick={() => setCollectionOptions(DEFAULT_COLLECTION_OPTIONS)} />
        </div>
      </Dialog>
      {choice && (
        <DialogPopup
          open
          title={t(choice.titleKey)}
          onClose={() => setChoice(null)}
          items={choice.values.map((x, i) => ({
            key: x,
            headline: labels(choice)[i] ?? x,
            selected: choice.get(c) === x,
            leading: choice.get(c) === x ? <MaterialIcon name="check" /> : <span />,
            onSelect: () => setCard(choice.patch(x)),
          }))}
        />
      )}
    </>
  )
}

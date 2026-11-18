import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { captureOpener, focusFromScript, restoreFocus } from '../../ui'
import { ChoicePreference } from '../settings/ChoicePreference'
import { ClickPreference } from '../settings/ClickPreference'
import { SliderPreference } from '../settings/SliderPreference'
import { SwitchPreference } from '../settings/SwitchPreference'
import { ASPECT_RATIOS, CONTENT_SCALES, VIEW_IMAGE_TYPES } from '../common/viewOptions'
import { withImageType, withLayout, type LayoutType, type ViewOptions } from './photoStorage'
import styles from './ViewOptionsPanel.module.css'

const LAYOUTS: readonly LayoutType[] = ['GRID', 'LIST', 'DENSE_LIST']

export type ViewOptionsPanelProps = {
  value: ViewOptions
  defaults: ViewOptions
  onChange: (v: ViewOptions) => void
  onClose: () => void
}

/**
 * `ViewOptionsDialog` (W/ui/components/ViewOptionsDialog.kt): a 256dp panel docked at the end edge, no scrim,
 * surface at 6dp elevation, title "View options" and the preference rows of the current layout. Every change
 * applies at once; closing saves (the caller persists on each change).
 */
export function ViewOptionsPanel({ value, defaults, onChange, onClose }: ViewOptionsPanelProps) {
  const { t } = useTranslation()
  const panel = useRef<HTMLDivElement>(null)
  const arr = (key: string) => t(key, { returnObjects: true }) as unknown as string[]

  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  // Focus moves into the panel once, when it opens, and goes back to the opener (the toolbar button) when it
  // closes (src/ui/lib/inputModality, as the kit's Dialog does).
  useLayoutEffect(() => {
    const opener = captureOpener()
    const first = panel.current?.querySelector<HTMLElement>('[data-focusable], button')
    if (first) focusFromScript(first)
    return () => restoreFocus(opener)
  }, [])

  useEffect(() => {
    const el = panel.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      e.stopPropagation()
      close.current()
    }
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!el || !target || el.contains(target)) return
      // a choice dialog opened from the panel is a separate layer
      if (target.closest('[role="dialog"], [role="menu"], [data-focus-trap]')) return
      close.current()
    }
    el?.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      el?.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [])

  const layouts = arr('view_options_types')
  const imageTypes = arr('image_types')
  const aspects = arr('aspect_ratios')
  const scales = arr('content_scale')
  const grid = value.type === 'GRID'

  return createPortal(
    <div ref={panel} className={styles.panel} role="dialog" aria-label={t('view_options')} data-focus-trap>
      <h2 className={styles.title}>{t('view_options')}</h2>
      <div className={styles.list}>
        <ChoicePreference
          id="vo-layout"
          title={t('layout')}
          summary={layouts[LAYOUTS.indexOf(value.type)]}
          options={layouts.map((label) => ({ label }))}
          selectedIndex={LAYOUTS.indexOf(value.type)}
          onSelect={(i) => onChange(withLayout(value, LAYOUTS[i]))}
        />
        {grid && (
          <>
            <ChoicePreference
              id="vo-image-type"
              title={t('image_type')}
              summary={imageTypes[VIEW_IMAGE_TYPES.indexOf(value.imageType)]}
              options={imageTypes.map((label) => ({ label }))}
              selectedIndex={VIEW_IMAGE_TYPES.indexOf(value.imageType)}
              onSelect={(i) => onChange(withImageType(value, VIEW_IMAGE_TYPES[i]))}
            />
            <ChoicePreference
              id="vo-aspect"
              title={t('aspect_ratio')}
              summary={aspects[ASPECT_RATIOS.indexOf(value.aspectRatio)]}
              options={aspects.map((label) => ({ label }))}
              selectedIndex={ASPECT_RATIOS.indexOf(value.aspectRatio)}
              onSelect={(i) => onChange({ ...value, aspectRatio: ASPECT_RATIOS[i] })}
            />
          </>
        )}
        <SwitchPreference
          id="vo-details"
          title={t('show_details')}
          value={value.showDetails}
          onToggle={() => onChange({ ...value, showDetails: !value.showDetails })}
        />
        <SwitchPreference
          id="vo-backdrop"
          title={t('show_backdrop')}
          value={value.showBackdrop}
          onToggle={() => onChange({ ...value, showBackdrop: !value.showBackdrop })}
        />
        {grid && (
          <>
            <SwitchPreference
              id="vo-titles"
              title={t('show_titles')}
              value={value.showTitles}
              onToggle={() => onChange({ ...value, showTitles: !value.showTitles })}
            />
            <SliderPreference
              id="vo-columns"
              title={t('columns')}
              summary={String(value.columns)}
              value={value.columns}
              min={1}
              max={12}
              step={1}
              onChange={(columns) => onChange({ ...value, columns })}
            />
          </>
        )}
        <SliderPreference
          id="vo-spacing"
          title={t('spacing')}
          summary={String(value.spacing)}
          value={value.spacing}
          min={0}
          max={32}
          step={2}
          onChange={(spacing) => onChange({ ...value, spacing })}
        />
        {grid && (
          <ChoicePreference
            id="vo-scale"
            title={t('global_content_scale')}
            summary={scales[CONTENT_SCALES.indexOf(value.contentScale)]}
            options={scales.map((label) => ({ label }))}
            selectedIndex={CONTENT_SCALES.indexOf(value.contentScale)}
            onSelect={(i) => onChange({ ...value, contentScale: CONTENT_SCALES[i] })}
          />
        )}
        <ClickPreference id="vo-reset" title={t('reset')} onClick={() => onChange(defaults)} />
      </div>
    </div>,
    document.body,
  )
}

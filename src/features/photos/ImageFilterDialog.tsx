import { useEffect, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Slider, captureOpener, focusFromScript, restoreFocus } from '../../ui'
import { DEFAULT_FILTER, FILTER_SLIDERS, type ImageFilter } from './slideshowModel'
import styles from './ImageFilterDialog.module.css'

export type ImageFilterDialogProps = {
  filter: ImageFilter
  /** "Save for album" is offered when the slideshow has an album (always on the web route). */
  showSaveAlbum: boolean
  onChange: (f: ImageFilter) => void
  onSave: () => void
  onSaveAlbum: () => void
  onClose: () => void
}

/**
 * `ImageFilterDialog` + `ImageFilterSliders` (W/ui/slideshow/ImageFilterSliders.kt): a panel at the top end, 40%
 * of the screen wide, secondaryContainer@40% with no dim. Rows: label (96dp), slider 0-200 with wrap-around, value
 * (48dp); red / green / blue sliders are tinted. Buttons: Save, Save for album, Reset (defaults, not saved).
 */
export function ImageFilterDialog({ filter, showSaveAlbum, onChange, onSave, onSaveAlbum, onClose }: ImageFilterDialogProps) {
  const { t } = useTranslation()
  const root = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  // Focus moves to the first slider once, when the panel opens (the caller re-renders with a new onClose on every
  // slider change), and back to the opener when it closes if that is still there (as ViewOptionsPanel does).
  useLayoutEffect(() => {
    const opener = captureOpener()
    const first = root.current?.querySelector<HTMLElement>('[role="slider"]')
    if (first) focusFromScript(first)
    return () => restoreFocus(opener)
  }, [])

  useEffect(() => {
    const el = root.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      e.stopPropagation()
      close.current()
    }
    const onDown = (e: PointerEvent) => {
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        // the press only dismisses: the viewer's stage skips a prevented pointerdown (no tap, no overlay)
        e.preventDefault()
        close.current()
      }
    }
    el?.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      el?.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [])

  return (
    <div ref={root} className={styles.dialog} role="dialog" aria-label={t('filter')} data-focus-trap data-slideshow-filter>
      {FILTER_SLIDERS.map((s) => (
        <div key={s.key} className={styles.row}>
          <span className={styles.label}>{t(s.labelKey)}</span>
          <Slider
            className={s.tint ? `${styles.slider} ${styles[s.key]}` : styles.slider}
            value={filter[s.key]}
            min={0}
            max={200}
            step={1}
            wrapAround
            label={t(s.labelKey)}
            valueText={`${filter[s.key]}%`}
            onChange={(v) => onChange({ ...filter, [s.key]: v })}
          />
          <span className={styles.value}>{filter[s.key]}%</span>
        </div>
      ))}
      <div className={styles.buttons}>
        <Button onClick={onSave}>{t('save')}</Button>
        {showSaveAlbum && <Button onClick={onSaveAlbum}>{t('save_for_album')}</Button>}
        <Button onClick={() => onChange(DEFAULT_FILTER)}>{t('reset')}</Button>
      </div>
    </div>
  )
}

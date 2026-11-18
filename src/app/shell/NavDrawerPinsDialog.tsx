import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Dialog, FaIcon, ListItem, Switch } from '../../ui'
import type { DrawerItem } from './drawerItems'
import styles from './NavDrawerPinsDialog.module.css'
import { getNavPins, orderPinsForDialog, saveNavPins } from './navPins'
import { useDrawerItems } from './useDrawerItems'

type Pin = { id: string; title: string; pinned: boolean }

export type NavDrawerPinsDialogProps = {
  open: boolean
  /** Called after the pins were saved (closing the dialog saves, as upstream's onDismissRequest). */
  onClose: () => void
}

function swap<T>(list: readonly T[], a: number, b: number): T[] {
  const out = list.slice()
  ;[out[a], out[b]] = [out[b], out[a]]
  return out
}

/**
 * "Customize Navigation Drawer Items" (W/ui/preferences/NavDrawerPreference.kt): every drawer item in its
 * saved order with a pinned switch and up / down buttons; dismissing saves the whole list (saveNavPins), so
 * unpinned items move under "More". BasicDialog, elevation 3dp, 16dp padding. Settings mounts it from its
 * "Customize Navigation Drawer Items" entry.
 */
export function NavDrawerPinsDialog({ open, onClose }: NavDrawerPinsDialogProps) {
  if (!open) return null
  return <PinsDialogBody onClose={onClose} />
}

function PinsDialogBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const drawer = useDrawerItems()
  const nameOf = (it: DrawerItem) => (it.kind === 'favorites' ? t('favorites') : it.kind === 'discover' ? t('discover') : (it.name ?? ''))
  const initial = orderPinsForDialog(
    drawer.items.map((it) => ({ id: it.id, title: nameOf(it), pinned: true })),
    drawer.moreItems.map((it) => ({ id: it.id, title: nameOf(it), pinned: false })),
    getNavPins(),
  )
  const [edited, setEdited] = useState<Pin[] | null>(null)
  const pins = edited ?? initial
  const list = useRef<HTMLDivElement>(null)

  // The drawer items may arrive after the dialog opened (Settings has no drawer on screen): the dialog then
  // holds the focus itself, and the first row takes it once there is one, as when the list is there from the start.
  const hasPins = pins.length > 0
  useEffect(() => {
    const first = hasPins ? list.current?.querySelector<HTMLElement>('[data-focusable]') : null
    if (first && document.activeElement === list.current?.closest('[role="dialog"]')) first.focus({ preventScroll: true })
  }, [hasPins])

  const close = () => {
    if (pins.length) saveNavPins(pins)
    onClose()
  }

  return (
    <Dialog open onClose={close} variant="basic" elevation={3} label={t('nav_drawer_pins')}>
      <div className={styles.column}>
        <h2 className={styles.title}>{t('nav_drawer_pins')}</h2>
        <div ref={list} className={styles.list}>
          {pins.map((p, i) => (
            <div key={p.id} className={styles.item}>
              <ListItem
                className={styles.main}
                headline={p.title}
                trailing={<Switch checked={p.pinned} presentational themed={false} />}
                onClick={() => setEdited(pins.map((x, j) => (j === i ? { ...x, pinned: !x.pinned } : x)))}
              />
              <Button className={styles.move} label={t('web_move_up')} disabled={i === 0} onClick={() => setEdited(swap(pins, i, i - 1))}>
                <FaIcon name="caret_up" size={16} />
              </Button>
              <Button className={styles.move} label={t('web_move_down')} disabled={i === pins.length - 1} onClick={() => setEdited(swap(pins, i, i + 1))}>
                <FaIcon name="caret_down" size={16} />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  )
}

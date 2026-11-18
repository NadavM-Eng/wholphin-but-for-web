import { useRef } from 'react'
import { bringIntoView } from '../lib/bringIntoView'
import { handleListArrowKeys } from '../lib/focus'
import { Dialog } from './Dialog'
import styles from './DialogPopup.module.css'
import { isDivider, type DialogEntry } from './dialogItems'
import { ListItem } from './ListItem'

export type DialogPopupProps = {
  open: boolean
  title: string
  items: DialogEntry[]
  onClose: () => void
  /** Close after any item is selected (upstream default true). */
  dismissOnClick?: boolean
  /** 1dp (default) or 3dp (context menus). */
  elevation?: 1 | 3
  /** Index into `items` of the item to focus on open (e.g. the current choice); default the first item. */
  initialFocusIndex?: number
  /** Element to give focus back to on close (see Dialog). */
  returnFocus?: HTMLElement | null
  /**
   * Upstream's bare `DialogPopupContent` in a Dialog (LocaleChoiceDialog.kt): title and list straight on the dimmed
   * page, no container, padding or shadow. Phones keep the container (the list would sit on the page's own text).
   */
  bare?: boolean
}

/**
 * Upstream `DialogPopup` (`ui/components/Dialogs.kt:154-271`): titleLarge title, 8dp gap, a list of
 * tv `ListItem`s with wrap-around up/down, 28dp radius, 24dp padding, 440dp wide (the platform dialog width).
 *
 * Upstream disables the items for 1s after a long-press opened the dialog (`waitToLoad`) so the held
 * OK button does not select the first item; a right-click or tap cannot leak into the dialog, so the
 * web version does not need that.
 */
export function DialogPopup({ open, title, items, onClose, dismissOnClick = true, elevation = 1, initialFocusIndex, returnFocus, bare }: DialogPopupProps) {
  const list = useRef<HTMLDivElement>(null)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="popup"
      className={bare ? `${styles.panel} ${styles.bare}` : styles.panel}
      elevation={elevation}
      label={title}
      returnFocus={returnFocus}
      initialFocus={
        initialFocusIndex != null && initialFocusIndex >= 0
          ? () => {
              const el = (list.current?.children[initialFocusIndex] as HTMLElement | undefined) ?? null
              if (el) bringIntoView(el)
              return el
            }
          : undefined
      }
    >
      <div className={styles.column}>
        <h2 className={styles.title}>{title}</h2>
        <div
          ref={list}
          role="menu"
          aria-label={title}
          className={styles.list}
          onKeyDown={(e) => list.current && handleListArrowKeys(e, list.current)}
        >
          {items.map((entry, i) =>
            isDivider(entry) ? (
              <hr key={entry.key ?? i} className={styles.divider} />
            ) : (
              <ListItem
                key={entry.key ?? i}
                role="menuitem"
                headline={entry.headline}
                overline={entry.overline}
                supporting={entry.supporting}
                leading={
                  entry.leading != null ? (
                    <span style={entry.leadingColor ? { color: entry.leadingColor } : undefined}>{entry.leading}</span>
                  ) : undefined
                }
                trailing={entry.trailing}
                selected={entry.selected}
                disabled={entry.disabled}
                href={entry.href}
                onClick={() => {
                  if ((dismissOnClick && !entry.keepOpen) || entry.dismissOnClick) onClose()
                  entry.onSelect()
                }}
              />
            ),
          )}
        </div>
      </div>
    </Dialog>
  )
}

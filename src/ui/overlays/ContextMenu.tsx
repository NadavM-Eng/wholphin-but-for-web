import type { MenuPoint } from '../lib/contextMenu'
import { DialogPopup } from './DialogPopup'
import { isDivider, type DialogEntry } from './dialogItems'
import { DropdownMenu } from './DropdownMenu'
import styles from './ContextMenu.module.css'
import { DropdownMenuItem } from './DropdownMenuItem'

export type ContextMenuProps = {
  open: boolean
  /** Item title, shown as the dialog title / menu header. */
  title: string
  items: DialogEntry[]
  /**
   * Pointer position for a mouse right-click: the menu opens there as a compact popup menu.
   * `null` (keyboard Menu key, touch long-press, the card "more" button) opens the centered dialog
   * list exactly like the TV long-press menu. Use `contextMenuPoint(event)` to get it.
   */
  point: MenuPoint | null
  onClose: () => void
  /**
   * Element to give focus back to on close (usually the card). Default: the focused or just-pressed
   * element when the menu opens (src/ui/lib/inputModality.ts captureOpener).
   */
  returnFocus?: HTMLElement | null
}

/**
 * The long-press menu (upstream `ContextMenu.kt`: a `DialogPopup` at its default 1dp elevation with FA/Material
 * leading icons; only the dialogs it opens, choosers, Play with and delete, pass 3dp). Mouse right-click gets a
 * desktop-style menu at the pointer instead of a modal.
 */
export function ContextMenu({ open, title, items, point, onClose, returnFocus }: ContextMenuProps) {
  if (point == null) {
    return <DialogPopup open={open} title={title} items={items} onClose={onClose} elevation={1} returnFocus={returnFocus} />
  }
  return (
    <DropdownMenu open={open} anchor={point} onClose={onClose} label={title} header={title} returnFocus={returnFocus}>
      {items.map((entry, i) =>
        isDivider(entry) ? (
          <hr key={entry.key ?? i} className={styles.divider} />
        ) : (
          <DropdownMenuItem
            key={entry.key ?? i}
            leading={entry.leading}
            leadingColor={entry.leadingColor}
            trailing={entry.trailing}
            disabled={entry.disabled}
            selected={entry.selected ? true : undefined}
            href={entry.href}
            onClick={() => {
              if (!entry.keepOpen) onClose()
              entry.onSelect()
            }}
          >
            {entry.headline}
          </DropdownMenuItem>
        ),
      )}
    </DropdownMenu>
  )
}

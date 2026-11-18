import type { MouseEvent as ReactMouseEvent } from 'react'
import { lastInput, lastPointerType } from './inputModality'

export type MenuPoint = { x: number; y: number }

/**
 * Where to open a context menu for a `contextmenu` event: the pointer position for a mouse/pen
 * right-click, or `null` (open as the centered TV-style dialog) for the keyboard Menu key /
 * Shift+F10 and for touch long-press.
 *
 * Decided from the input that acted last (src/ui/lib/inputModality.ts): a right-click is preceded by its
 * pointerdown, the Menu key by its keydown, a touch long-press by a touch pointerdown.
 */
export function contextMenuPoint(e: ReactMouseEvent | MouseEvent): MenuPoint | null {
  const native = ('nativeEvent' in e ? e.nativeEvent : e) as MouseEvent & { pointerType?: string }
  if (native.pointerType === 'touch') return null
  if (lastInput() === 'keyboard' || lastPointerType() === 'touch') return null
  return { x: native.clientX, y: native.clientY }
}

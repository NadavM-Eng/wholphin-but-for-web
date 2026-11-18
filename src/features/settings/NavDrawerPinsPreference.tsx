import { useState } from 'react'
import { NavDrawerPinsDialog } from '../../app/shell'
import { ClickPreference } from './ClickPreference'

/**
 * Customize Navigation Drawer Items (NavDrawerPreference.kt): the settings row opens the shell's
 * `NavDrawerPinsDialog` (every drawer item with a pinned switch and move up / down; closing saves the order and
 * pin state for the signed-in user into src/app/shell/navPins.ts, which the drawer reads).
 */
export function NavDrawerPinsPreference({ id, title, summary }: { id: string; title: string; summary?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <ClickPreference id={id} title={title} summary={summary} onClick={() => setOpen(true)} />
      <NavDrawerPinsDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

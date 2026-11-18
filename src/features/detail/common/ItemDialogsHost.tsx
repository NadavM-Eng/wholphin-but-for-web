import { useEffect, useId } from 'react'
import { useLocation } from 'react-router'
import { create } from 'zustand'
import { AddToPlaylistDialog } from './AddToPlaylistDialog'
import { closeItemDialog, installItemDialogHandlers, useItemDialogs } from './itemDialogs'
import { MediaInfoDialog } from './MediaInfoDialog'
import { StreamChooserDialog } from './StreamChooserDialog'

installItemDialogHandlers()

// Several pages (or several menus on one page) may mount a host; only the first mounted one renders.
const useHosts = create<{ ids: string[] }>(() => ({ ids: [] }))

/** Renders the app-wide item dialog that is open (see itemDialogs.ts). Mount anywhere; duplicates stay inert. */
export function ItemDialogsHost() {
  const id = useId()
  const active = useHosts((s) => s.ids[0] === id)
  const open = useItemDialogs((s) => s.open)
  const { key } = useLocation()
  // A dialog never outlives the page it was opened on.
  useEffect(() => {
    if (active) return () => closeItemDialog()
  }, [key, active])
  useEffect(() => {
    useHosts.setState((s) => ({ ids: [...s.ids, id] }))
    return () => useHosts.setState((s) => ({ ids: s.ids.filter((x) => x !== id) }))
  }, [id])
  if (!active || !open) return null
  switch (open.kind) {
    case 'mediaInfo':
      return <MediaInfoDialog info={open.info} showFilePath={open.showFilePath} onClose={closeItemDialog} />
    case 'playlist':
      return <AddToPlaylistDialog item={open.item} onClose={closeItemDialog} />
    case 'stream':
      return <StreamChooserDialog item={open.item} choice={open.choice} onChosen={open.onChosen} onClose={closeItemDialog} />
  }
}

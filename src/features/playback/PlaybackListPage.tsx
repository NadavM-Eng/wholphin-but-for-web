import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { destinationFromRoute, usePlaybackSession } from './engine'
import { useGoBack, useHideBackButton } from '../../app/shell'
import { PlayerView } from './PlayerView'

/** Route page for `nav.playList(id, { index, shuffle, recursive, sort, order, filter })` (Destination.PlaybackList). */
export default function PlaybackListPage() {
  const { itemId = '' } = useParams()
  const [search] = useSearchParams()
  const dest = useMemo(() => (itemId ? destinationFromRoute('list', itemId, search) : null), [itemId, search])
  const back = useGoBack()
  // the overlay has its own Back control that fades with the controls (as on TV)
  useHideBackButton()
  usePlaybackSession(dest, back)
  return <PlayerView onBack={back} />
}

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { destinationFromRoute, routeFollowTarget, usePlaybackSession, usePlaybackStore, type PlaybackDestination } from './engine'
import { useGoBack, useHideBackButton } from '../../app/shell'
import { nav } from '../../app/nav'
import { PlayerView } from './PlayerView'

// DEV only (`?debug=1`): the engine debug page; dead code in production builds.
const PlaybackDevPage = import.meta.env.DEV ? lazy(() => import('./engine/__dev/PlaybackDevPage')) : null

/** Route page for `nav.play(id, { t, transcode, shuffle })` (upstream Destination.Playback). */
export default function PlaybackPage() {
  const { itemId = '' } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const debug = import.meta.env.DEV && search.get('debug') === '1' && PlaybackDevPage != null
  /** the address was moved to the entry the queue went on to: the running destination stays, no restart */
  const [followed, setFollowed] = useState<{ id: string; dest: PlaybackDestination } | null>(null)
  const routeDest = useMemo(() => (itemId ? destinationFromRoute('item', itemId, search) : null), [itemId, search])
  const dest = followed && followed.id === itemId ? followed.dest : routeDest
  const back = useGoBack()
  // the overlay has its own Back control that fades with the controls (as on TV)
  useHideBackButton()
  usePlaybackSession(debug ? null : dest, back)

  const playing = usePlaybackStore((s) => (s.entryKind === 'media' ? (s.item?.Id ?? null) : null))
  const wasPlaying = useRef<string | null>(null)
  useEffect(() => {
    if (!playing) return
    const was = wasPlaying.current
    wasPlaying.current = playing
    if (debug || !dest || dest.kind !== 'item') return
    const to = routeFollowTarget(was, playing, itemId)
    if (!to) return
    setFollowed({ id: to, dest })
    void navigate(nav.play(to, { transcode: dest.forceTranscode }), { replace: true })
  }, [playing, itemId, dest, debug, navigate])

  if (debug && PlaybackDevPage) {
    return (
      <Suspense fallback={null}>
        <PlaybackDevPage dest={dest} />
      </Suspense>
    )
  }
  return <PlayerView onBack={back} />
}

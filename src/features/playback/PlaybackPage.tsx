import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { destinationFromRoute, routeFollowTarget, usePlaybackSession, usePlaybackStore, type PlaybackDestination } from './engine'
import { useGoBack, useHideBackButton } from '../../app/shell'
import { skipNextPageFade } from '../../app/shell/useShellLayout'
import { nav } from '../../app/nav'
import { PlayerView } from './PlayerView'

// DEV only (`?debug=1`): the engine debug page; dead code in production builds.
const PlaybackDevPage = import.meta.env.DEV ? lazy(() => import('./engine/__dev/PlaybackDevPage')) : null

/** History state of an address the page moved itself to because the queue went on (not a new destination). */
const FOLLOW_STATE = { playbackFollowsQueue: true } as const
const isFollowState = (s: unknown) => typeof s === 'object' && s != null && (s as Record<string, unknown>).playbackFollowsQueue === true

/** Route page for `nav.play(id, { t, transcode, shuffle })` (upstream Destination.Playback). */
export default function PlaybackPage() {
  const { itemId = '' } = useParams()
  const [search] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const debug = import.meta.env.DEV && search.get('debug') === '1' && PlaybackDevPage != null
  const routeDest = useMemo(() => (itemId ? destinationFromRoute('item', itemId, search) : null), [itemId, search])
  // While the address only follows the queue, the destination that started the engine stays the running one, so
  // the session key does not change and nothing restarts. It is decided by the address's own history state, not
  // by comparing ids: the follow is a state update plus a navigation that land in different renders, and a
  // comparison seen between the two restarted the engine on the previous episode (then on the first one).
  const following = isFollowState(location.state)
  const [running, setRunning] = useState<PlaybackDestination | null>(null)
  const dest = following && running ? running : routeDest
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
    setRunning(dest)
    // the layout fades the page in on every new path (700 ms from transparent), which made each move between
    // episodes look like a page reload: the address only follows, the page stays
    skipNextPageFade()
    void navigate(nav.play(to, { transcode: dest.forceTranscode }), { replace: true, state: FOLLOW_STATE })
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

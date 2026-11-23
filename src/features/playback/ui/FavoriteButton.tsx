import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { sameId } from '../../../lib/ids'
import { usePlaybackStore, type PlaybackEngineState } from '../engine'
import { FavoriteToggle } from './FavoriteToggle'

type Playing = Pick<PlaybackEngineState, 'item' | 'entryKind' | 'queue' | 'index'>

/** A guide programme is no library entry of its own: the guide marks its channel, and so does the player. */
const PROGRAM_KINDS: ReadonlySet<string> = new Set(['Program', 'TvProgram', 'LiveTvProgram'])

/**
 * True when the store's `item` is the queue entry being played. The engine moves `index` and `entryKind` to the
 * next entry at once and replaces `item` only when that entry's full item has arrived (engine.ts `playEntry`): in
 * between, `item` is still the previous entry (the film before, or a cinema-mode intro).
 */
function itemIsEntry(state: Playing): boolean {
  const entry = state.queue[state.index]
  // a store without a queue entry has nothing in between
  return !entry || sameId(state.item?.Id, entry.item.Id)
}

/**
 * What the player can mark as a favourite: the entry being played when it is the media itself. Not a cinema-mode
 * intro (queue kind `intro`: the server's pre-roll), not a trailer (a local trailer plays as an ordinary entry of
 * type Trailer; a remote one never reaches the player) and not a guide programme. A Live TV channel can: the
 * guide's channel menu marks channels the same way. While the entry loads this is the queue's own copy of it,
 * never the item of the entry before.
 */
function favoriteTarget(state: Playing): BaseItemDto | null {
  if (state.entryKind !== 'media') return null
  const item = itemIsEntry(state) ? state.item : state.queue[state.index].item
  if (!item?.Id) return null
  if (item.Type === 'Trailer' || item.ExtraType === 'Trailer' || PROGRAM_KINDS.has(item.Type ?? '')) return null
  return item
}

/**
 * The favourite button of the web player's control strip (web addition; the TV player has none, Jellyfin's own web
 * player does). It marks the item being played, with the heart and the two strings of the detail pages. While
 * the next queue entry loads it shows that entry and is disabled: a click then would mark an item whose full
 * state has not arrived (and, before this rule, marked the entry that had just ended).
 *
 * This component only reads the store, so a strip without a playing item needs no session (FavoriteToggle does).
 */
export function FavoriteButton({ onInteract, iconSize = 24 }: { onInteract: () => void; iconSize?: number }) {
  const item = usePlaybackStore(favoriteTarget)
  const loaded = usePlaybackStore(itemIsEntry)
  return item ? <FavoriteToggle item={item} disabled={!loaded} onInteract={onInteract} iconSize={iconSize} /> : null
}

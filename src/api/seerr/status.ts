/**
 * Availability / request-status rules of the Seerr screens, kept pure so they can be unit tested.
 * Sources: W/data/model/DiscoverItem.kt (enums), W/ui/cards/DiscoverItemCard.kt (badges),
 * W/ui/detail/discover/ExpandableDiscoverButtons.kt (primary button), DiscoverMovieViewModel.kt
 * (`canUserCancelRequest`), DiscoverSeriesViewModel.kt (season model) and RequestSeasons.kt (dialog).
 */
import { hasPermission } from './permissions'
import type { MediaRequest, Season, SeerrUser, TvDetails } from './types'

/** `SeerrAvailability` (Seerr server/constants/media.ts). Declaration order = enum ordinal. */
export const SeerrAvailability = {
  UNKNOWN: 1,
  PENDING: 2,
  PROCESSING: 3,
  PARTIALLY_AVAILABLE: 4,
  AVAILABLE: 5,
  BLOCKLISTED: 6,
  DELETED: 7,
} as const
export type Availability = keyof typeof SeerrAvailability

/** `SeerrAvailability.from(status) ?: UNKNOWN`. */
export function availabilityFrom(status: number | null | undefined): Availability {
  const hit = (Object.keys(SeerrAvailability) as Availability[]).find((k) => SeerrAvailability[k] === status)
  return hit ?? 'UNKNOWN'
}

/** `RequestStatus`. */
export const RequestStatus = {
  UNKNOWN: 0,
  PENDING: 1,
  APPROVED: 2,
  DECLINED: 3,
  FAILURE: 4,
  COMPLETED: 5,
} as const
export type RequestStatusName = keyof typeof RequestStatus

export function requestStatusFrom(status: number | null | undefined): RequestStatusName {
  const hit = (Object.keys(RequestStatus) as RequestStatusName[]).find((k) => RequestStatus[k] === status)
  return hit ?? 'UNKNOWN'
}

/** Card / season-row badge kinds as the UI kit's DiscoverItemCard names them. */
export type BadgeKind = 'pending' | 'partially_available' | 'available' | null

/**
 * Badge for an availability: PENDING/PROCESSING -> bell (yellow), PARTIALLY_AVAILABLE -> bar (green),
 * AVAILABLE -> check (green); BLOCKLISTED (indicator commented out upstream), DELETED, UNKNOWN -> none.
 */
export function badgeFor(a: Availability): BadgeKind {
  switch (a) {
    case 'PENDING':
    case 'PROCESSING':
      return 'pending'
    case 'PARTIALLY_AVAILABLE':
      return 'partially_available'
    case 'AVAILABLE':
      return 'available'
    default:
      return null
  }
}

/** The UI kit card prop value for an availability (it distinguishes pending/processing only for a11y). */
export function cardAvailability(a: Availability) {
  switch (a) {
    case 'PENDING':
      return 'pending' as const
    case 'PROCESSING':
      return 'processing' as const
    case 'PARTIALLY_AVAILABLE':
      return 'partially_available' as const
    case 'AVAILABLE':
      return 'available' as const
    case 'BLOCKLISTED':
      return 'blocklisted' as const
    case 'DELETED':
      return 'deleted' as const
    default:
      return 'unknown' as const
  }
}

export type PrimaryButtonKind = 'request' | 'pending' | 'goTo' | 'deleted' | 'blocklisted'

export interface PrimaryButtonState {
  kind: PrimaryButtonKind
  enabled: boolean
  /** PARTIALLY_AVAILABLE adds an always-enabled second "Request" button. */
  showPartialRequest: boolean
}

/** `ExpandableDiscoverButtons` first button. */
export function primaryButton(a: Availability, canRequest: boolean): PrimaryButtonState {
  switch (a) {
    case 'UNKNOWN':
      return {
        kind: 'request',
        enabled: canRequest,
        showPartialRequest: false,
      }
    case 'PENDING':
    case 'PROCESSING':
      return { kind: 'pending', enabled: true, showPartialRequest: false }
    case 'PARTIALLY_AVAILABLE':
      return { kind: 'goTo', enabled: true, showPartialRequest: true }
    case 'AVAILABLE':
      return { kind: 'goTo', enabled: true, showPartialRequest: false }
    case 'DELETED':
      return { kind: 'deleted', enabled: false, showPartialRequest: false }
    case 'BLOCKLISTED':
      return { kind: 'blocklisted', enabled: false, showPartialRequest: false }
  }
}

/**
 * `canUserCancelRequest`: MANAGE_REQUESTS and any request exists, or REQUEST and the user owns a request
 * that is not yet approved.
 */
export function canUserCancelRequest(user: SeerrUser | null | undefined, requests: MediaRequest[] | null | undefined): boolean {
  const list = requests ?? []
  if (hasPermission(user, 'MANAGE_REQUESTS') && list.length > 0) return true
  return (
    hasPermission(user, 'REQUEST') &&
    user?.id != null &&
    list.some((r) => r.requestedBy?.id === user.id && RequestStatus[requestStatusFrom(r.status)] < RequestStatus.APPROVED)
  )
}

/**
 * Which request "Cancel" deletes. Upstream deletes `requests.first()` whoever made it (TODO in
 * DiscoverMovieViewModel.kt / DiscoverSeriesViewModel.kt), which fails with 403 for a normal user when
 * someone else requested first. Fixed: the user's own unapproved request first, else (managers only)
 * the first request.
 */
export function requestToCancel(
  user: SeerrUser | null | undefined,
  requests: MediaRequest[] | null | undefined,
): MediaRequest | null {
  const list = requests ?? []
  const own = list.find(
    (r) =>
      user?.id != null && r.requestedBy?.id === user.id && RequestStatus[requestStatusFrom(r.status)] < RequestStatus.APPROVED,
  )
  if (own) return own
  return hasPermission(user, 'MANAGE_REQUESTS') ? (list[0] ?? null) : null
}

/** `DiscoverSeriesViewModel.updateAvailability`: an UNKNOWN series is PENDING/PROCESSING from the user's requests. */
export function seriesAvailability(tv: TvDetails | null | undefined, userId: number | null | undefined): Availability {
  const overall = availabilityFrom(tv?.mediaInfo?.status)
  if (overall !== 'UNKNOWN') return overall
  const mine = (tv?.mediaInfo?.requests ?? []).filter((r) => r.requestedBy?.id === userId)
  if (mine.some((r) => requestStatusFrom(r.status) === 'PENDING')) return 'PENDING'
  if (mine.some((r) => requestStatusFrom(r.status) === 'APPROVED')) return 'PROCESSING'
  return 'UNKNOWN'
}

/** One row of the season request dialog (`RequestSeason`). */
export interface RequestSeason {
  season: Season
  seasonNumber: number
  status: RequestStatusName
  availability: Availability
  editable: boolean
}

const avOrd = (a: Availability) => SeerrAvailability[a]

/** `updateSeasonStatus(tv, is4k)`: per-season availability, request status and editability. */
export function computeRequestSeasons(tv: TvDetails, is4k: boolean, currentUserId: number | null | undefined): RequestSeason[] {
  const seasonStatus = new Map<number, RequestStatusName>()
  const seasonAvailability = new Map<number, Availability>()
  const editable = new Map<number, boolean>()
  for (const s of tv.seasons ?? []) {
    if (s.seasonNumber == null) continue
    seasonStatus.set(s.seasonNumber, 'UNKNOWN')
    seasonAvailability.set(s.seasonNumber, availabilityFrom(is4k ? s.status4k : s.status))
  }
  for (const s of tv.mediaInfo?.seasons ?? []) {
    if (s.seasonNumber == null) continue
    const a = availabilityFrom(is4k ? s.status4k : s.status)
    const cur = seasonAvailability.get(s.seasonNumber) ?? 'UNKNOWN'
    // "max wins" by enum order, so BLOCKLISTED / DELETED outrank AVAILABLE (as upstream).
    if (avOrd(a) > avOrd(cur)) seasonAvailability.set(s.seasonNumber, a)
  }
  for (const req of tv.mediaInfo?.requests ?? []) {
    if (!!req.is4k !== is4k) continue
    for (const season of req.seasons ?? []) {
      const n = season.seasonNumber
      if (n == null) continue
      const current = seasonStatus.get(n)
      // The request season's own `status` (not status4k): the request itself is 4K or not.
      const next = requestStatusFrom(season.status)
      if (current == null || RequestStatus[next] > RequestStatus[current]) seasonStatus.set(n, next)
      // Every request that mentions the season overwrites it: the last one wins.
      editable.set(
        n,
        currentUserId != null &&
          req.requestedBy?.id === currentUserId &&
          (req.status === RequestStatus.PENDING || req.status === RequestStatus.DECLINED),
      )
    }
  }
  const out: RequestSeason[] = []
  for (const [n, status] of seasonStatus) {
    const season = tv.seasons?.find((s) => s.seasonNumber === n)
    if (!season) continue
    let availability: Availability
    switch (status) {
      case 'PENDING':
        availability = 'PENDING'
        break
      case 'APPROVED':
        availability = 'PROCESSING'
        break
      case 'DECLINED':
      case 'FAILURE':
        availability = 'UNKNOWN'
        break
      default:
        availability = seasonAvailability.get(n) ?? 'UNKNOWN'
    }
    const defaultEditable =
      availability !== 'AVAILABLE' &&
      availability !== 'PARTIALLY_AVAILABLE' &&
      availability !== 'PROCESSING' &&
      availability !== 'BLOCKLISTED'
    out.push({
      season,
      seasonNumber: n,
      status,
      availability,
      editable: editable.get(n) ?? defaultEditable,
    })
  }
  return out
}

/** Seasons that may be toggled (the "Select all" set). */
export const editableSeasonNumbers = (seasons: RequestSeason[]): number[] =>
  seasons.filter((s) => s.editable).map((s) => s.seasonNumber)

/** Non-editable seasons drawn checked and disabled (already requested / approved / available). Not submitted. */
export function lockedOnSeasonNumbers(seasons: RequestSeason[]): number[] {
  return seasons
    .filter(
      (s) =>
        !s.editable &&
        (s.status === 'PENDING' ||
          s.status === 'APPROVED' ||
          s.status === 'COMPLETED' ||
          s.availability === 'PARTIALLY_AVAILABLE' ||
          s.availability === 'AVAILABLE'),
    )
    .map((s) => s.seasonNumber)
}

/** Initial `selectedSeasons`: every season whose request status is PENDING (even non-editable ones). */
export const initialSelectedSeasons = (seasons: RequestSeason[]): number[] =>
  seasons.filter((s) => s.status === 'PENDING').map((s) => s.seasonNumber)

/** "Select all" is on iff every editable season is selected (so it is on when nothing is editable). */
export function allEditableSelected(seasons: RequestSeason[], selected: ReadonlySet<number>): boolean {
  return editableSeasonNumbers(seasons).every((n) => selected.has(n))
}

/** Toggling "Select all" adds or removes only the editable seasons. */
export function toggleSelectAll(seasons: RequestSeason[], selected: ReadonlySet<number>): Set<number> {
  const next = new Set(selected)
  const editable = editableSeasonNumbers(seasons)
  if (allEditableSelected(seasons, selected)) editable.forEach((n) => next.delete(n))
  else editable.forEach((n) => next.add(n))
  return next
}

/** Row toggle: a row shown checked (selected or locked-on) is removed from the selection, else added. */
export function toggleSeason(seasonNumber: number, selected: ReadonlySet<number>, lockedOn: ReadonlySet<number>): Set<number> {
  const next = new Set(selected)
  if (selected.has(seasonNumber) || lockedOn.has(seasonNumber)) next.delete(seasonNumber)
  else next.add(seasonNumber)
  return next
}

/** The user's pending request on a series, which a season edit updates with PUT instead of a new POST. */
export function pendingOwnRequest(tv: TvDetails | null | undefined, userId: number | null | undefined): MediaRequest | null {
  return (
    (tv?.mediaInfo?.requests ?? []).find(
      (r) => r.status === RequestStatus.PENDING && userId != null && r.requestedBy?.id === userId,
    ) ?? null
  )
}

/** Request `serverId` rule: null without advanced choices, else the (4K) server id. */
export function requestServerId(
  profileId: number | null | undefined,
  rootFolder: string | null | undefined,
  is4k: boolean,
  serverId: number,
  server4kId: number,
): number | null {
  if (profileId == null && rootFolder == null) return null
  return is4k ? server4kId : serverId
}

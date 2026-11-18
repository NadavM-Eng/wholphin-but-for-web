import { describe, expect, it } from 'vitest'
import { decodeFilter, discoverQuery, encodeFilter, nextSort, toggleFilterValue, filterOptionsFor } from './filter'
import { jellyfinIdOf, mergeCredits, type DiscoverItem } from './items'
import { canRequestMovies, canRequestTv, hasPermission, requestFlags, SeerrPermission as P } from './permissions'
import {
  allEditableSelected,
  availabilityFrom,
  badgeFor,
  canUserCancelRequest,
  computeRequestSeasons,
  initialSelectedSeasons,
  lockedOnSeasonNumbers,
  pendingOwnRequest,
  primaryButton,
  requestServerId,
  requestToCancel,
  seriesAvailability,
  toggleSeason,
  toggleSelectAll,
} from './status'
import type { MediaRequest, TvDetails } from './types'

const user = (permissions: number, id = 7) => ({ id, permissions })

describe('permissions', () => {
  it('null permissions never grant', () => {
    expect(hasPermission({ permissions: null }, 'REQUEST')).toBe(false)
    expect(hasPermission(null, 'REQUEST')).toBe(false)
  })
  it('admin grants everything', () => {
    expect(hasPermission(user(P.ADMIN), 'REQUEST_ADVANCED')).toBe(true)
    expect(canRequestMovies(user(P.ADMIN))).toBe(true)
  })
  it('parents grant children (recursively)', () => {
    expect(hasPermission(user(P.REQUEST), 'REQUEST_MOVIE')).toBe(true)
    expect(hasPermission(user(P.REQUEST), 'REQUEST_TV')).toBe(true)
    expect(hasPermission(user(P.MANAGE_REQUESTS), 'REQUEST_ADVANCED')).toBe(true)
    expect(hasPermission(user(P.REQUEST_4K), 'REQUEST_4K_TV')).toBe(true)
    // a child does not grant its parent
    expect(hasPermission(user(P.REQUEST_MOVIE), 'REQUEST')).toBe(false)
  })
  it('own bit only', () => {
    const u = user(P.REQUEST_MOVIE)
    expect(canRequestMovies(u)).toBe(true)
    expect(canRequestTv(u)).toBe(false)
    expect(canRequestTv(user(P.REQUEST_4K_TV))).toBe(true)
  })
  it('4K flags need the server setting', () => {
    const u = user(P.REQUEST | P.REQUEST_4K)
    expect(requestFlags(u, { movie4kEnabled: false, series4kEnabled: true })).toEqual({
      requestMovieEnabled: true,
      request4kMovieEnabled: false,
      requestTvEnabled: true,
      request4kTvEnabled: true,
      advanced: false,
    })
  })
})

describe('availability and badges', () => {
  it('maps status numbers', () => {
    expect(availabilityFrom(1)).toBe('UNKNOWN')
    expect(availabilityFrom(4)).toBe('PARTIALLY_AVAILABLE')
    expect(availabilityFrom(7)).toBe('DELETED')
    expect(availabilityFrom(undefined)).toBe('UNKNOWN')
    expect(availabilityFrom(42)).toBe('UNKNOWN')
  })
  it('badge rules', () => {
    expect(badgeFor('PENDING')).toBe('pending')
    expect(badgeFor('PROCESSING')).toBe('pending')
    expect(badgeFor('PARTIALLY_AVAILABLE')).toBe('partially_available')
    expect(badgeFor('AVAILABLE')).toBe('available')
    expect(badgeFor('BLOCKLISTED')).toBeNull()
    expect(badgeFor('DELETED')).toBeNull()
    expect(badgeFor('UNKNOWN')).toBeNull()
  })
  it('primary button state machine', () => {
    expect(primaryButton('UNKNOWN', false)).toEqual({
      kind: 'request',
      enabled: false,
      showPartialRequest: false,
    })
    expect(primaryButton('UNKNOWN', true).enabled).toBe(true)
    expect(primaryButton('PROCESSING', false)).toEqual({
      kind: 'pending',
      enabled: true,
      showPartialRequest: false,
    })
    expect(primaryButton('PARTIALLY_AVAILABLE', false)).toEqual({
      kind: 'goTo',
      enabled: true,
      showPartialRequest: true,
    })
    expect(primaryButton('AVAILABLE', false).showPartialRequest).toBe(false)
    expect(primaryButton('DELETED', true).enabled).toBe(false)
    expect(primaryButton('BLOCKLISTED', true).kind).toBe('blocklisted')
  })
})

const req = (id: number, status: number, by: number, extra: Partial<MediaRequest> = {}): MediaRequest => ({
  id,
  status,
  requestedBy: { id: by },
  ...extra,
})

describe('cancel rules', () => {
  it('manager can cancel any request', () => {
    expect(canUserCancelRequest(user(P.MANAGE_REQUESTS), [req(1, 2, 99)])).toBe(true)
    expect(canUserCancelRequest(user(P.MANAGE_REQUESTS), [])).toBe(false)
  })
  it('requester can cancel own unapproved request only', () => {
    expect(canUserCancelRequest(user(P.REQUEST), [req(1, 1, 7)])).toBe(true)
    expect(canUserCancelRequest(user(P.REQUEST), [req(1, 2, 7)])).toBe(false)
    expect(canUserCancelRequest(user(P.REQUEST), [req(1, 1, 8)])).toBe(false)
    expect(canUserCancelRequest(user(0), [req(1, 1, 7)])).toBe(false)
  })
  it('cancels the own request, not the first one', () => {
    const list = [req(1, 1, 99), req(2, 1, 7)]
    expect(requestToCancel(user(P.REQUEST), list)?.id).toBe(2)
    expect(requestToCancel(user(P.MANAGE_REQUESTS, 5), list)?.id).toBe(1)
    expect(requestToCancel(user(P.REQUEST), [req(1, 1, 99)])).toBeNull()
  })
  it('server id rule', () => {
    expect(requestServerId(null, null, true, 1, 2)).toBeNull()
    expect(requestServerId(3, null, false, 1, 2)).toBe(1)
    expect(requestServerId(null, '/tv', true, 1, 2)).toBe(2)
  })
})

function tv(over: Partial<TvDetails> = {}): TvDetails {
  return {
    id: 100,
    name: 'Show',
    seasons: [
      { seasonNumber: 0, name: 'Specials', episodeCount: 2 },
      { seasonNumber: 1, episodeCount: 10, status: 5 },
      { seasonNumber: 2, episodeCount: 10 },
      { seasonNumber: 3, episodeCount: 8 },
    ],
    ...over,
  }
}

describe('season model', () => {
  it('defaults: available seasons locked, others editable, season 0 kept', () => {
    const s = computeRequestSeasons(tv(), false, 7)
    expect(s.map((x) => x.seasonNumber)).toEqual([0, 1, 2, 3])
    expect(s.find((x) => x.seasonNumber === 1)).toMatchObject({
      availability: 'AVAILABLE',
      editable: false,
    })
    expect(s.find((x) => x.seasonNumber === 2)).toMatchObject({
      availability: 'UNKNOWN',
      editable: true,
    })
    expect(lockedOnSeasonNumbers(s)).toEqual([1])
    expect(initialSelectedSeasons(s)).toEqual([])
  })

  it('mediaInfo seasons raise availability, max wins', () => {
    const s = computeRequestSeasons(tv({ mediaInfo: { seasons: [{ seasonNumber: 2, status: 4 }] } }), false, 7)
    expect(s.find((x) => x.seasonNumber === 2)?.availability).toBe('PARTIALLY_AVAILABLE')
  })

  it('own pending request: pending seasons preselected and editable', () => {
    const t = tv({
      mediaInfo: {
        requests: [
          req(5, 1, 7, {
            is4k: false,
            seasons: [{ seasonNumber: 2, status: 1 }],
          }),
        ],
      },
    })
    const s = computeRequestSeasons(t, false, 7)
    expect(s.find((x) => x.seasonNumber === 2)).toMatchObject({
      status: 'PENDING',
      availability: 'PENDING',
      editable: true,
    })
    expect(initialSelectedSeasons(s)).toEqual([2])
    expect(pendingOwnRequest(t, 7)?.id).toBe(5)
    expect(pendingOwnRequest(t, 8)).toBeNull()
  })

  it("someone else's pending request locks the season on", () => {
    const t = tv({
      mediaInfo: {
        requests: [req(5, 1, 99, { seasons: [{ seasonNumber: 3, status: 1 }] })],
      },
    })
    const s = computeRequestSeasons(t, false, 7)
    expect(s.find((x) => x.seasonNumber === 3)).toMatchObject({
      editable: false,
      availability: 'PENDING',
    })
    expect(lockedOnSeasonNumbers(s)).toContain(3)
    // still part of the initial selection (upstream quirk), harmless: PUT is only for own requests
    expect(initialSelectedSeasons(s)).toEqual([3])
  })

  it('approved request -> processing; 4K requests ignored for the normal list', () => {
    const t = tv({
      mediaInfo: {
        requests: [
          req(5, 2, 99, { seasons: [{ seasonNumber: 2, status: 2 }] }),
          req(6, 1, 7, {
            is4k: true,
            seasons: [{ seasonNumber: 3, status: 1 }],
          }),
        ],
      },
    })
    const s = computeRequestSeasons(t, false, 7)
    expect(s.find((x) => x.seasonNumber === 2)).toMatchObject({
      availability: 'PROCESSING',
      editable: false,
    })
    expect(s.find((x) => x.seasonNumber === 3)).toMatchObject({
      status: 'UNKNOWN',
      editable: true,
    })
    const s4 = computeRequestSeasons(t, true, 7)
    expect(s4.find((x) => x.seasonNumber === 3)).toMatchObject({
      status: 'PENDING',
      editable: true,
    })
  })

  it('declined request -> unknown and editable by its owner', () => {
    const t = tv({
      mediaInfo: {
        requests: [req(5, 3, 7, { seasons: [{ seasonNumber: 2, status: 3 }] })],
      },
    })
    expect(computeRequestSeasons(t, false, 7).find((x) => x.seasonNumber === 2)).toMatchObject({
      availability: 'UNKNOWN',
      editable: true,
    })
  })

  it('select all / toggles only touch editable seasons', () => {
    const s = computeRequestSeasons(tv(), false, 7)
    const empty = new Set<number>()
    expect(allEditableSelected(s, empty)).toBe(false)
    const all = toggleSelectAll(s, empty)
    expect([...all].sort()).toEqual([0, 2, 3])
    expect(allEditableSelected(s, all)).toBe(true)
    expect(toggleSelectAll(s, all).size).toBe(0)
    const locked = new Set(lockedOnSeasonNumbers(s))
    expect([...toggleSeason(2, empty, locked)]).toEqual([2])
    expect(toggleSeason(2, new Set([2]), locked).size).toBe(0)
  })

  it('nothing editable -> select all reads as on', () => {
    const t = tv({ seasons: [{ seasonNumber: 1, status: 5 }] })
    expect(allEditableSelected(computeRequestSeasons(t, false, 7), new Set())).toBe(true)
  })

  it('series availability from own requests when unknown', () => {
    expect(seriesAvailability(tv({ mediaInfo: { status: 1, requests: [req(1, 1, 7)] } }), 7)).toBe('PENDING')
    expect(seriesAvailability(tv({ mediaInfo: { status: 1, requests: [req(1, 2, 7)] } }), 7)).toBe('PROCESSING')
    expect(seriesAvailability(tv({ mediaInfo: { status: 1, requests: [req(1, 1, 8)] } }), 7)).toBe('UNKNOWN')
    expect(seriesAvailability(tv({ mediaInfo: { status: 4 } }), 7)).toBe('PARTIALLY_AVAILABLE')
  })
})

describe('items', () => {
  it('jellyfin id prefers a valid 4K id', () => {
    const a = 'a'.repeat(32)
    const b = 'B'.repeat(8) + '-' + 'b'.repeat(4) + '-' + 'b'.repeat(4) + '-' + 'b'.repeat(4) + '-' + 'b'.repeat(12)
    expect(jellyfinIdOf({ jellyfinMediaId: a, jellyfinMediaId4k: b })).toBe('b'.repeat(32))
    expect(jellyfinIdOf({ jellyfinMediaId: a, jellyfinMediaId4k: 'junk' })).toBe(a)
    expect(jellyfinIdOf({})).toBeNull()
  })
  it('merges credits: dedupe by id, date desc, undated last', () => {
    const mk = (id: number, releaseDate: string | null): DiscoverItem => ({
      id,
      type: 'movie',
      title: String(id),
      subtitle: null,
      overview: null,
      availability: 'UNKNOWN',
      releaseDate,
      posterUrl: null,
      backdropUrl: null,
      logoUrl: null,
      jellyfinItemId: null,
    })
    const out = mergeCredits([mk(1, '2001-01-01'), mk(2, null), mk(3, '2020-05-01'), mk(1, '1990-01-01')])
    expect(out.map((i) => i.id)).toEqual([3, 1, 2])
  })
})

describe('filters', () => {
  it('builds discover queries', () => {
    expect(
      discoverQuery(
        {
          genreIds: [1, 2],
          networkIds: [8],
          voteAverageGte: 7,
          certification: ['PG', 'R'],
          status: [0, 3],
        },
        { sort: 'RELEASE_DATE', direction: 'asc' },
        true,
        2,
      ),
    ).toEqual({
      page: 2,
      genre: '1,2',
      sortBy: 'first_air_date.asc',
      voteAverageGte: 7,
      watchRegion: 'US',
      watchProviders: '8',
      status: '0|3',
      certification: 'PG|R',
      certificationCountry: 'US',
      certificationMode: 'exact',
    })
    expect(discoverQuery({ status: [1] }, { sort: 'RELEASE_DATE', direction: 'desc' }, false, 1)).toEqual({
      page: 1,
      sortBy: 'release_date.desc',
    })
  })
  it('sort picking flips the same option', () => {
    expect(nextSort({ sort: 'POPULARITY', direction: 'desc' }, 'POPULARITY')).toEqual({ sort: 'POPULARITY', direction: 'asc' })
    expect(nextSort({ sort: 'POPULARITY', direction: 'asc' }, 'TMDB_VOTE')).toEqual({ sort: 'TMDB_VOTE', direction: 'asc' })
  })
  it('toggles values; empty lists become null; rating is single', () => {
    let f = toggleFilterValue({}, 'genres', 5)
    expect(f.genreIds).toEqual([5])
    f = toggleFilterValue(f, 'genres', 5)
    expect(f.genreIds).toBeNull()
    f = toggleFilterValue(f, 'rating', 6)
    expect(f.voteAverageGte).toBe(6)
    expect(toggleFilterValue(f, 'rating', 8).voteAverageGte).toBe(8)
    // Re-picking the same rating keeps it (upstream sets the value; only "Remove" clears it).
    expect(toggleFilterValue(f, 'rating', 6).voteAverageGte).toBe(6)
  })
  it('entry-point filters are not offered', () => {
    expect(filterOptionsFor('DISCOVER_TV', { genreIds: [1] }).map((o) => o.kind)).toEqual([
      'studios',
      'rating',
      'certification',
      'status',
    ])
    expect(filterOptionsFor('TRENDING', {})).toEqual([])
  })
  it('round-trips the URL encoding', () => {
    const f = {
      genreIds: [18, 35],
      voteAverageGte: 7,
      certification: ['PG-13'],
      status: [2],
    }
    expect(decodeFilter(encodeFilter(f))).toEqual(f)
    expect(encodeFilter({})).toBeNull()
  })
  it('ignores malformed or empty URL filter values', () => {
    expect(decodeFilter('c:%E0')).toEqual({})
    expect(decodeFilter('g:')).toEqual({})
    expect(decodeFilter('r:')).toEqual({})
    expect(decodeFilter('r:abc~n:x.3')).toEqual({ networkIds: [3] })
    expect(decodeFilter('c:PG%E0.R')).toEqual({ certification: ['R'] })
  })
})

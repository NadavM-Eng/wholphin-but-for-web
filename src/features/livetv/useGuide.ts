// State of the TV guide: port of LiveTvViewModel (W/ui/detail/livetv/LiveTvViewModel.kt). Channels come from a
// TanStack query (so a favorite toggle patches them in place, as upstream updates its list in memory); programs
// are fetched per channel window through the query client and kept for the most recent window only.
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { qk } from '../../api/queryKeys'
import { useApi, useSession } from '../../api/session'
import { toast } from '../../app/toast'
import { usePrefs } from '../../stores/preferences'
import {
  buildGuideTimes,
  EMPTY_PROGRAMS,
  FETCH_RANGE,
  INITIAL_CHANNELS,
  mapPrograms,
  MAX_HOURS,
  windowToFetch,
  type FetchedPrograms,
  type IndexRange,
  type TvChannel,
} from './guideModel'
import { cancelRecording, fetchChannels, fetchGuidePrograms, recordProgram } from './liveTvApi'

/** Debounce of a channel-order preference change before the guide reloads (LiveTvViewModel.kt:106). */
const PREF_DEBOUNCE_MS = 500
/** How long a fetched guide stays reusable (coming Back from the player within this time does not refetch). */
const GUIDE_STALE_MS = 5 * 60_000

export type GuideStatus = 'pending' | 'success' | 'error'

export type Guide = {
  status: GuideStatus
  error: unknown
  refreshing: boolean
  guideTimes: number[]
  channels: TvChannel[]
  /** raw channel DTOs (favorite toggles go through the shared item actions) */
  channelDtos: BaseItemDto[]
  programs: FetchedPrograms
  /** focus moved to channel row `row`: fetch another window when needed */
  onFocusRow: (row: number) => void
  record: (programId: string, series: boolean) => void
  cancel: (series: boolean, timerId: string | null | undefined) => void
}

type InitKey = { favoritesFirst: boolean; sortByRecentlyWatched: boolean; guideStart: number; times: number[] }

export function toTvChannel(dto: BaseItemDto): TvChannel {
  return {
    id: dto.Id ?? '',
    number: dto.ChannelNumber ?? null,
    name: dto.ChannelName ?? dto.Name ?? null,
    imageTag: dto.ImageTags?.Primary ?? null,
    favorite: dto.UserData?.IsFavorite === true,
  }
}

/** Saved window per guide start, so a remount (Back from the player) shows the same rows at once. */
const lastWindow = new Map<number, IndexRange>()

export function useGuide(): Guide {
  const api = useApi()
  const session = useSession()
  const userId = session?.user.id ?? ''
  const qc = useQueryClient()
  const { t } = useTranslation()
  const favoritesFirst = usePrefs('liveTvFavoriteChannelsBeginning')
  const sortByRecentlyWatched = usePrefs('liveTvChannelSortByWatched')

  const [init, setInit] = useState<InitKey>(() => {
    const times = buildGuideTimes(Date.now())
    return { favoritesFirst, sortByRecentlyWatched, guideStart: times[0], times }
  })
  // Changing either channel-order preference re-initialises the guide after 500 ms (state reset, reload).
  useEffect(() => {
    if (init.favoritesFirst === favoritesFirst && init.sortByRecentlyWatched === sortByRecentlyWatched) return
    const id = setTimeout(() => {
      const times = buildGuideTimes(Date.now())
      setInit({ favoritesFirst, sortByRecentlyWatched, guideStart: times[0], times })
    }, PREF_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [favoritesFirst, sortByRecentlyWatched, init.favoritesFirst, init.sortByRecentlyWatched])

  const channelsQuery = useQuery({
    queryKey: qk('livetv', 'channels', { favoritesFirst: init.favoritesFirst, sortByRecentlyWatched: init.sortByRecentlyWatched }),
    enabled: !!session,
    staleTime: GUIDE_STALE_MS,
    queryFn: ({ signal }) => fetchChannels(api, userId, init, signal),
  })
  const channelDtos = useMemo(() => channelsQuery.data ?? [], [channelsQuery.data])
  const channels = useMemo(() => channelDtos.map(toTvChannel), [channelDtos])
  const channelIdsKey = channels.map((c) => c.id).join(',')

  const [programs, setPrograms] = useState<{ key: string; value: FetchedPrograms }>({ key: '', value: EMPTY_PROGRAMS })
  const [status, setStatus] = useState<{ key: string; status: GuideStatus; error: unknown }>({ key: '', status: 'pending', error: null })
  const [refreshing, setRefreshing] = useState(false)
  const stateKey = `${init.guideStart}|${channelIdsKey}`

  // live values for the async jobs
  const live = useRef({ channels, programs: programs.value, guideStart: init.guideStart, stateKey })
  useEffect(() => {
    live.current = { channels, programs: programs.value, guideStart: init.guideStart, stateKey }
  })

  // `Mutex` around fetchPrograms: one window fetch at a time, in call order.
  const lock = useRef<Promise<unknown>>(Promise.resolve())
  const focusJob = useRef(0)

  const fetchWindow = useCallback(
    (range: IndexRange, opts: { fresh?: boolean; job?: number } = {}): Promise<boolean> => {
      const run = async () => {
        if (opts.job != null && opts.job !== focusJob.current) return false
        const { channels: chs, guideStart, stateKey: key } = live.current
        const slice = chs.slice(range.first, range.last + 1)
        const ids = slice.map((c) => c.id)
        const queryKey = qk('livetv', 'programs', guideStart, range.first, range.last, ids.join(','))
        if (opts.fresh) qc.removeQueries({ queryKey })
        const dtos = await qc.fetchQuery({
          queryKey,
          staleTime: GUIDE_STALE_MS,
          queryFn: ({ signal }) => fetchGuidePrograms(api, userId, guideStart, MAX_HOURS, ids, signal),
        })
        // a newer focus job replaced this one, or the guide was re-initialised meanwhile
        if ((opts.job != null && opts.job !== focusJob.current) || key !== live.current.stateKey) return false
        const byChannel = mapPrograms(dtos, guideStart, ids, t('no_data'))
        lastWindow.set(guideStart, range)
        setPrograms({ key, value: { range, byChannel } })
        return true
      }
      const next = lock.current.then(run, run)
      lock.current = next.catch(() => undefined)
      return next
    },
    [api, qc, t, userId],
  )

  const refresh = useCallback(
    async (range: IndexRange, opts: { fresh?: boolean; job?: number } = {}) => {
      const key = live.current.stateKey
      setRefreshing(true)
      try {
        await fetchWindow(range, opts)
      } catch (err) {
        // a failed refresh puts the whole guide in Error (LiveTvViewModel.kt:211-214)
        if (key === live.current.stateKey) setStatus({ key, status: 'error', error: err })
      } finally {
        setRefreshing(false)
      }
    },
    [fetchWindow],
  )

  // init(): first 10 channels (fast first paint), then the first 100.
  useEffect(() => {
    if (!channelsQuery.isSuccess) return
    const n = channels.length
    const key = stateKey
    let cancelled = false
    void (async () => {
      try {
        const saved = lastWindow.get(init.guideStart)
        if (saved && saved.last < n) {
          await fetchWindow(saved)
          if (!cancelled) setStatus({ key, status: 'success', error: null })
          return
        }
        await fetchWindow({ first: 0, last: Math.min(INITIAL_CHANNELS, n) - 1 })
        if (cancelled) return
        setStatus({ key, status: 'success', error: null })
        if (n > INITIAL_CHANNELS) await fetchWindow({ first: 0, last: Math.min(FETCH_RANGE, n) - 1 })
      } catch (err) {
        if (!cancelled) setStatus({ key, status: 'error', error: err })
      }
    })()
    return () => {
      cancelled = true
    }
    // stateKey covers the channel list and the guide start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateKey, channelsQuery.isSuccess])

  const onFocusRow = useCallback(
    (row: number) => {
      const { channels: chs, programs: p } = live.current
      const next = windowToFetch(row, chs.length, p.range)
      if (!next) return
      const job = ++focusJob.current
      void refresh(next, { job })
    },
    [refresh],
  )

  const errorToast = useCallback((err: unknown) => toast(`${t('error')}: ${err instanceof Error ? err.message : String(err)}`), [t])

  const record = useCallback(
    (programId: string, series: boolean) => {
      void (async () => {
        try {
          await recordProgram(api, programId, series)
          await refresh(live.current.programs.range, { fresh: true })
        } catch (err) {
          errorToast(err)
        }
      })()
    },
    [api, refresh, errorToast],
  )

  const cancel = useCallback(
    (series: boolean, timerId: string | null | undefined) => {
      void (async () => {
        try {
          // LT-1: without a timer id nothing is called and nothing refreshes
          if (await cancelRecording(api, series, timerId)) await refresh(live.current.programs.range, { fresh: true })
        } catch (err) {
          errorToast(err)
        }
      })()
    },
    [api, refresh, errorToast],
  )

  const current = status.key === stateKey ? status : { status: 'pending' as const, error: null }
  const result: Guide = {
    status: channelsQuery.isError ? 'error' : channelsQuery.isSuccess && channels.length === 0 ? 'success' : current.status,
    error: channelsQuery.error ?? current.error,
    refreshing,
    guideTimes: init.times,
    channels,
    channelDtos,
    programs: programs.key === stateKey ? programs.value : EMPTY_PROGRAMS,
    onFocusRow,
    record,
    cancel,
  }
  return result
}

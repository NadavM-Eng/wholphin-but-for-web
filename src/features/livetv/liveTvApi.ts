// Every Live TV call the TV app makes, with upstream's parameters:
//   W/ui/detail/livetv/LiveTvViewModel.kt (channels, programs), W/services/LiveTvService.kt (program, record,
//   cancel), W/ui/detail/livetv/DvrSchedule.kt (active recordings, scheduled timers),
//   W/ui/detail/CollectionFolderLiveTv.kt (recording folders, shared with the drawer's query).
//
// The write calls (createTimer, createSeriesTimer, cancelTimer, cancelSeriesTimer) are real and complete. They are
// only ever exercised against Playwright route mocks in this project: a real recording once filled a data drive.
import type { Api } from '@jellyfin/sdk'
import type { BaseItemDto, TimerInfoDto } from '@jellyfin/sdk/lib/generated-client/models'
import { getLiveTvApi } from '@jellyfin/sdk/lib/utils/api/live-tv-api'
import { SLIM_ITEM_FIELDS } from '../common/itemFields'

/** `GetLiveTvChannelsRequest` (LiveTvViewModel.kt:124-143): all channels in one request. */
export async function fetchChannels(
  api: Api,
  userId: string,
  opts: { favoritesFirst: boolean; sortByRecentlyWatched: boolean },
  signal?: AbortSignal,
): Promise<BaseItemDto[]> {
  const res = await getLiveTvApi(api).getLiveTvChannels(
    {
      startIndex: 0,
      userId,
      enableFavoriteSorting: opts.favoritesFirst,
      sortBy: opts.sortByRecentlyWatched ? ['DatePlayed'] : undefined,
      sortOrder: opts.sortByRecentlyWatched ? 'Descending' : undefined,
      addCurrentProgram: false,
    },
    { signal },
  )
  return res.data.Items ?? []
}

/** `POST /LiveTv/Programs` with `GetProgramsDto` (LiveTvViewModel.kt:229-245). */
export async function fetchGuidePrograms(
  api: Api,
  userId: string,
  guideStart: number,
  maxHours: number,
  channelIds: readonly string[],
  signal?: AbortSignal,
): Promise<BaseItemDto[]> {
  if (channelIds.length === 0) return []
  const res = await getLiveTvApi(api).getPrograms(
    {
      getProgramsDto: {
        MaxStartDate: new Date(guideStart + maxHours * 3_600_000 - 60_000).toISOString(),
        MinEndDate: new Date(guideStart + 60_000).toISOString(),
        ChannelIds: [...channelIds],
        SortBy: ['StartDate'],
        UserId: userId,
        Fields: ['Overview'],
      },
    },
    { signal },
  )
  return res.data.Items ?? []
}

/** `LiveTvService.fetchProgramForDialog`: `GET /LiveTv/Programs/{id}` (no user id, as upstream). */
export async function fetchProgram(api: Api, programId: string, signal?: AbortSignal): Promise<BaseItemDto> {
  const res = await getLiveTvApi(api).getProgram({ programId }, { signal })
  return res.data
}

export type DvrSchedule = {
  active: BaseItemDto[]
  /** program infos of the scheduled timers, server order */
  scheduled: BaseItemDto[]
}

/**
 * `DvrScheduleViewModel.init` (DvrSchedule.kt:74-114): active recordings
 * (`GET /LiveTv/Recordings?isInProgress=true&fields=<Slim>&limit=100`, no user id) and scheduled timers
 * (`GET /LiveTv/Timers?isActive=false&isScheduled=true`) mapped to their program info.
 */
export async function fetchDvrSchedule(api: Api, signal?: AbortSignal): Promise<DvrSchedule> {
  const tv = getLiveTvApi(api)
  const active = await tv.getRecordings({ isInProgress: true, fields: SLIM_ITEM_FIELDS, limit: 100 }, { signal })
  const timers = await tv.getTimers({ isActive: false, isScheduled: true }, { signal })
  return {
    active: active.data.Items ?? [],
    // Upstream force-unwraps `programInfo` (TODO "probably breaks for time based recordings"): a timer without
    // program info (or without a start date to group by) is skipped instead of failing the whole tab.
    // The timer's own ids fill in when the program info does not carry them, so "Cancel" in the dialog always has
    // an id to cancel (upstream silently skips the cancel then, DvrSchedule.kt:209-213).
    scheduled: (timers.data.Items ?? []).flatMap((t) =>
      t.ProgramInfo?.StartDate
        ? [{ ...t.ProgramInfo, TimerId: t.ProgramInfo.TimerId || t.Id, SeriesTimerId: t.ProgramInfo.SeriesTimerId || t.SeriesTimerId }]
        : [],
    ),
  }
}

/**
 * `LiveTvService.record` (LiveTvService.kt:60-93): `GET /LiveTv/Timers/Defaults?programId=`, then
 * `POST /LiveTv/SeriesTimers` with the defaults as-is, or `POST /LiveTv/Timers` with the subset of fields
 * upstream copies into a `TimerInfoDto`.
 */
export async function recordProgram(api: Api, programId: string, series: boolean): Promise<void> {
  const tv = getLiveTvApi(api)
  const d = (await tv.getDefaultTimer({ programId })).data
  if (series) {
    await tv.createSeriesTimer({ seriesTimerInfoDto: d })
    return
  }
  const payload: TimerInfoDto = {
    Id: d.Id,
    Type: d.Type,
    ServerId: d.ServerId,
    ExternalId: d.ExternalId,
    ChannelId: d.ChannelId,
    ExternalChannelId: d.ExternalChannelId,
    ChannelName: d.ChannelName,
    ProgramId: d.ProgramId,
    ExternalProgramId: d.ExternalProgramId,
    Name: d.Name,
    Overview: d.Overview,
    StartDate: d.StartDate,
    EndDate: d.EndDate,
    ServiceName: d.ServiceName,
    Priority: d.Priority,
    PrePaddingSeconds: d.PrePaddingSeconds,
    PostPaddingSeconds: d.PostPaddingSeconds,
    IsPrePaddingRequired: d.IsPrePaddingRequired,
    IsPostPaddingRequired: d.IsPostPaddingRequired,
    KeepUntil: d.KeepUntil,
  }
  await tv.createTimer({ timerInfoDto: payload })
}

/**
 * `LiveTvService.cancelRecording` (LiveTvService.kt:39-52): `DELETE /LiveTv/SeriesTimers/{id}` or
 * `DELETE /LiveTv/Timers/{id}`. Returns false (no call) without a timer id.
 */
export async function cancelRecording(api: Api, series: boolean, timerId: string | null | undefined): Promise<boolean> {
  if (timerId == null) return false
  const tv = getLiveTvApi(api)
  if (series) await tv.cancelSeriesTimer({ timerId })
  else await tv.cancelTimer({ timerId })
  return true
}

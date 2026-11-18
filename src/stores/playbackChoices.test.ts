import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models'
import { beforeEach, describe, expect, it } from 'vitest'
import { TrackIndex } from '../features/playback/engine/streamChoice'
import {
  deleteChosenStreams,
  getItemPlayback,
  getSeriesTrackChoices,
  getSubtitleDelay,
  saveSubtitleDelay,
  saveTrackSelection,
  usePlaybackChoicesStore,
} from './playbackChoices'
import { useSessionStore, type CurrentSession } from './session'

const streams = [
  { Type: 'Video' as const, Index: 0 },
  { Type: 'Audio' as const, Index: 1, Language: 'jpn', Channels: 2 },
  { Type: 'Audio' as const, Index: 2, Language: 'eng', Channels: 6, IsDefault: true },
  { Type: 'Subtitle' as const, Index: 3, Language: 'eng', IsForced: true, Title: 'Signs' },
  { Type: 'Subtitle' as const, Index: 4, Language: 'eng' },
]
const episode: BaseItemDto = {
  Id: 'ep1',
  Type: 'Episode',
  SeriesId: 'series',
  SeasonId: 'season',
  ParentId: 'season',
  MediaSources: [{ Id: 'src', MediaStreams: streams }],
}
const movie = (id: string): BaseItemDto => ({ Id: id, Type: 'Movie', ParentId: 'moviesFolder', MediaSources: [{ Id: `${id}src`, MediaStreams: streams }] })

describe('playback choices store', () => {
  beforeEach(() => {
    localStorage.clear()
    usePlaybackChoicesStore.setState({ user: null, doc: { items: {}, stc: {}, delays: {} } })
    useSessionStore.setState({
      current: { server: { id: 'srv' }, user: { id: 'usr' } } as unknown as CurrentSession,
    })
  })

  it('saves item, season and series choices for an episode (season first on read)', () => {
    const ip = saveTrackSelection(episode, null, 1, 'Audio')
    expect(ip).toMatchObject({ itemId: 'ep1', sourceId: 'src', audioIndex: 1, subtitleIndex: TrackIndex.UNSPECIFIED })
    expect(getItemPlayback('ep1')).toMatchObject({ audioIndex: 1 })
    const stc = getSeriesTrackChoices({ Id: 'ep2', Type: 'Episode', SeriesId: 'series', SeasonId: 'season' }, 'AUDIO')
    expect(stc.map((s) => s.parentType)).toEqual(['SEASON', 'SERIES'])
    expect(stc[0]).toMatchObject({ language: 'jpn', relativeTrackIndex: 0, audioChannels: 2, activation: 'ACTIVATED' })
  })

  it('subtitle sentinels become DISABLED / ONLY_FORCED series choices', () => {
    saveTrackSelection(episode, null, TrackIndex.DISABLED, 'Subtitle')
    expect(getSeriesTrackChoices(episode, 'SUBTITLE')[0].activation).toBe('DISABLED')
    saveTrackSelection(episode, getItemPlayback('ep1'), TrackIndex.ONLY_FORCED, 'Subtitle')
    expect(getSeriesTrackChoices(episode, 'SUBTITLE')[0].activation).toBe('ONLY_FORCED')
    expect(getItemPlayback('ep1')?.subtitleIndex).toBe(TrackIndex.ONLY_FORCED)
  })

  it("a movie's choice does not leak to other movies in the same folder (upstream bug)", () => {
    saveTrackSelection(movie('m1'), null, 1, 'Audio')
    expect(getItemPlayback('m1')?.audioIndex).toBe(1)
    expect(getSeriesTrackChoices(movie('m2'), 'AUDIO')).toEqual([])
  })

  it('choices are per user', () => {
    saveTrackSelection(episode, null, 1, 'Audio')
    useSessionStore.setState({ current: { server: { id: 'srv' }, user: { id: 'other' } } as unknown as CurrentSession })
    expect(getItemPlayback('ep1')).toBeNull()
  })

  it('reset and subtitle delay', () => {
    saveTrackSelection(episode, null, 4, 'Subtitle')
    saveSubtitleDelay('ep1', 4, 750)
    expect(getSubtitleDelay('ep1', 4)).toBe(750)
    deleteChosenStreams(episode)
    expect(getItemPlayback('ep1')).toBeNull()
    expect(getSeriesTrackChoices(episode, 'SUBTITLE')).toEqual([])
  })
})

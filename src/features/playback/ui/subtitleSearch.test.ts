import type { Api } from '@jellyfin/sdk'
import type { MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const download = vi.fn()
const getItem = vi.fn()
vi.mock('@jellyfin/sdk/lib/utils/api/subtitle-api', () => ({
  getSubtitleApi: () => ({ downloadRemoteSubtitles: download, searchRemoteSubtitles: vi.fn() }),
}))
vi.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({ getLibraryApi: () => ({ getItem }) }))

const { downloadAndFindSubtitle, sortRemoteSubtitles } = await import('./subtitleSearch')

const source: MediaSourceInfo = {
  Id: 'src1',
  MediaStreams: [
    { Type: 'Video', Index: 0 },
    { Type: 'Audio', Index: 1 },
    { Type: 'Subtitle', Index: 2, IsExternal: true, Path: '/a.srt' },
  ],
}
const withNew: MediaSourceInfo = {
  Id: 'src1',
  MediaStreams: [
    { Type: 'Video', Index: 0 },
    { Type: 'Subtitle', Index: 1, IsExternal: true, Path: '/new.srt' },
    { Type: 'Audio', Index: 2 },
    { Type: 'Subtitle', Index: 3, IsExternal: true, Path: '/a.srt' },
  ],
}
const params = { api: {} as Api, userId: 'u', itemId: 'item', source, subtitleId: 'remote1', audioIndex: 1, sleep: async () => {} }

describe('downloadAndFindSubtitle (SubtitleSearchUtils.downloadAndSwitchSubtitles)', () => {
  beforeEach(() => {
    download.mockReset()
    getItem.mockReset()
  })

  it('downloads to the media source, finds the new external stream and shifts the audio index', async () => {
    getItem.mockResolvedValueOnce({ data: { MediaSources: [source] } }).mockResolvedValueOnce({ data: { MediaSources: [withNew] } })
    const r = await downloadAndFindSubtitle(params)
    expect(download).toHaveBeenCalledWith({ itemId: 'src1', subtitleId: 'remote1' })
    expect(r).toMatchObject({ kind: 'switched', subtitleIndex: 1, audioIndex: 2 })
  })

  it('switches when the stream appears on the 4th poll (upstream reported "too long")', async () => {
    getItem
      .mockResolvedValueOnce({ data: { MediaSources: [source] } })
      .mockResolvedValueOnce({ data: { MediaSources: [source] } })
      .mockResolvedValueOnce({ data: { MediaSources: [source] } })
      .mockResolvedValueOnce({ data: { MediaSources: [withNew] } })
    expect((await downloadAndFindSubtitle(params)).kind).toBe('switched')
    expect(getItem).toHaveBeenCalledTimes(4)
  })

  it('gives up after 4 polls', async () => {
    getItem.mockResolvedValue({ data: { MediaSources: [source] } })
    expect((await downloadAndFindSubtitle(params)).kind).toBe('too-long')
    expect(getItem).toHaveBeenCalledTimes(4)
  })

  it('reports a vanished source', async () => {
    getItem.mockResolvedValue({ data: { MediaSources: [{ Id: 'other' }] } })
    expect((await downloadAndFindSubtitle(params)).kind).toBe('source-gone')
  })

  it('sorts results by hash match, rating, downloads', () => {
    const r = sortRemoteSubtitles([
      { Id: 'a', CommunityRating: 9, DownloadCount: 1 },
      { Id: 'b', IsHashMatch: true, CommunityRating: 1 },
      { Id: 'c', CommunityRating: 9, DownloadCount: 50 },
    ])
    expect(r.map((x) => x.Id)).toEqual(['b', 'c', 'a'])
  })
})

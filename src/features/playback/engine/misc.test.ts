import { describe, expect, it } from 'vitest'
import { directStreamUrl, serverUrl, trickplayTileUrl, withApiKey } from '../../../api/playback/urls'
import { destinationFromRoute, routeFollowTarget } from './destination'
import { hasPrimaryArtwork } from './platform'
import { parseQueueFilter } from './queue'
import { getRemoteTrailers } from './trailers'

describe('remote trailers (TrailerService)', () => {
  it('drops null urls, sorts official first and teasers last, marks YouTube by host', () => {
    const r = getRemoteTrailers(
      {
        RemoteTrailers: [
          { Name: 'Teaser Trailer', Url: 'https://www.youtube.com/watch?v=a' },
          { Name: 'Trailer 2', Url: 'https://youtu.be/b' },
          { Name: 'Official Trailer', Url: 'https://youtube.com/watch?v=c' },
          { Name: null, Url: 'https://vimeo.com/1' },
          { Name: 'Broken', Url: null },
        ],
      },
      'Trailer',
    )
    // a null name sorts as the fallback "Trailer" (rank 1), before "Trailer 2"
    expect(r.map((t) => t.name)).toEqual(['Official Trailer', null, 'Trailer 2', 'Teaser Trailer'])
    expect(r.map((t) => t.subtitle)).toEqual(['YouTube', null, null, 'YouTube'])
  })
})

describe('routes and filters', () => {
  it('item destination', () => {
    expect(destinationFromRoute('item', 'x', new URLSearchParams('t=1500&transcode=1'))).toEqual({
      kind: 'item',
      itemId: 'x',
      positionMs: 1500,
      forceTranscode: true,
      shuffle: false,
    })
  })
  it('list destination with sort and JSON filter', () => {
    const d = destinationFromRoute('list', 'p', new URLSearchParams(`index=3&shuffle=1&sort=PremiereDate&order=desc&filter=${encodeURIComponent('{"isPlayed":false,"genreIds":["g"],"junk":1}')}`))
    expect(d).toMatchObject({ kind: 'list', startIndex: 3, shuffle: true, sort: { sort: 'PremiereDate', direction: 'Descending' } })
    expect(d.kind === 'list' && d.filter).toMatchObject({ isPlayed: false, genreIds: ['g'] })
    expect(parseQueueFilter('not json')).toEqual({})
  })
  it('accepts the GetItemsFilter JSON browse grids pass to Play all', () => {
    const f = parseQueueFilter(JSON.stringify({ played: false, genres: ['g'], decades: [1990], videoTypes: ['FOUR_K'], includeItemTypes: ['Movie'], override: 'NONE' }))
    expect(f).toMatchObject({ isPlayed: false, genreIds: ['g'], is4K: true, includeItemTypes: ['Movie'] })
    expect(f.years).toHaveLength(10)
  })
})

describe('url builders', () => {
  it('adds ApiKey once', () => {
    expect(withApiKey('http://s/a?x=1', 'T')).toBe('http://s/a?x=1&ApiKey=T')
    expect(withApiKey('http://s/a?api_key=Z', 'T')).toBe('http://s/a?api_key=Z')
    expect(serverUrl('http://s/', '/Videos/1/Subtitles/2/0/Stream.vtt', 'T')).toBe('http://s/Videos/1/Subtitles/2/0/Stream.vtt?ApiKey=T')
    expect(directStreamUrl('http://s', { itemId: 'i', mediaSourceId: 'm', liveStreamId: 'l' }, null)).toBe(
      'http://s/Videos/i/stream?static=true&mediaSourceId=m&liveStreamId=l',
    )
    expect(trickplayTileUrl('http://s', 'i', 320, 4, 'm', 'T')).toBe('http://s/Videos/i/Trickplay/320/4.jpg?mediaSourceId=m&ApiKey=T')
  })
})

describe('media session artwork', () => {
  it('requests Primary artwork only when the chosen image has a tag', () => {
    expect(hasPrimaryArtwork({ Type: 'TvChannel', ImageTags: {} })).toBe(false)
    expect(hasPrimaryArtwork({ Type: 'TvChannel', ImageTags: { Primary: 'p' } })).toBe(true)
    expect(hasPrimaryArtwork({ Type: 'Episode', SeriesId: 's', ImageTags: { Primary: 'p' } })).toBe(false)
    expect(hasPrimaryArtwork({ Type: 'Episode', SeriesId: 's', SeriesPrimaryImageTag: 'sp' })).toBe(true)
  })
})

describe('routeFollowTarget (the /play address follows the queue)', () => {
  it('moves to the next entry once the addressed one played', () => {
    expect(routeFollowTarget('e04', 'e05', 'e04')).toBe('e05')
    expect(routeFollowTarget('E0-4', 'e05', 'e04')).toBe('e05')
  })
  it('stays while the addressed entry plays, before it played, or after a stale entry', () => {
    expect(routeFollowTarget('e04', 'e04', 'e04')).toBeNull()
    expect(routeFollowTarget(null, 'e05', 'e04')).toBeNull()
    expect(routeFollowTarget('x', 'e05', 'e04')).toBeNull()
    expect(routeFollowTarget('e04', null, 'e04')).toBeNull()
  })
})

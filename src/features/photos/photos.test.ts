import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyFilter,
  countFilters,
  expandYears,
  gridRequest,
  nextSort,
  parseFilter,
  parseSlideshowParams,
  queueFilterJson,
  serializeFilter,
  slideshowRequest,
  sortParams,
  toggleFilterValue,
  withViewerPosition,
} from './photoQuery'
import { normalizeViewOptions, VIEW_OPTIONS_WIDE, withImageType, withLayout } from './photoStorage'
import { screensaverRequest } from './screensaverItems'
import {
  applyPan,
  applyZoom,
  colorMatrix,
  DEFAULT_FILTER,
  dragBy,
  effectiveTranslation,
  IDENTITY,
  isZoomed,
  needsOriginal,
  screenImageEdge,
  slideshowDelay,
  zoomAt,
} from './slideshowModel'
import { SlideshowTimer } from './slideshowTimer'

const screen = { width: 1000, height: 500 }

describe('sort and filter', () => {
  it('picking the current sort flips the direction, another keeps it', () => {
    expect(nextSort({ sort: 'SortName', direction: 'Ascending' }, 'SortName')).toEqual({ sort: 'SortName', direction: 'Descending' })
    expect(nextSort({ sort: 'SortName', direction: 'Descending' }, 'DateCreated')).toEqual({ sort: 'DateCreated', direction: 'Descending' })
  })

  it('adds the SortName tie-breaker except for SortName and Default', () => {
    expect(sortParams({ sort: 'SortName', direction: 'Descending' })).toEqual({ sortBy: ['SortName'], sortOrder: ['Descending'] })
    expect(sortParams({ sort: 'PremiereDate', direction: 'Descending' })).toEqual({
      sortBy: ['PremiereDate', 'SortName'],
      sortOrder: ['Descending', 'Ascending'],
    })
    expect(sortParams({ sort: 'Default', direction: 'Ascending' })).toEqual({})
  })

  it('applies the filter like GetItemsFilter.applyTo (decades expand, video types map)', () => {
    const req = applyFilter({ parentId: 'p' }, { played: false, decades: [1990], years: [2001], videoTypes: ['SD', 'Blu-Ray', '3D'] })
    expect(req.isPlayed).toBe(false)
    expect(req.years).toHaveLength(11)
    expect(req.years).toContain(1999)
    expect(req.years).toContain(2001)
    expect(req.isHd).toBe(false)
    expect(req.is3D).toBe(true)
    expect(req.is4K).toBeUndefined()
    expect(req.videoTypes).toEqual(['BluRay'])
    expect(expandYears({})).toEqual([])
  })

  it('the grid request has no type restriction and excludes the folder itself', () => {
    const req = gridRequest({ userId: 'u', folderId: 'f', recursive: false, sort: { sort: 'SortName', direction: 'Ascending' }, filter: {} })
    expect(req.includeItemTypes).toBeUndefined()
    expect(req.excludeItemIds).toEqual(['f'])
    expect(req.enableImageTypes).toEqual(['Primary', 'Thumb', 'Backdrop', 'Logo'])
  })

  it('the slideshow request lists photos (and videos when enabled) with one sort key', () => {
    const base = { userId: 'u', parentId: 'p', recursive: true, sort: { sort: 'DateCreated', direction: 'Descending' } as const, filter: { favorite: true } }
    const photos = slideshowRequest({ ...base, playVideos: false })
    expect(photos.includeItemTypes).toEqual(['Photo'])
    expect(photos.sortBy).toEqual(['DateCreated'])
    expect(photos.isFavorite).toBe(true)
    expect(photos.fields).toContain('Width')
    expect(slideshowRequest({ ...base, playVideos: true }).includeItemTypes).toEqual(['Photo', 'Video'])
  })

  it('toggles multi-value filters and counts active ones', () => {
    let f = toggleFilterValue({}, 'genres', 'g1')
    f = toggleFilterValue(f, 'genres', 'g2')
    f = toggleFilterValue(f, 'genres', 'g1')
    expect(f.genres).toEqual(['g2'])
    f = toggleFilterValue(f, 'genres', 'g2')
    expect(f.genres).toBeUndefined()
    f = toggleFilterValue(f, 'communityRating', 7)
    f = toggleFilterValue(f, 'played', true)
    expect(countFilters(f)).toBe(2)
  })

  it('round-trips the filter through the URL and maps it for PlaybackList', () => {
    const f = { favorite: true, genres: ['a'], decades: [2010] }
    expect(parseFilter(serializeFilter(f))).toEqual(f)
    expect(serializeFilter({})).toBeUndefined()
    expect(parseFilter('{"junk":1,"years":["x",2020]}')).toEqual({ years: [2020] })
    expect(parseFilter('not json')).toEqual({})
    expect(JSON.parse(queueFilterJson(f)!)).toEqual({ genreIds: ['a'], years: Array.from({ length: 10 }, (_, i) => 2010 + i), isFavorite: true })
  })

  it('parses the slideshow route', () => {
    const p = parseSlideshowParams('album', new URLSearchParams('index=7&id=abc&start=1&recursive=1&sort=DateCreated&order=desc'))
    expect(p).toMatchObject({ parentId: 'album', index: 7, itemId: 'abc', start: true, recursive: true, sort: { sort: 'DateCreated', direction: 'Descending' } })
    const d = parseSlideshowParams('a', new URLSearchParams('index=-3&sort=Bogus'))
    expect(d).toMatchObject({ index: 0, itemId: null, start: false, recursive: false, sort: { sort: 'SortName', direction: 'Ascending' } })
  })

  it('puts the photo on screen into the viewer address and keeps the rest', () => {
    const q = new URLSearchParams('index=0&id=first&sort=DateCreated&start=1')
    const n = withViewerPosition(q, 14, 'last')!
    expect(n.toString()).toBe('index=14&id=last&sort=DateCreated&start=1')
    expect(parseSlideshowParams('a', n)).toMatchObject({ index: 14, itemId: 'last', start: true })
    expect(withViewerPosition(n, 14, 'last')).toBeNull()
    expect(withViewerPosition(new URLSearchParams(''), 0, 'x')?.toString()).toBe('index=0&id=x')
  })
})

describe('view options', () => {
  it('reads saved JSON with fallbacks and applies the setter side effects', () => {
    expect(normalizeViewOptions(null)).toEqual(VIEW_OPTIONS_WIDE)
    expect(normalizeViewOptions({ columns: 40, type: 'LIST', contentScale: 'nope' })).toMatchObject({ columns: 12, type: 'LIST', contentScale: 'CROP' })
    expect(withImageType(VIEW_OPTIONS_WIDE, 'PRIMARY').aspectRatio).toBe('TALL')
    expect(withImageType(VIEW_OPTIONS_WIDE, 'THUMB').aspectRatio).toBe('WIDE')
    expect(withLayout(VIEW_OPTIONS_WIDE, 'LIST').spacing).toBe(4)
    expect(withLayout(VIEW_OPTIONS_WIDE, 'DENSE_LIST').spacing).toBe(2)
    expect(withLayout(VIEW_OPTIONS_WIDE, 'GRID').spacing).toBe(16)
  })
})

describe('zoom, pan, rotation', () => {
  it('zooms within 1..5 and resets the pan at <= 1.02', () => {
    let t = applyZoom(IDENTITY, 0.15)
    expect(t.zoom).toBeCloseTo(1.15)
    t = applyZoom({ ...t, zoom: 4.95 }, 0.15)
    expect(t.zoom).toBe(5)
    expect(applyZoom({ zoom: 1.05, panX: 30, panY: -30, rotation: 90 }, -0.05)).toEqual({ zoom: 1, panX: 0, panY: 0, rotation: 90 })
    expect(isZoomed(1.02)).toBe(false)
    expect(isZoomed(1.03)).toBe(true)
  })

  it('zooming out shrinks the pan proportionally', () => {
    const t = applyZoom({ zoom: 2, panX: 100, panY: -50, rotation: 0 }, -0.5)
    expect(t.zoom).toBe(1.5)
    expect(t.panX).toBeCloseTo(50)
    expect(t.panY).toBeCloseTo(-25)
  })

  it('clamps the pan to 75% of the screen', () => {
    const t = applyPan({ ...IDENTITY, zoom: 2 }, 5000, -5000, screen)
    expect(t.panX).toBe(750)
    expect(t.panY).toBe(-375)
  })

  it('photos translate by pan * (1 + zoom) / 2 (pan-dependent origin), videos by the pan', () => {
    const t = { zoom: 3, panX: 10, panY: 20, rotation: 0 }
    expect(effectiveTranslation(t, false)).toEqual({ x: 20, y: 40 })
    expect(effectiveTranslation(t, true)).toEqual({ x: 10, y: 20 })
  })

  it('wheel / pinch zoom keeps the point under the pointer', () => {
    const t = zoomAt(IDENTITY, 2, 100, 50, screen, false)
    const tr = effectiveTranslation(t, false)
    // the local point under the pointer (100, 50) stays at (100, 50)
    expect(2 * 100 + tr.x).toBeCloseTo(100)
    expect(2 * 50 + tr.y).toBeCloseTo(50)
    expect(zoomAt(t, 1, 0, 0, screen, false)).toMatchObject({ zoom: 1, panX: 0, panY: 0 })
  })

  it('drag moves the image by the pointer delta', () => {
    const t = dragBy({ zoom: 2, panX: 0, panY: 0, rotation: 0 }, 30, -15, screen, false)
    expect(effectiveTranslation(t, false).x).toBeCloseTo(30)
    expect(effectiveTranslation(t, false).y).toBeCloseTo(-15)
  })
})

describe('image size', () => {
  it('requests the screen size in device pixels, rounded up', () => {
    expect(screenImageEdge({ width: 1920, height: 1080 }, 1)).toBe(2048)
    expect(screenImageEdge({ width: 390, height: 844 }, 3)).toBe(2560)
  })

  it('fetches the original only when zoomed past the resized copy', () => {
    const base = { edge: 2048, imageWidth: 6000, imageHeight: 4000, screen: { width: 1920, height: 1080 }, dpr: 1, rotated: false }
    expect(needsOriginal({ ...base, zoom: 1 })).toBe(false)
    expect(needsOriginal({ ...base, zoom: 1.1 })).toBe(false)
    expect(needsOriginal({ ...base, zoom: 2 })).toBe(true)
    expect(needsOriginal({ ...base, zoom: 3, imageWidth: 1800, imageHeight: 1200 })).toBe(false)
  })
})

describe('colour filter', () => {
  it('has no matrix at the defaults', () => {
    expect(colorMatrix(DEFAULT_FILTER)).toBeNull()
  })

  it('keeps saturation together with RGB (fixes the upstream overwrite)', () => {
    const m = colorMatrix({ ...DEFAULT_FILTER, saturation: 0, red: 200 })!
    // greyscale rows, red row doubled
    expect(m[0]).toBeCloseTo(0.426)
    expect(m[1]).toBeCloseTo(1.43)
    expect(m[5]).toBeCloseTo(0.213)
    expect(m[18]).toBe(1)
  })

  it('brightness and contrast scale RGB', () => {
    const m = colorMatrix({ ...DEFAULT_FILTER, brightness: 50, contrast: 200 })!
    expect(m[0]).toBeCloseTo(1)
    expect(m[6]).toBeCloseTo(1)
    expect(m[4]).toBe(0)
  })
})

describe('slideshow timer', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('ticks only while enabled and not paused, re-arming itself', () => {
    const ticks: number[] = []
    const timer = new SlideshowTimer(1000, () => ticks.push(Date.now()), () => {})
    timer.pulse()
    vi.advanceTimersByTime(3000)
    expect(ticks).toHaveLength(0)
    timer.start(false)
    vi.advanceTimersByTime(3000)
    expect(ticks).toHaveLength(3)
    timer.pause()
    vi.advanceTimersByTime(3000)
    expect(ticks).toHaveLength(3)
    timer.unpause()
    vi.advanceTimersByTime(3000)
    // unpause alone does not re-arm; the next pulse does
    expect(ticks).toHaveLength(3)
    timer.pulse()
    vi.advanceTimersByTime(1000)
    expect(ticks).toHaveLength(4)
    timer.dispose()
  })

  it('park holds until the next pulse; a video start arms nothing', () => {
    let ticks = 0
    const timer = new SlideshowTimer(500, () => ticks++, () => {})
    timer.start(true)
    vi.advanceTimersByTime(2000)
    expect(ticks).toBe(0)
    timer.pulse()
    vi.advanceTimersByTime(500)
    expect(ticks).toBe(1)
    timer.park()
    vi.advanceTimersByTime(5000)
    expect(ticks).toBe(1)
    timer.stop()
    timer.pulse()
    vi.advanceTimersByTime(5000)
    expect(ticks).toBe(1)
  })

  it('falls back to the default duration below the minimum', () => {
    expect(slideshowDelay(500)).toBe(5000)
    expect(slideshowDelay(2500)).toBe(2500)
  })
})

describe('screensaver', () => {
  it('sends the parental-rating cap and backdrop-only unless photos are included', () => {
    const r = screensaverRequest({ userId: 'u', itemTypes: ['Movie', 'Series'], maxAge: 16 })
    expect(r).toMatchObject({ recursive: true, sortBy: ['Random'], imageTypes: ['Backdrop'], maxOfficialRating: '16', hasParentalRating: true })
    const all = screensaverRequest({ userId: 'u', itemTypes: ['Photo'], maxAge: -1 })
    expect(all.imageTypes).toBeUndefined()
    expect(all.maxOfficialRating).toBeUndefined()
    expect(all.hasParentalRating).toBeUndefined()
  })
})

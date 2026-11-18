import { describe, expect, it } from 'vitest'
import { levenshtein, NO_NAME_SCORE, searchScore, sortByRelevance } from './searchRelevance'

describe('searchScore (SearchRelevance.kt)', () => {
  it('ranks exact < prefix < word start < contains < fuzzy', () => {
    expect(searchScore('Bunny', 'Video', 'bunny')).toBe(0 + 5)
    expect(searchScore('Bunny Hop', 'Video', 'bunny')).toBe(100 + 5)
    expect(searchScore('Big Buck Bunny', 'Video', 'bunny')).toBe(200 + 5)
    expect(searchScore('Bigbunnyland', 'Video', 'bunny')).toBe(300 + 5)
    expect(searchScore('Bunyn', 'Video', 'bunny')).toBe(375 + 5)
    expect(searchScore('Zzzzzzz', 'Video', 'bunny')).toBe(400 + 5)
  })

  it('adds the type bonus', () => {
    expect(searchScore('x', 'Series', 'x')).toBe(0)
    expect(searchScore('x', 'Movie', 'x')).toBe(1)
    expect(searchScore('x', 'BoxSet', 'x')).toBe(2)
    expect(searchScore('x', 'Episode', 'x')).toBe(10)
    expect(searchScore('x', 'Person', 'x')).toBe(5)
  })

  it('scores a missing name as Int.MAX_VALUE without bonus', () => {
    expect(searchScore(null, 'Movie', 'x')).toBe(NO_NAME_SCORE)
  })

  it('uses /regex/ on the lower-cased name (upper-case patterns without i never match)', () => {
    expect(searchScore('Big Buck Bunny', 'Movie', '/b.ck/')).toBe(251)
    expect(searchScore('Big Buck Bunny', 'Movie', '/B.ck/')).toBe(401)
    expect(searchScore('Big Buck Bunny', 'Movie', '/B.ck/i')).toBe(251)
    expect(searchScore('Big Buck Bunny', 'Movie', '/(/')).toBe(401)
  })

  it('handles Hebrew and Japanese names', () => {
    expect(searchScore('שלום עולם', 'Movie', 'עולם')).toBe(201)
    expect(searchScore('となりのトトロ', 'Movie', 'トトロ')).toBe(301)
  })

  it('does not trim the query', () => {
    // ' ' + ' buck' is not in the name; plain contains
    expect(searchScore('Big Buck', 'Movie', ' buck')).toBe(301)
  })
})

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('same', 'same')).toBe(0)
  })
})

describe('sortByRelevance', () => {
  it('is a stable ascending sort', () => {
    const items = [
      { Id: '1', Name: 'Zed', Type: 'Movie' as const },
      { Id: '2', Name: 'Bunny', Type: 'Movie' as const },
      { Id: '3', Name: 'Zed', Type: 'Movie' as const },
      { Id: '4', Name: 'Bunny', Type: 'Series' as const },
    ]
    expect(sortByRelevance(items, 'bunny').map((i) => i.Id)).toEqual(['4', '2', '1', '3'])
  })
})

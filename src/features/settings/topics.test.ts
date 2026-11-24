import { describe, expect, it } from 'vitest'
import { PREFERENCE_DEFAULTS, PREFERENCE_META } from '../../stores/preferences'
import type { VisibilityContext } from './prefModel'
import {
  buildRows,
  buildTopic,
  NAVIGATION_ONLY,
  QUICK_ROWS,
  REGROUPED_SCREENS,
  resolveRow,
  SPECIAL_TITLE_KEYS,
  topicFromParam,
  topicPreview,
  TOPICS,
} from './topics'

const ctx = (over: Partial<VisibilityContext['prefs']> = {}): VisibilityContext => ({
  prefs: { ...PREFERENCE_DEFAULTS, ...over },
  discover: true,
  hdrDisplay: false,
  hdrPage: false,
})

const placed = TOPICS.flatMap((t) => t.sections.flatMap((s) => s.rows))

describe('the subjects of Settings', () => {
  it('give every row of the regrouped upstream screens exactly one home', () => {
    const upstream = PREFERENCE_META.filter((m) => m.screens.some((s) => REGROUPED_SCREENS.includes(s.screen))).map((m) => m.id)
    const missing = upstream.filter((id) => !placed.includes(id) && !NAVIGATION_ONLY.includes(id))
    expect(missing).toEqual([])
    // the rows that are left out only led from one regrouped screen to another
    for (const id of NAVIGATION_ONLY) {
      expect(placed).not.toContain(id)
      expect(PREFERENCE_META.find((m) => m.id === id)?.widget).toBe('destination')
    }
    const twice = placed.filter((id, i) => placed.indexOf(id) !== i)
    expect(twice).toEqual([])
    // and every one of them shows: none is hidden for good by a condition (experimental settings on shows them all)
    const shown = TOPICS.flatMap((t) => buildTopic(t, ctx({ experimentalEnable: true })).flatMap((s) => s.rows.map((r) => r.id)))
    expect(shown).toEqual(placed)
    for (const topic of TOPICS) expect(buildTopic(topic, ctx())[0]?.rows.length, topic.id).toBeGreaterThan(0)
  })

  it('name only rows that exist', () => {
    const known = new Set([...PREFERENCE_META.map((m) => m.id), ...Object.keys(SPECIAL_TITLE_KEYS)])
    expect([...placed, ...QUICK_ROWS].filter((id) => !known.has(id))).toEqual([])
  })

  it('keep every quick row in a subject too: the quick rows are shortcuts', () => {
    expect(QUICK_ROWS.filter((id) => !placed.includes(id))).toEqual([])
    expect(buildRows(QUICK_ROWS, ctx()).map((r) => r.id)).toEqual([...QUICK_ROWS])
  })

  it('show the experimental row under Audio only while experimental settings are on', () => {
    const audio = topicFromParam('audio')!
    expect(buildTopic(audio, ctx()).map((s) => s.titleKey)).toEqual([null])
    expect(resolveRow('PreferAc3ForSurround', ctx())).toBeNull()
    const on = buildTopic(audio, ctx({ experimentalEnable: true }))
    expect(on.map((s) => s.titleKey)).toEqual([null, 'experimental_settings'])
    expect(on[1].rows.map((r) => r.id)).toEqual(['PreferAc3ForSurround'])
  })

  it('preview a subject by the titles of its rows', () => {
    expect(topicPreview(topicFromParam('subtitles')!, ctx())).toEqual(['preferred_subtitle_language', 'subtitle_mode', 'subtitle_style', 'ass_subtitle_playback', 'direct_play_pgs'])
    expect(topicPreview(topicFromParam('subtitles')!, ctx(), 2)).toEqual(['preferred_subtitle_language', 'subtitle_mode'])
    // every key once: the list is keyed by it
    for (const topic of TOPICS) expect(new Set(topicPreview(topic, ctx({ experimentalEnable: true }))).size).toBe(topicPreview(topic, ctx({ experimentalEnable: true })).length)
    expect(topicPreview(topicFromParam('profile')!, ctx(), 4)).toEqual(['profile_protection', 'sign_in_auto', 'quick_connect', 'web_sign_out'])
  })

  it('know their addresses', () => {
    expect(topicFromParam('playback')?.titleKey).toBe('playback')
    expect(topicFromParam('advanced')).toBeNull()
    expect(topicFromParam(undefined)).toBeNull()
  })
})

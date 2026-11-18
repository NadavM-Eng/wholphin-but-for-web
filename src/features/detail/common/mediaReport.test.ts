import type { DeviceProfile } from '@jellyfin/sdk/lib/generated-client/models'
import { describe, expect, it } from 'vitest'
import spec from '../../../../docs/spec/preferences.json'
import { PREFERENCE_DEFAULTS, PREFERENCE_META } from '../../../stores/preferences'
import { buildMediaReport, EXPERIMENTAL_PREFS, PLAYBACK_PREFS } from './mediaReport'

describe('media info report', () => {
  it('has the log header, the playback preferences, the media sources and the device profile (ServerReportService)', () => {
    const body = buildMediaReport({
      header: 'Send media info\nserverVersion=10.11.0',
      prefs: { ...PREFERENCE_DEFAULTS, maxBitrate: 1234 },
      sources: [{ Id: 'src1', Container: 'mkv' }],
      deviceProfile: { Name: 'Wholphin-Web', MaxStreamingBitrate: 1234 } as DeviceProfile,
    })
    const blocks = body.split('\n\n')
    expect(blocks).toHaveLength(5)
    expect(blocks[0]).toBe('Send media info\nserverVersion=10.11.0')
    expect(blocks[1]).toMatch(/^playbackPrefs=/)
    expect(blocks[1]).toContain('maxBitrate: 1234')
    expect(blocks[2]).toMatch(/^experimental=experimentalEnable: /)
    expect(blocks[3]).toBe('mediaSources=[{"Id":"src1","Container":"mkv"}]')
    expect(blocks[4]).toBe('deviceProfile={"Name":"Wholphin-Web","MaxStreamingBitrate":1234}')
  })

  it('an item without media sources reports null, as upstream encodes it', () => {
    const body = buildMediaReport({ header: 'h', prefs: PREFERENCE_DEFAULTS, sources: null, deviceProfile: {} })
    expect(body).toContain('\n\nmediaSources=null\n\n')
  })

  it('lists exactly the web preferences of the playback and experimental protos', () => {
    const prefs: Array<{ kotlinName: string; protoPath?: string | null }> = spec.preferences
    const keysOf = (proto: string) =>
      prefs
        .filter((p) => p.protoPath?.startsWith(`${proto}.`))
        .map((p) => PREFERENCE_META.find((m) => m.id === p.kotlinName)?.key)
        .filter((k): k is NonNullable<typeof k> => !!k)
        .sort()
    expect([...PLAYBACK_PREFS].sort()).toEqual(keysOf('playback_preferences'))
    expect([...EXPERIMENTAL_PREFS].sort()).toEqual(keysOf('experimental_preferences'))
  })
})

// "Send media info log to server" (W/services/ServerReportService.kt `sendMediaReportFor`): the item's media sources,
// the client's playback settings and the device profile the player would send, posted as a client log document
// (`POST /ClientLog/Document`, upstream `api.systemApi.logFile`). The server stores it as a log file and answers with
// its name, shown in a toast. A server that refuses client logs (AllowClientLogUpload off: 403) shows the error toast,
// as upstream's ExceptionHandler(autoToast) does. Installed app-wide by app/startup (dynamic import: the report
// needs the playback engine's capability probe).
import type { BaseItemDto, DeviceProfile, MediaSourceInfo } from '@jellyfin/sdk/lib/generated-client/models'
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api'
import { getSystemApi } from '@jellyfin/sdk/lib/utils/api/system-api'
import { getSession } from '../../../api/session'
import { toast } from '../../../app/toast'
import { i18next } from '../../../i18n'
import { getPrefs, type PreferenceKey, type Preferences } from '../../../stores/preferences'
import { detectCapabilities } from '../../playback/engine/capabilities'
import { buildDeviceProfile, profileOptionsFromPrefs } from '../../playback/engine/deviceProfile'
import { buildLogHeader } from '../../settings/debugInfo'

/** The preferences upstream keeps in `playbackPreferences` (proto path playback_preferences.*) that the web has. */
export const PLAYBACK_PREFS: readonly PreferenceKey[] = [
  'skipForward',
  'skipBack',
  'skipBackOnResume',
  'showNextUpTiming',
  'autoPlayNextUp',
  'autoPlayNextDelay',
  'passOutProtection',
  'oneClickPause',
  'controllerTimeout',
  'cinemaMode',
  'globalContentScale',
  'dpadSeekMode',
  'maxResolution',
  'maxBitrate',
  'playbackDebugInfo',
  'downMixStereo',
  'ac3Supported',
  'assSubtitleMode',
  'directPlayPgs',
  'decodeAv1',
  'hdr10Override',
  'hdr10PlusOverride',
  'doviProfile5Override',
  'doviProfile7Override',
  'doviProfile8Override',
  'skipIntros',
  'skipOutros',
  'skipCommercials',
  'skipPreviews',
  'skipRecaps',
  'seekBarSteps',
]

/** `experimentalPreferences` (proto path experimental_preferences.*). */
export const EXPERIMENTAL_PREFS: readonly PreferenceKey[] = ['experimentalEnable', 'preferAc3ForSurround']

/** `toStringOneLine()`: "key: value, key: value". */
function oneLine(prefs: Preferences, keys: readonly PreferenceKey[]): string {
  return keys.map((k) => `${k}: ${JSON.stringify(prefs[k])}`).join(', ')
}

export type MediaReportParts = {
  /** `buildLogHeader("Send media info")`. */
  header: string
  prefs: Preferences
  sources: MediaSourceInfo[] | null
  deviceProfile: DeviceProfile
}

/** The report body, in upstream's order: header, playbackPrefs, experimental, mediaSources, deviceProfile. */
export function buildMediaReport({ header, prefs, sources, deviceProfile }: MediaReportParts): string {
  return [
    header,
    `playbackPrefs=${oneLine(prefs, PLAYBACK_PREFS)}`,
    `experimental=${oneLine(prefs, EXPERIMENTAL_PREFS)}`,
    `mediaSources=${JSON.stringify(sources)}`,
    `deviceProfile=${JSON.stringify(deviceProfile)}`,
  ].join('\n\n')
}

/**
 * Fetches the sources when the menu's copy has none, sends the report and toasts the server's file name
 * ("Sent! Filename=…") or the error.
 */
export async function sendMediaReport(item: BaseItemDto): Promise<void> {
  const session = getSession()
  if (!session || !item.Id) return
  try {
    const sources =
      item.MediaSources ??
      (await getLibraryApi(session.api).getItem({ itemId: item.Id, userId: session.user.id })).data.MediaSources ??
      null
    const prefs = getPrefs()
    const body = buildMediaReport({
      header: buildLogHeader('Send media info', session.server.version),
      prefs,
      sources,
      deviceProfile: buildDeviceProfile(await detectCapabilities(), profileOptionsFromPrefs(prefs, session.server.version)),
    })
    const res = await getSystemApi(session.api).logFile({ body: new File([body], 'wholphin-web-media.log', { type: 'text/plain' }) })
    toast(i18next.t('web_report_sent', { p1: res.data.FileName ?? '' }))
  } catch (e) {
    // ExceptionHandler.kt (autoToast): "Error: <message>", long
    toast(`${i18next.t('error')}: ${e instanceof Error ? e.message : String(e)}`, { long: true })
  }
}

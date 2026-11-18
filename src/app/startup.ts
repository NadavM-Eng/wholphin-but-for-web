import { initSession } from '../api/session'
import { setItemMenuHandlers } from '../features/common/itemMenuHandlers'
import { installClientLog } from '../features/settings/clientLog'
import { initI18n } from '../i18n'
import { deleteChosenStreams } from '../stores/playbackChoices'
import { bindPrefsToSession, getPref } from '../stores/preferences'
import { initScale } from '../theme/scale'
import { bindPreferenceEffects } from './applyPreferences'
import { installModalityTracking } from './shell/shellFocus'
import { initSpatialNav } from './spatialNav'

/**
 * App start (MainActivityViewModel.appStart): scale, preferences side effects, i18n, keyboard navigation,
 * then the session restore runs in the background while RootLayout shows a spinner.
 */
export async function startApp(): Promise<void> {
  // index.html's feature test found a browser below the supported baseline and shows its notice instead.
  if (document.documentElement.hasAttribute('data-unsupported')) return new Promise<void>(() => {})
  initScale()
  bindPrefsToSession()
  // the Debug page's log and "Send app logs" see the whole session, not only what came after opening them
  installClientLog()
  bindPreferenceEffects()
  initSpatialNav()
  // "Clear track choices" forgets the saved audio/subtitle picks (ItemPlaybackRepository.deleteChosenStreams);
  // a detail page that shows the choices may install its own handler that also refreshes its view.
  // "Send media info log to server" (ServerReportService.sendMediaReportFor).
  setItemMenuHandlers({
    clearTrackChoices: (item) => deleteChosenStreams(item),
    sendMediaInfoLog: (item) => void import('../features/detail/common/mediaReport').then((m) => m.sendMediaReport(item)),
  })
  // input modality (highlight owner, last input, overlay openers) for every route, not only the shell
  installModalityTracking()
  await initI18n(getPref('userInterfaceLanguage'))
  void initSession({ signInAutomatically: getPref('signInAuto') })
}

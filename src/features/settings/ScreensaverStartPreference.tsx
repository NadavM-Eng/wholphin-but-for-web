import { ClickPreference } from './ClickPreference'
import { startScreensaver, useScreensaverAvailable } from './screensaverEvents'

/** "Start screensaver" (PreferencesContent.kt): hidden until a screensaver has registered to handle it. */
export function ScreensaverStartPreference({ id, title, summary }: { id: string; title: string; summary?: string }) {
  const available = useScreensaverAvailable()
  if (!available) return null
  return <ClickPreference id={id} title={title} summary={summary} onClick={startScreensaver} />
}

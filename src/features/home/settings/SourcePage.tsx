import type { Translate } from '../../../lib/format'
import { FaIcon } from '../../../ui'
import styles from './HomeSettings.module.css'
import { SettingsListItem } from './SettingsListItem'

type Props = {
  t: Translate
  pluginActive: boolean
  onLoadServer: () => void
  onLoadPlugin: () => void
  onLoadWeb: () => void
  onReset: () => void
}

/**
 * `HomeSettingsSourcePage` (centered "Settings" title, 8dp spaced list): load from the server user profile,
 * from the server plugin (only when installed), from the web client, or reset. The page asks for
 * confirmation first. There is no Save entry: saving only happens through the Save dialog on Back.
 */
export function SourcePage({ t, pluginActive, onLoadServer, onLoadPlugin, onLoadWeb, onReset }: Props) {
  return (
    <>
      <h2 className={styles.titleSource}>{t('settings')}</h2>
      <div className={styles.listGap}>
        <SettingsListItem headline={t('load_from_server')} leading={<FaIcon name="cloud_arrow_down" />} onClick={onLoadServer} />
        {pluginActive && <SettingsListItem headline={t('load_from_server_plugin')} leading={<FaIcon name="download" />} onClick={onLoadPlugin} />}
        <SettingsListItem headline={t('load_from_web_client')} leading={<FaIcon name="download" />} onClick={onLoadWeb} />
        <SettingsListItem headline={t('reset')} leading={<FaIcon name="arrows_rotate" />} onClick={onReset} />
      </div>
    </>
  )
}

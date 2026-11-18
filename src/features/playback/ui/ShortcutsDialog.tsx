import { useTranslation } from 'react-i18next'
import { plainT } from './text'
import { Button } from '../../../ui'
import { SHORTCUT_SHEET } from './keymap'
import { PlayerSheet } from './PlayerSheet'
import styles from './ShortcutsDialog.module.css'

/** Web addition: the "?" sheet listing the player's keyboard shortcuts. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = plainT(useTranslation().t)
  return (
    <PlayerSheet label={t('web_shortcut_title')} placement="center" surface={3} onClose={onClose} className={styles.panel}>
      <div className={styles.title}>{t('web_shortcut_title')}</div>
      <dl className={styles.list}>
        {SHORTCUT_SHEET.map((s) => (
          <div key={s.label} className={styles.row}>
            <dt className={styles.keys}>
              {s.keys.map((k) => (
                <kbd key={k} className={styles.kbd}>
                  {k}
                </kbd>
              ))}
            </dt>
            <dd className={styles.desc}>{t(s.label)}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.actions}>
        <Button onClick={onClose} variant="text">
          {t('web_close')}
        </Button>
      </div>
    </PlayerSheet>
  )
}

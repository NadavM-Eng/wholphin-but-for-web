import { useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { CLIENT_NAME, CLIENT_VERSION } from '../../api/session'
import { Dialog } from '../../ui'
import { UPSTREAM, upstreamLabel } from './debugInfo'
import { FullPage } from './FullPage'
import { LICENSE_EXCEPTION } from './licenseException'
import { licenseChipColor } from './licenseColors'
import styles from './LicensePage.module.css'
import licenses from './licenses.gen.json'

type Entry = (typeof licenses)[number]

const chipStyle = (license: string) => ({ '--chip': licenseChipColor(license) }) as CSSProperties

/**
 * License information (Destination.License; upstream LicenseInfo -> AboutLibraries' LibrariesContainer):
 * this app's GPL notice and the upstream attribution, the project's additional permission for Apache-2.0
 * libraries (the root LICENSE-EXCEPTION.md), then every bundled third-party package drawn like the library's
 * rows (name and version, author, license badge); selecting one shows the license text. The list is generated
 * by tools/gen-licenses.ts.
 */
export default function LicensePage() {
  const { t } = useTranslation()
  const [open, setOpen] = useState<Entry | null>(null)
  const upstream = upstreamLabel()
  return (
    <FullPage title={t('license_info')}>
      <section className={styles.notice}>
        <h2 className={styles.heading}>{`${CLIENT_NAME} ${CLIENT_VERSION}`}</h2>
        {/* the web-only notices have no translation: dir="auto" keeps English punctuation in place under RTL */}
        <p dir="auto">{t('web_gpl_notice')}</p>
        <p dir="auto">
          {t('web_upstream_attribution')}{' '}
          <a className={styles.link} href={UPSTREAM.repository} target="_blank" rel="noreferrer" data-focusable>
            {UPSTREAM.repository}
          </a>
          {upstream ? ` (${upstream})` : ''}
        </p>
        <p dir="auto">
          <a className={styles.link} href="https://www.gnu.org/licenses/old-licenses/gpl-2.0.html" target="_blank" rel="noreferrer" data-focusable>
            GNU General Public License v2.0
          </a>
        </p>
      </section>
      <section className={styles.notice} data-license-exception>
        <h2 className={styles.heading}>{t('web_license_exception')}</h2>
        {LICENSE_EXCEPTION.map((block, i) =>
          block.kind === 'heading' ? (
            <h3 key={i} className={styles.subheading} dir="auto">
              {block.text}
            </h3>
          ) : (
            <p key={i} dir="auto">
              {block.text}
            </p>
          ),
        )}
      </section>
      <h2 className={styles.heading}>{t('web_third_party')}</h2>
      <div className={styles.list} data-focus-group>
        {licenses.map((e) => (
          <button key={`${e.name}@${e.version}`} type="button" className={styles.row} data-focusable onClick={() => setOpen(e)}>
            <span className={styles.head}>
              {/* package names and authors are Latin identifiers: isolate them so "@scope/name" keeps its order in RTL */}
              <span className={styles.name}>
                <bdi>{e.name}</bdi>
              </span>
              {e.version && (
                <span className={styles.version} dir="ltr">
                  {e.version}
                </span>
              )}
            </span>
            {e.author && (
              <span className={styles.author}>
                <bdi>{e.author}</bdi>
              </span>
            )}
            <span className={styles.badges}>
              <span className={styles.chip} style={chipStyle(e.license)}>
                {e.license}
              </span>
            </span>
          </button>
        ))}
      </div>
      <Dialog open={open != null} onClose={() => setOpen(null)} variant="scrollable" label={open?.name}>
        {open && (
          <>
            <h2 className={styles.heading}>{`${open.name} ${open.version}`}</h2>
            <p className={styles.chipRow}>
              <span className={styles.chip} style={chipStyle(open.license)}>
                {open.license}
              </span>
            </p>
            {open.url && (
              <a className={styles.link} href={open.url} target="_blank" rel="noreferrer" data-focusable dir="ltr">
                {open.url}
              </a>
            )}
            {open.text ? <pre className={styles.text}>{open.text}</pre> : <p>{t('web_license_text_missing')}</p>}
          </>
        )}
      </Dialog>
    </FullPage>
  )
}

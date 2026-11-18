import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { nav } from './nav'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <section style={{ padding: '2rem', display: 'grid', gap: '1rem', justifyItems: 'start' }}>
      <h1 className="t-headlineSmall">{t('web_not_found')}</h1>
      <Link className="t-labelLarge" data-focusable to={nav.home()}>
        {t('web_go_home')}
      </Link>
    </section>
  )
}

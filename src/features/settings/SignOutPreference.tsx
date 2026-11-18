import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { nav } from '../../app/nav'
import { signOut } from '../../api/session'
import { ClickPreference } from './ClickPreference'

/**
 * Web-only "Sign out" row (upstream has no sign-out UI: a TV stays signed in; a browser may be shared).
 * Revokes the token on the server, forgets it locally and shows the user list.
 */
export function SignOutPreference() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <ClickPreference
      id="WebSignOut"
      title={t('web_sign_out')}
      onClick={() => void signOut().then(() => navigate(nav.users(), { replace: true }))}
    />
  )
}

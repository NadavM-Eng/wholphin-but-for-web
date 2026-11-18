import { useLocation, useSearchParams } from 'react-router'
import { SwitchUserScreen } from './SwitchUserScreen'

/**
 * /setup/users and /setup/login?username&mode=password&next: Select User for the selected (or preset)
 * server (upstream SetupDestination.UserList), with the login dialog open on /setup/login (upstream draws it
 * over SwitchUserContent). Both routes resolve to this one component (LoginPage re-exports it), so opening
 * and closing the dialog keeps the picker mounted: no refetch, and focus returns to the clicked circle.
 * Quick Connect first when the server enables it, unless mode=password.
 */
export default function SwitchUserPage() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const login = /\/login\/?$/.test(pathname)
    ? { username: params.get('username') ?? '', password: params.get('mode') === 'password' }
    : null
  return <SwitchUserScreen login={login} />
}

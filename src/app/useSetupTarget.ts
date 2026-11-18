import { getAppConfig } from '../api/config'
import { useSessionStore } from '../stores/session'

/** Where a signed-out visitor must go: user list when a server is chosen (or preset), else the server list. */
export function useSetupTarget(): 'users' | 'servers' {
  const selected = useSessionStore((s) => s.selectedServerId)
  return selected || getAppConfig().serverUrl ? 'users' : 'servers'
}

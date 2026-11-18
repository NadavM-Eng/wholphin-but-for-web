import { useQuery } from '@tanstack/react-query'
import { getAppConfig } from '../../api/config'
import { ensurePresetServer } from '../../api/session'
import { useSessionStore, type SavedServer } from '../../stores/session'

/**
 * The server the user list / login screens act on: the preset server (config.json) or the selected one.
 * In preset mode an unreachable server is retried through the query.
 */
export function useSetupServer(): { server: SavedServer | null; presetPending: boolean; presetError: boolean; retry: () => void } {
  const preset = !!getAppConfig().serverUrl
  const presetId = useSessionStore((s) => s.presetServerId)
  const selectedId = useSessionStore((s) => s.selectedServerId)
  const servers = useSessionStore((s) => s.servers)
  const presetQuery = useQuery({
    queryKey: ['setup', 'preset'],
    queryFn: ensurePresetServer,
    enabled: preset && !presetId,
    retry: false,
  })
  const id = preset ? presetId : selectedId
  return {
    server: id ? (servers[id] ?? null) : null,
    presetPending: preset && !presetId && presetQuery.isFetching,
    presetError: preset && !presetId && !presetQuery.isFetching,
    retry: () => void presetQuery.refetch(),
  }
}

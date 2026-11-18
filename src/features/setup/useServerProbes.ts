import type { PublicSystemInfo } from '@jellyfin/sdk/lib/generated-client/models'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getPublicSystemInfo, type SavedServer } from '../../api/session'
import { classifyServerVersion, type ServerVersionSupported } from '../../lib/serverVersion'

/** Upstream `ServerConnectionStatus` (ServerList.kt:41-51). */
export type ServerConnection =
  | { kind: 'pending' }
  | { kind: 'success'; info: PublicSystemInfo }
  | { kind: 'error'; message: string }

export interface ServerProbe {
  connection: ServerConnection
  versionSupported: ServerVersionSupported
}

const PENDING: ServerProbe = { connection: { kind: 'pending' }, versionSupported: 'UNKNOWN' }

function toProbe(connection: ServerConnection): ServerProbe {
  return {
    connection,
    // updateServerState: a missing version on a reachable server is NOT_SUPPORTED; no answer is UNKNOWN.
    versionSupported: connection.kind === 'success' ? classifyServerVersion(connection.info.Version, 'NOT_SUPPORTED') : 'UNKNOWN',
  }
}

/**
 * SwitchServerViewModel.init / internalTestServer: probes every saved server with
 * `GET /System/Info/Public` (6 s timeout) and tracks Pending / Success / Error per server id.
 */
export function useServerProbes(servers: SavedServer[]) {
  const [probes, setProbes] = useState<Record<string, ServerProbe>>({})
  const generation = useRef<Record<string, number>>({})
  const mounted = useRef(true)

  const probe = useCallback(async (server: SavedServer): Promise<ServerConnection> => {
    const gen = (generation.current[server.id] ?? 0) + 1
    generation.current[server.id] = gen
    setProbes((p) => ({ ...p, [server.id]: PENDING }))
    let connection: ServerConnection
    try {
      connection = { kind: 'success', info: await getPublicSystemInfo(server.url) }
    } catch (err) {
      connection = { kind: 'error', message: err instanceof Error ? err.message : String(err) }
    }
    if (mounted.current && generation.current[server.id] === gen) {
      setProbes((p) => ({ ...p, [server.id]: toProbe(connection) }))
    }
    return connection
  }, [])

  const latest = useRef(servers)
  useEffect(() => {
    latest.current = servers
  })
  // Re-run only when the set of servers changes (a new one was added).
  const ids = servers.map((s) => s.id).join(',')
  useEffect(() => {
    mounted.current = true
    for (const s of latest.current) {
      if (generation.current[s.id] == null) void probe(s)
    }
    return () => {
      mounted.current = false
    }
  }, [ids, probe])

  const get = (id: string): ServerProbe => probes[id] ?? PENDING
  return { get, probe }
}

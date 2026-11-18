import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { getAppConfig } from '../../api/config'
import { removeServer, selectServer, type SavedServer } from '../../api/session'
import { nav } from '../../app/nav'
import { toast } from '../../app/toast'
import { sortedServers, useSessionStore } from '../../stores/session'
import {
  ContextMenu,
  contextMenuPoint,
  FaIcon,
  MaterialIcon,
  ServerCircleCard,
  type DialogEntry,
  type MenuPoint,
  type ServerStatus,
} from '../../ui'
import { AddServerDialog } from './AddServerDialog'
import styles from './setup.module.css'
import { SetupFrame } from './SetupFrame'
import { serverSupportedMessage } from '../../lib/serverVersion'
import { focusInitialCard, safeNext } from './setupHelpers'
import { useServerProbes, type ServerProbe } from './useServerProbes'

function cardStatus(p: ServerProbe): ServerStatus {
  // Upstream checks `Error || versionSupported != SUPPORTED` first, so a probing server shows the warning
  // (ServerList.kt:171-220); the spinner it never reaches is shown instead while the probe runs.
  if (p.connection.kind === 'pending') return 'pending'
  if (p.connection.kind === 'error') return 'error'
  return p.versionSupported === 'SUPPORTED' ? 'ok' : 'unsupported'
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Select Server (SwitchServerContent + SwitchServerViewModel): saved servers as circles with live status,
 * Add Server last, long-press / right-click menu (Switch servers, Delete), version or connection message of
 * the focused server at the bottom. Preset deployments (/config.json serverUrl) never show this page.
 */
export default function ServerListPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const serverMap = useSessionStore((s) => s.servers)
  const recentServerId = useSessionStore((s) => s.mostRecent.serverId)
  const servers = useMemo(() => sortedServers(serverMap), [serverMap])
  const { get, probe } = useServerProbes(servers)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [menu, setMenu] = useState<{ server: SavedServer; point: MenuPoint | null } | null>(null)
  const row = useRef<HTMLDivElement>(null)
  const preset = !!getAppConfig().serverUrl

  // Initial focus on the first card (the Add Server card when there are none).
  // After a delete (upstream removeServer -> init(), whose LaunchedEffect(loading) refocuses) as well.
  const [focusFirst, setFocusFirst] = useState(0)
  useEffect(() => {
    focusInitialCard(row.current)
  }, [focusFirst])

  if (preset) return <Navigate to={nav.users(next)} replace />

  const switchServer = async (server: SavedServer) => {
    const result = await probe(server)
    if (result.kind === 'success') {
      selectServer({ ...server, name: result.info.ServerName ?? server.name, version: result.info.Version ?? server.version })
      void navigate(nav.users(next))
    } else if (result.kind === 'error') {
      toast(t('web_error_connecting', { p1: result.message }), { long: true })
    }
  }

  const testServer = async (server: SavedServer) => {
    await sleep(500)
    const result = await probe(server)
    if (result.kind === 'success') toast(t('success'))
    else if (result.kind === 'error') toast(result.message)
  }

  const onCardClick = (server: SavedServer) => {
    const c = get(server.id).connection
    if (c.kind === 'success') void switchServer(server)
    else if (c.kind === 'error') void testServer(server)
  }

  const focused = focusedIndex >= 0 ? servers[focusedIndex] : undefined
  let message: string | null = null
  if (focused) {
    const p = get(focused.id)
    if (p.connection.kind === 'success') message = serverSupportedMessage(t, p.versionSupported, p.connection.info.Version)
    else if (p.connection.kind === 'error') message = p.connection.message
  }

  const menuItems = (server: SavedServer): DialogEntry[] => [
    {
      key: 'switch',
      headline: t('switch_servers'),
      leading: <FaIcon name="arrow_left_arrow_right" size={20} />,
      onSelect: () => void switchServer(server),
    },
    {
      key: 'delete',
      headline: t('delete'),
      leading: <MaterialIcon name="delete" />,
      leadingColor: 'var(--fx-delete-red)',
      onSelect: () => {
        removeServer(server.id)
        setFocusedIndex(0)
        setFocusFirst((n) => n + 1)
      },
    },
  ]

  return (
    <>
      <SetupFrame
        title={t('select_server')}
        subtitle={null}
        message={message}
        animateMessage
        dimmed={showAdd || menu?.point === null}>
        <div ref={row} className={styles.circles} data-focus-group>
          {servers.map((s, i) => {
            const p = get(s.id)
            const name = s.name?.trim() ? s.name : s.url
            return (
              <div
                key={s.id}
                onFocus={() => setFocusedIndex(i)}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setFocusedIndex(i)}
              >
                <ServerCircleCard
                  id={s.id}
                  name={name}
                  status={cardStatus(p)}
                  statusLabel={p.connection.kind === 'error' ? p.connection.message : undefined}
                  isCurrent={s.id === recentServerId}
                  onClick={() => onCardClick(s)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setMenu({ server: s, point: contextMenuPoint(e) })
                  }}
                  onMore={() => setMenu({ server: s, point: null })}
                  moreLabel={t('more')}
                  surfaceProps={{ 'data-testid': 'server-card', 'data-server-url': s.url }}
                />
              </div>
            )
          })}
          <div onFocus={() => setFocusedIndex(-1)}>
            <ServerCircleCard
              add
              name={t('add_server')}
              onClick={() => setShowAdd(true)}
              surfaceProps={{ 'data-testid': 'add-server' }}
            />
          </div>
        </div>
        <div className={styles.switchSpacer} aria-hidden />
      </SetupFrame>
      {menu && (
        <ContextMenu
          open
          title={menu.server.name ?? menu.server.url}
          items={menuItems(menu.server)}
          point={menu.point}
          onClose={() => setMenu(null)}
        />
      )}
      <AddServerDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={(server) => {
          // addAndChangeServer + navigate to UserList(server)
          setShowAdd(false)
          selectServer(server)
          void navigate(nav.users(next))
        }}
      />
    </>
  )
}

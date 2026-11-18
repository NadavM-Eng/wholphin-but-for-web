import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { getAppConfig } from '../../api/config'
import { getUserImageUrl } from '../../api/images'
import {
  clearSelectedServer,
  getPublicSystemInfo,
  getPublicUsers,
  getQuickConnectEnabled,
  needsLogin,
  needsPin,
  removeUser,
  SessionError,
  signOut,
  switchUser,
  type SavedUser,
} from '../../api/session'
import { LoadingScreen } from '../../app/LoadingScreen'
import { nav } from '../../app/nav'
import { toast } from '../../app/toast'
import { normalizeId } from '../../lib/ids'
import { useSessionStore } from '../../stores/session'
import {
  Button,
  CircularProgress,
  ContextMenu,
  contextMenuPoint,
  ErrorMessage,
  FaIcon,
  MaterialIcon,
  ServerCircleCard,
  UserCircleCard,
  type DialogEntry,
  type MenuPoint,
} from '../../ui'
import { LoginDialog } from './LoginDialog'
import { PinEntryDialog } from './PinEntryDialog'
import { ProfileProtectionDialog } from './ProfileProtectionDialog'
import styles from './setup.module.css'
import { SetupFrame } from './SetupFrame'
import { classifyServerVersion, serverSupportedMessage } from '../../lib/serverVersion'
import { errorDetail, focusInitialCard, safeNext, sessionErrorMessage } from './setupHelpers'
import { useSetupServer } from './useSetupServer'

/** A circle on the user picker (upstream JellyfinUserAndImage): saved users are `known`. */
interface ListedUser {
  id: string
  name: string | null
  imageTag: string | null
  /** the saved row; null for a public user that was never signed in here */
  saved: SavedUser | null
}

/** Login dialog request carried by the /setup/login route. */
export interface LoginRequest {
  username: string
  password: boolean
}

/** History state marking a /setup/login entry pushed from the user list (dismiss = go back). */
interface FromListState {
  fromList?: boolean
}

/**
 * Select User (SwitchUserContent + UserList + SwitchUserViewModel): saved users of the server plus its
 * public users, Add User, Switch servers, the server-version message, and the login / PIN dialogs.
 * `login` set = the /setup/login route: the same screen with the login dialog open.
 */
export function SwitchUserScreen({ login }: { login: LoginRequest | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { server, presetPending, presetError, retry } = useSetupServer()
  const preset = !!getAppConfig().serverUrl
  const allUsers = useSessionStore((s) => s.users)
  const current = useSessionStore((s) => s.current)
  const authExpired = useSessionStore((s) => s.authExpired)
  const [pinUser, setPinUser] = useState<SavedUser | null>(null)
  const [protectUser, setProtectUser] = useState<SavedUser | null>(null)
  const [menu, setMenu] = useState<{ user: ListedUser; point: MenuPoint | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const row = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // getUsers() then checkServerVersion(): either failing puts the page in its error state.
  const usersQuery = useQuery({
    queryKey: ['setup', server?.id ?? null, 'users'],
    queryFn: async () => {
      const publicUsers = await getPublicUsers(server!)
      const info = await getPublicSystemInfo(server!.url)
      return { publicUsers, version: info.Version ?? null }
    },
    enabled: !!server,
    retry: false,
    staleTime: 0,
  })
  const qcEnabled = useQuery({
    queryKey: ['setup', server?.id ?? null, 'quickConnectEnabled'],
    queryFn: () => getQuickConnectEnabled(server!),
    enabled: !!server,
    staleTime: 30_000,
  })

  useEffect(() => {
    // read-and-clear from the store so StrictMode's double effect run shows one toast
    if (authExpired && useSessionStore.getState().authExpired) {
      useSessionStore.setState({ authExpired: false })
      toast(t('login_credentials_expired'), { long: true })
    }
  }, [authExpired, t])

  const loaded = usersQuery.isSuccess
  const didInitialFocus = useRef(false)
  const [focusFirst, setFocusFirst] = useState(0)
  useEffect(() => {
    // Initial focus on the first user, once, when no dialog is open. A list without users focuses nothing, as
    // upstream (UserList.kt requests focus only `if (users.isNotEmpty())`; refshots 01-setup-user-list-empty):
    // the first arrow key then lands on the Add User card.
    // Closing a login dialog opened from the list leaves focus to the dialog, which returns it to the opener.
    if (!loaded || login || didInitialFocus.current) return
    didInitialFocus.current = true
    if (row.current?.querySelector('[data-testid="user-card"]')) focusInitialCard(row.current)
  }, [loaded, login])
  useEffect(() => {
    // After a delete the focused circle is gone: back to the first one (upstream re-inits the list).
    if (focusFirst) focusInitialCard(row.current)
  }, [focusFirst])

  const users = useMemo<ListedUser[]>(() => {
    if (!server) return []
    const saved = Object.values(allUsers).filter((u) => u.serverId === server.id)
    const known = new Set(saved.map((u) => u.id))
    const listed: ListedUser[] = saved.map((u) => ({ id: u.id, name: u.name, imageTag: u.primaryImageTag, saved: u }))
    const publicTags = new Map<string, string | null>()
    for (const p of usersQuery.data?.publicUsers ?? []) {
      const id = normalizeId(p.Id)
      if (!id) continue
      publicTags.set(id, p.PrimaryImageTag ?? null)
      if (known.has(id)) continue
      listed.push({ id, name: p.Name ?? null, imageTag: p.PrimaryImageTag ?? null, saved: null })
    }
    // A saved user's avatar may have changed since sign-in: prefer the server's current tag when listed.
    for (const u of listed) if (u.saved && publicTags.has(u.id)) u.imageTag = publicTags.get(u.id) ?? null
    return listed
  }, [server, allUsers, usersQuery.data])

  if (presetPending) return <LoadingScreen />
  if (presetError) {
    return (
      <div className={styles.errorBlock} style={{ minHeight: '100dvh', justifyContent: 'center' }}>
        <ErrorMessage title={t('web_error_title')} message={t('web_preset_server_unreachable', { p1: getAppConfig().serverUrl })} />
        <Button onClick={retry}>{t('retry')}</Button>
      </div>
    )
  }
  if (!server) return <Navigate to={nav.servers(next)} replace />

  // Upstream clears the back stack at Home after a sign-in. A login dialog opened from the list sits on its own
  // entry above the list's: step back onto the list entry first, then replace it, so Back from Home does not
  // return to the user list.
  const finish = () => {
    const target = next ?? nav.home()
    if (login && (location.state as FromListState | null)?.fromList) {
      window.addEventListener('popstate', () => void navigate(target, { replace: true }), { once: true })
      void navigate(-1)
    } else void navigate(target, { replace: true })
  }

  const openLogin = (username: string, password = false) => {
    setPinUser(null)
    setProtectUser(null)
    setMenu(null)
    const state: FromListState = { fromList: true }
    void navigate(nav.login({ username, password, next }), { replace: !!login, state: login ? location.state : state })
  }
  const closeLogin = () => {
    if ((location.state as FromListState | null)?.fromList) void navigate(-1)
    else void navigate(nav.users(next), { replace: true })
  }

  // trySwitchUser (SwitchUserViewModel.kt:131-165, SwitchUserContent.kt:89-105)
  const trySwitchUser = async (user: SavedUser) => {
    setBusy(true)
    try {
      await switchUser(server, user)
      setPinUser(null)
      finish()
    } catch (err) {
      const kind = err instanceof SessionError ? err.kind : null
      if (kind === 'forbidden') {
        toast(t('login_not_authorized'), { long: true })
      } else {
        toast(kind === 'expired' ? t('login_credentials_expired') : (errorDetail(t, err) ?? sessionErrorMessage(t, err)), {
          long: true,
        })
        openLogin(user.name ?? '')
      }
    } finally {
      setBusy(false)
    }
  }

  const onSwitchUser = (u: ListedUser) => {
    if (busy) return
    const saved = u.saved
    if (!saved || needsLogin(saved)) openLogin(u.name ?? '')
    else if (needsPin(saved)) setPinUser(saved)
    else void trySwitchUser(saved)
  }

  const menuItems = (u: ListedUser): DialogEntry[] => {
    const items: DialogEntry[] = [
      {
        key: 'switch',
        headline: t('switch_user'),
        leading: <FaIcon name="arrow_left_arrow_right" size={20} />,
        onSelect: () => onSwitchUser(u),
      },
    ]
    const saved = u.saved
    // Web addition: the protection choice upstream keeps in Settings, for saved users that can already be
    // opened without a server login (a PIN must be typed before it can be changed; see ProfileProtectionDialog).
    if (saved?.accessToken && !saved.requireLogin) {
      items.push({
        key: 'protect',
        headline: t('profile_protection'),
        leading: <FaIcon name="user" size={20} />,
        onSelect: () => setProtectUser(saved),
      })
    }
    // Web addition: sign a user with a saved token out (revoke and forget the token) and stay on this list. The
    // drawer's profile entry leaves the current user before showing this list, so any saved token qualifies.
    if (saved?.accessToken) {
      items.push({
        key: 'signout',
        headline: t('web_sign_out'),
        leading: <FaIcon name="circle_xmark" size={20} />,
        onSelect: () => {
          void signOut({ server, user: saved }).then(() => setFocusFirst((n) => n + 1))
        },
      })
    }
    if (saved) {
      items.push({
        key: 'delete',
        headline: t('delete'),
        leading: <MaterialIcon name="delete" />,
        leadingColor: 'var(--fx-delete-red)',
        onSelect: () => {
          removeUser(server.id, saved.id)
          setFocusFirst((n) => n + 1)
        },
      })
    }
    return items
  }

  const version = usersQuery.data?.version
  const message = loaded ? serverSupportedMessage(t, classifyServerVersion(version, 'UNKNOWN'), version) : null
  const dialogOpen = !!login || !!pinUser || !!protectUser || menu?.point === null
  const qcReady = !qcEnabled.isPending

  return (
    <>
      <SetupFrame title={t('select_user')} subtitle={server.name ?? server.url} message={message} dimmed={dialogOpen}>
        {usersQuery.isPending ? (
          <div className={styles.loading}>
            <CircularProgress size={48} label={t('loading')} />
          </div>
        ) : usersQuery.isError ? (
          <div className={styles.errorBlock}>
            <ErrorMessage title={t('web_error_title')} message={sessionErrorMessage(t, usersQuery.error)} detail={errorDetail(t, usersQuery.error)} />
            <Button onClick={() => void usersQuery.refetch()}>{t('retry')}</Button>
          </div>
        ) : (
          <div ref={row} className={styles.circles} data-focus-group>
            {users.map((u) => (
              <UserCircleCard
                key={u.id}
                id={u.id}
                name={u.name ?? u.id}
                imageSrc={u.imageTag ? getUserImageUrl(server.url, u.id, u.imageTag) : null}
                isCurrent={!!current && current.server.id === server.id && current.user.id === u.id}
                onClick={() => onSwitchUser(u)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ user: u, point: contextMenuPoint(e) })
                }}
                onMore={() => setMenu({ user: u, point: null })}
                moreLabel={t('more')}
                surfaceProps={{ 'data-testid': 'user-card', 'data-user-name': u.name ?? u.id, 'data-known': !!u.saved }}
              />
            ))}
            <ServerCircleCard add name={t('add_user')} onClick={() => openLogin('')} surfaceProps={{ 'data-testid': 'add-user' }} />
          </div>
        )}
        {!preset ? (
          <div className={styles.switchRow}>
            <Button
              className={styles.switchButton}
              onClick={() => {
                clearSelectedServer()
                void navigate(nav.servers(next))
              }}
            >
              <FaIcon name="arrow_left_arrow_right" className={styles.switchIcon} />
              {t('switch_servers')}
            </Button>
          </div>
        ) : (
          <div className={styles.switchSpacer} aria-hidden />
        )}
      </SetupFrame>
      {menu && (
        <ContextMenu
          open
          title={menu.user.name ?? menu.user.id}
          items={menuItems(menu.user)}
          point={menu.point}
          onClose={() => setMenu(null)}
        />
      )}
      {login && qcReady && (
        <LoginDialog
          key={`${login.username}|${login.password}`}
          server={server}
          initialUsername={login.username}
          quickConnect={!login.password && qcEnabled.data === true}
          onClose={closeLogin}
          onSuccess={finish}
          onQuickConnectRejected={() =>
            queryClient.setQueryData(['setup', server.id, 'quickConnectEnabled'], false)
          }
        />
      )}
      {pinUser && (
        <PinEntryDialog
          pin={pinUser.pin ?? ''}
          onMatch={() => trySwitchUser(pinUser)}
          onServerAuth={() => openLogin(pinUser.name ?? '')}
          onClose={() => setPinUser(null)}
        />
      )}
      {protectUser && (
        <ProfileProtectionDialog
          user={protectUser}
          verifyPin
          onClose={() => setProtectUser(null)}
          onServerAuth={() => openLogin(protectUser.name ?? '')}
        />
      )}
    </>
  )
}


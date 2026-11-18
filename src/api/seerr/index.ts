// Seerr (Jellyseerr/Overseerr) integration: proxy-relative client, per-user link, and the query hooks
// behind Discover. The shell shows the Discover drawer entry when `useSeerrConfigured()` is true.
export { seerrProxyPath, SeerrError, isAuthError } from './client'
export { seerrApi } from './endpoints'
export * from './types'
export * from './permissions'
export * from './status'
export * from './items'
export * from './filter'
export * from './queries'
export {
  useSeerrConfigured,
  useSeerrSession,
  useSeerrStore,
  ensureSeerrBinding,
  refreshSeerr,
  linkSeerr,
  unlinkSeerr,
  SeerrLoginFailure,
  type SeerrAuthMethod,
  type SeerrLink,
  type SeerrLoginError,
  type SeerrSessionView,
  type SeerrState,
  type SeerrStatus,
} from './session'

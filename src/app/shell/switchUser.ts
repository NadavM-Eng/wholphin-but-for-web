// The drawer's profile entry (NavDrawer.kt:353 navigateToSetup(UserList)): leave the current user and show
// the user list. The next sign-in starts at Home (SwitchUserViewModel navigates to AppContent(current)), so
// the auth guard must not add `?next=<page the user deliberately left>` to the user-list URL.
import { leaveUser } from '../../api/session'
import { useSessionStore } from '../../stores/session'

let deliberate = false
let watching = false

/** Clears the session; RequireSession then redirects to the user list without `?next`. */
export function switchUserFromDrawer() {
  if (!watching) {
    watching = true
    // the flag lasts until someone is signed in again
    useSessionStore.subscribe((s) => {
      if (s.current) deliberate = false
    })
  }
  deliberate = true
  leaveUser()
}

/** True between switchUserFromDrawer() and the next sign-in. */
export const leftUserDeliberately = () => deliberate

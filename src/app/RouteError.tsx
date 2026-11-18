import { isRouteErrorResponse, useRouteError } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ErrorScreen } from './ErrorScreen'

/** Route-level errorElement: loader/lazy-import failures and render errors inside a route. */
export function RouteError() {
  const error = useRouteError()
  const { t } = useTranslation()
  if (isRouteErrorResponse(error)) {
    return <ErrorScreen error={`${error.status} ${error.statusText}`} title={error.status === 404 ? t('web_not_found') : undefined} />
  }
  return <ErrorScreen error={error} />
}

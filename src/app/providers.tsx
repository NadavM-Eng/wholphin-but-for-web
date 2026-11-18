import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { I18nextProvider } from 'react-i18next'
import { queryClient } from '../api/queryClient'
import { i18next } from '../i18n'
import { ErrorBoundary } from './ErrorBoundary'
import { AppScreensaver } from '../features/photos/AppScreensaver'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18next}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          {children}
          {/* the in-app screensaver + dim layer, once for the whole app (upstream MainContent.kt:137-160) */}
          <AppScreensaver />
        </QueryClientProvider>
      </ErrorBoundary>
    </I18nextProvider>
  )
}

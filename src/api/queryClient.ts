import { QueryClient } from '@tanstack/react-query'

function status(err: unknown): number | null {
  const s = (err as { response?: { status?: unknown } } | null)?.response?.status
  return typeof s === 'number' ? s : null
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      // Retry once, but never on client errors (401 is handled globally, 404 is final).
      retry: (count, err) => {
        const s = status(err)
        if (s != null && s >= 400 && s < 500) return false
        return count < 1
      },
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
})

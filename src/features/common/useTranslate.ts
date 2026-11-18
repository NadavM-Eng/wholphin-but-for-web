import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Translate } from '../../lib/format'

/** i18next's `t` narrowed to the plain `Translate` signature the pure formatters take, plus the locale. */
export function useTranslate(): { t: Translate; locale: string } {
  const { t, i18n } = useTranslation()
  return useMemo(() => ({ t: (key: string, options?: Record<string, unknown>) => t(key, options ?? {}) as string, locale: i18n.language }), [t, i18n.language])
}

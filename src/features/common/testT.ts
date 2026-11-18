// Test helper: an interpolating `t` over the generated English strings (with i18next-style plurals).
import type { UserItemDataDto } from '@jellyfin/sdk/lib/generated-client/models'
import en from '../../i18n/locales/en.json'
import type { Translate } from '../../lib/format'

const strings = en as Record<string, unknown>

export const testT: Translate = (key, opts = {}) => {
  let s = strings[key]
  if (typeof opts.count === 'number') s = strings[`${key}_${opts.count === 1 ? 'one' : 'other'}`] ?? s
  if (typeof s !== 'string') return key
  return s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k]))
}

/** A UserItemDataDto literal for tests (the DTO's `Key` is required). */
export const ud = (x: Partial<UserItemDataDto>): UserItemDataDto => ({ Key: '', ...x })

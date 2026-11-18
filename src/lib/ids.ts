/**
 * Jellyfin ids are UUIDs; the server returns them as 32 lowercase hex chars without dashes, but some
 * fields/inputs carry the dashed form. Upstream compares java.util.UUID values, so compare normalized.
 */
export function normalizeId(id: string): string
export function normalizeId(id: string | null | undefined): string | null
export function normalizeId(id: string | null | undefined): string | null {
  if (!id) return null
  return id.replace(/-/g, '').toLowerCase()
}

export function sameId(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && normalizeId(a) === normalizeId(b)
}

export function isUuid(id: string | null | undefined): boolean {
  return !!id && /^[0-9a-f]{32}$/.test(normalizeId(id) ?? '')
}

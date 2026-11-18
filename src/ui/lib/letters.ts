/** Upstream `jump_letters` string. */
export const JUMP_LETTERS = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** First jump letter for a sort name, as upstream computes `currentLetter`. */
export function letterForSortName(sortName: string | null | undefined, letters = JUMP_LETTERS): string {
  const c = sortName?.charAt(0).toUpperCase()
  if (!c) return letters[0]
  if (c >= '0' && c <= '9') return '#'
  if (c >= 'A' && c <= 'Z') return c
  return letters[0]
}


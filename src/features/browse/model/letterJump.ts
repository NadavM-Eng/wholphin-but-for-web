// Alphabet jump (W/ui/detail/CardGrid.kt jumpToLetter + positionOfLetter). The server counts the items whose
// sort name is less than a letter (`nameLessThan`, limit 0, total count); that count is the index of the
// first item at or after the letter in ascending order.
import type { SortOrder } from '@jellyfin/sdk/lib/generated-client/models'
import { JUMP_LETTERS } from '../../../ui'

/**
 * The `nameLessThan` bound to count for `letter`. Ascending: the letter itself. Descending: the next
 * letter, since the letter's block ends where the names below the next letter begin ('#' => 'A';
 * 'Z' => '{', the character after both 'Z' and 'z').
 */
export function letterBound(letter: string, direction: SortOrder): string {
  const L = letter.toUpperCase()
  if (direction !== 'Descending') return L
  const i = JUMP_LETTERS.indexOf(L)
  if (i < 0) return L
  return i + 1 < JUMP_LETTERS.length ? JUMP_LETTERS[i + 1] : '{'
}

/**
 * Target index from the count for `letterBound(letter, direction)`. Upstream uses the ascending count
 * for both directions, so with Name descending the jump lands at the mirrored position
 * (CardGrid.kt:186-201); the descending index is `total - count` of the names below the next letter.
 * Returns -1 when there is nothing to jump to.
 */
export function letterJumpIndex(count: number | null | undefined, total: number, direction: SortOrder): number {
  if (count == null || count < 0 || total <= 0) return -1
  const index = direction === 'Descending' ? total - count : count
  return Math.min(Math.max(0, index), total - 1)
}

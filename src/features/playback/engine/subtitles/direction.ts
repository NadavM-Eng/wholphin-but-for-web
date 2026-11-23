// Base direction of a subtitle line. The TV app draws cues with Android text views, which pick each line's
// direction themselves; a browser lays a block out in the page's direction unless told otherwise. With an English
// interface that puts the full stop of a Hebrew sentence at the right end, before its first word; with a Hebrew
// interface it does the same to an English sentence, and to the many Hebrew files described under 3.
//
// The rule, per line of a cue:
//   1. A line that starts with a direction mark (LRM, RLM, an embedding, override or isolate) has the direction
//      its author stated. Files that wrap every line in RLE ... PDF are common.
//   2. A line without right-to-left letters is left to right.
//   3. A track whose right-to-left lines carry their closing punctuation at the START of the line (the full stop
//      stored before the first word, dialogue dashes after the last) was prepared for players that lay every line out left to
//      right; such files are common for Hebrew. Its lines are laid out left to right, as on those players, which
//      puts the punctuation where the file's author saw it. The text itself is not rearranged.
//   4. Otherwise a line with right-to-left letters is right to left when its first letter is one (what Android
//      decides), when most of its letters are, or when the track as a whole is mostly right-to-left: in a Hebrew
//      track a sentence that starts with a long Latin name ("Game of Thrones ...") is still a Hebrew sentence,
//      which is by far the common case there; the price is that an English sentence quoting a Hebrew word is
//      laid out right to left in such a track. In a left-to-right track that sentence stays left to right.
//   5. A line without letters (digits, punctuation, music notes) follows its neighbour in the cue, else the track.
// Only the base direction is set: the text is not touched, so marks a file already carries keep working and the
// browser's bidi algorithm keeps embedded numbers and Latin words readable.

export type TextDirection = 'ltr' | 'rtl'

/** What the lines of a whole track say about how it wants to be laid out. */
export interface TrackLayout {
  /** right to left when most of the track's letters are */
  direction: TextDirection
  /** the closing punctuation of its right-to-left lines is stored at the start of the line (rule 3) */
  preparedForLtr: boolean
}

const PLAIN_TRACK: TrackLayout = { direction: 'ltr', preparedForLtr: false }

/**
 * Code points whose letters are written right to left (bidi classes R and AL): Hebrew, Arabic, Syriac, Thaana, NKo,
 * Samaritan, Mandaic and the Arabic extensions; their presentation forms; the right-to-left blocks of the
 * supplementary planes (Phoenician ... Hanifi Rohingya, Adlam, Arabic mathematical symbols).
 */
const RTL_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0590, 0x08ff],
  [0xfb1d, 0xfdff],
  [0xfe70, 0xfefc],
  [0x10800, 0x10fff],
  [0x1e800, 0x1efff],
]

const isRtlCodePoint = (cp: number) => RTL_RANGES.some(([from, to]) => cp >= from && cp <= to)

/** Direction marks by code point: LRM, LRE, LRO, LRI and RLM, ALM, RLE, RLO, RLI. */
const LTR_MARKS = [0x200e, 0x202a, 0x202d, 0x2066]
const RTL_MARKS = [0x200f, 0x061c, 0x202b, 0x202e, 0x2067]
/** Zero-width characters that may stand before a mark: ZWSP, ZWNJ, ZWJ, word joiner, BOM. */
const ZERO_WIDTH = [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]
/**
 * Direction-neutral marks that close a clause and never open one: . , ? ! : ; and the Arabic comma. The Arabic
 * question mark and semicolon are not listed: they are right-to-left characters themselves, stay with their words
 * in any layout, and so are found at the end of the line in files of both kinds.
 */
const CLOSERS = `.,?!:;${String.fromCharCode(0x060c)}`

export interface LetterCount {
  rtl: number
  ltr: number
  /** direction of the first letter, null when the text has none */
  first: TextDirection | null
}

/** Counts the letters of `text` by writing direction. Digits, punctuation, symbols and combining marks are neutral. */
export function countLetters(text: string): LetterCount {
  const count: LetterCount = { rtl: 0, ltr: 0, first: null }
  for (const m of text.matchAll(/\p{L}/gu)) {
    const dir: TextDirection = isRtlCodePoint(m[0].codePointAt(0) ?? 0) ? 'rtl' : 'ltr'
    count[dir]++
    count.first ??= dir
  }
  return count
}

/** The direction a line's own first character states, if it is a direction mark. */
export function leadingMark(line: string): TextDirection | null {
  for (const ch of line) {
    const cp = ch.codePointAt(0) ?? 0
    if (LTR_MARKS.includes(cp)) return 'ltr'
    if (RTL_MARKS.includes(cp)) return 'rtl'
    if (!ZERO_WIDTH.includes(cp) && ch.trim() !== '') return null
  }
  return null
}

/**
 * Reads a track's lines (plain text, one entry per line): the direction of most of its letters, and whether its
 * right-to-left lines start with their closing punctuation more often than they end with it. A properly stored
 * file has hundreds of lines that end with a full stop or a comma and none that start with one (a leading ellipsis
 * is not counted: "...and then" is ordinary); a file prepared for left-to-right players is the reverse.
 */
export function trackLayout(lines: Iterable<string>): TrackLayout {
  let rtl = 0
  let ltr = 0
  let atStart = 0
  let atEnd = 0
  for (const raw of lines) {
    const n = countLetters(raw)
    rtl += n.rtl
    ltr += n.ltr
    if (n.rtl === 0 || leadingMark(raw)) continue
    const line = raw.trim()
    if (CLOSERS.includes(line[0]) && line[1] !== '.') atStart++
    if (CLOSERS.includes(line[line.length - 1])) atEnd++
  }
  return { direction: rtl > ltr ? 'rtl' : 'ltr', preparedForLtr: atStart > atEnd }
}

/**
 * Direction of one line of plain text (see the rule at the top), or null when the line has no letters and no
 * leading direction mark.
 */
export function lineDirection(line: string, track: TrackLayout = PLAIN_TRACK): TextDirection | null {
  const mark = leadingMark(line)
  if (mark) return mark
  const n = countLetters(line)
  if (n.rtl === 0) return n.ltr > 0 ? 'ltr' : null
  if (track.preparedForLtr) return 'ltr'
  return n.first === 'rtl' || n.rtl > n.ltr || track.direction === 'rtl' ? 'rtl' : 'ltr'
}

/**
 * Directions of the lines of one cue. A line without letters takes the direction of the line before it in the cue
 * that has one, else of the next such line, else the track's.
 */
export function cueLineDirections(lines: readonly string[], track: TrackLayout = PLAIN_TRACK): TextDirection[] {
  const own = lines.map((l) => lineDirection(l, track))
  let before = own.find((d) => d != null) ?? (track.preparedForLtr ? 'ltr' : track.direction)
  return own.map((d) => (before = d ?? before))
}

/** A cue line as our text renderer stores it (cues.ts), without its <i>/<b>/<u> markup and escaped angle brackets. */
export function cueLineText(line: string): string {
  return line.replace(/<\/?[ibu]>/gi, '').replace(/&[lg]t;/g, ' ')
}

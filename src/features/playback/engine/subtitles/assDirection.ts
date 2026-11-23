// Line direction for ASS/SSA scripts drawn by libass (JASSUB).
//
// libass lays every line out left to right, whatever its text, unless the line's style has `Encoding: -1`; then it
// takes the direction of each line (the text between two `\N`) from the line's first strong character. Most
// Hebrew scripts are written for the first behaviour: their closing punctuation is stored at the start of the
// line, or every line is wrapped in direction marks. A script that stores its text in plain reading order and
// does not ask for Encoding -1 gets its full stops at the wrong end.
// For a script that contains right-to-left letters and is not of the "punctuation first" kind (direction.ts,
// rule 3) this module therefore
//   - sets the Encoding of every style to -1, and
//   - where the first letter of a line would give another direction than the rule of direction.ts (a Hebrew
//     sentence that starts with a Latin name; a line of digits in a Hebrew script), puts a direction mark (RLM or
//     LRM, which libass does not draw) in front of the line's text.
// Every other script is returned as it is. Lines that already start with a direction mark, and events that draw
// vector shapes (`\p1`), get no mark.
import { countLetters, cueLineDirections, leadingMark, trackLayout, type TextDirection } from './direction'

/** RLM / LRM: zero-width characters with a strong direction */
const MARK: Record<TextDirection, string> = { ltr: String.fromCharCode(0x200e), rtl: String.fromCharCode(0x200f) }
/** Text field tokens: an override block, a hard line break, a run of plain text, or any other single character. */
const TOKEN = /\{[^}]*\}|\\N|[^{\\]+|[\s\S]/g
const isBlock = (token: string) => token.length > 1 && token.startsWith('{') && token.endsWith('}')
/** Fields of the default [Events] format (Layer ... Effect, Text). */
const DEFAULT_EVENT_FIELDS = 10

interface Dialogue {
  /** index into the split source */
  at: number
  /** everything before the Text field */
  head: string
  /** tokens of the Text field, per line */
  lines: string[][]
  /** what each line shows: no override blocks, `\h` and `\n` as spaces */
  texts: string[]
  drawing: boolean
}

function parseDialogue(at: number, line: string, fieldCount: number): Dialogue | null {
  let cut = line.indexOf(':')
  for (let i = 1; i < fieldCount && cut >= 0; i++) cut = line.indexOf(',', cut + 1)
  if (cut < 0) return null
  const tokens = line.slice(cut + 1).match(TOKEN) ?? []
  const lines: string[][] = [[]]
  for (const token of tokens) {
    lines[lines.length - 1].push(token)
    if (token === '\\N') lines.push([])
  }
  return {
    at,
    head: line.slice(0, cut + 1),
    lines,
    texts: lines.map((l) =>
      l
        .filter((token) => !isBlock(token) && token !== '\\N')
        .join('')
        .replace(/\\[hn]/g, ' '),
    ),
    drawing: tokens.some((token) => isBlock(token) && /\\p[1-9]/.test(token)),
  }
}

/** The script with the direction of every line stated in a way libass follows (see the top of this file). */
export function assWithLineDirections(src: string): string {
  // contents at even indexes, the line ends between them at odd ones
  const parts = src.split(/(\r\n|\n|\r)/)
  let section = ''
  let styleFormat: string[] | null = null
  let eventFields = DEFAULT_EVENT_FIELDS
  const styles: Array<{ at: number; fields: string[]; encoding: number }> = []
  const dialogues: Dialogue[] = []

  for (let at = 0; at < parts.length; at += 2) {
    const line = parts[at]
    const header = /^\s*\[([^\]]+)\]\s*$/.exec(line)
    if (header) {
      section = header[1].trim().toLowerCase()
      continue
    }
    if (/^v4\+* styles$/.test(section)) {
      if (/^\s*format\s*:/i.test(line)) {
        styleFormat = line.slice(line.indexOf(':') + 1).split(',').map((s) => s.trim().toLowerCase())
      } else if (/^\s*style\s*:/i.test(line)) {
        const fields = line.split(',')
        // without a Format line libass assumes its default one, where Encoding is the last field
        const encoding = styleFormat ? styleFormat.indexOf('encoding') : fields.length - 1
        if (encoding > 0 && encoding < fields.length) styles.push({ at, fields, encoding })
      }
    } else if (section === 'events') {
      if (/^\s*format\s*:/i.test(line)) eventFields = line.split(',').length
      else if (/^\s*dialogue\s*:/i.test(line)) {
        const d = parseDialogue(at, line, eventFields)
        if (d) dialogues.push(d)
      }
    }
  }

  const shown = dialogues.filter((d) => !d.drawing)
  if (!shown.some((d) => d.texts.some((t) => countLetters(t).rtl > 0))) return src
  const track = trackLayout(shown.flatMap((d) => d.texts))
  // written for libass as it is (closing punctuation stored at the start of the lines): nothing to state
  if (track.preparedForLtr) return src
  const wantedBy = new Map(shown.map((d) => [d, cueLineDirections(d.texts, track)]))
  // every right-to-left line already says so with a mark of its own: nothing to state either
  if (!shown.some((d) => d.texts.some((t, i) => wantedBy.get(d)?.[i] === 'rtl' && !leadingMark(t)))) return src

  for (const s of styles) {
    s.fields[s.encoding] = '-1'
    parts[s.at] = s.fields.join(',')
  }
  for (const d of shown) {
    const wanted = wantedBy.get(d) ?? []
    let changed = false
    d.lines.forEach((tokens, i) => {
      const text = d.texts[i]
      if (leadingMark(text)) return
      // what libass decides by itself: the first letter, left to right when the line has none
      const natural = countLetters(text).first ?? 'ltr'
      if (wanted[i] === natural) return
      const first = tokens.findIndex((token) => !isBlock(token) && token !== '\\N')
      if (first < 0) return
      tokens[first] = MARK[wanted[i]] + tokens[first]
      changed = true
    })
    if (changed) parts[d.at] = d.head + d.lines.map((tokens) => tokens.join('')).join('')
  }
  return parts.join('')
}

import { describe, expect, it } from 'vitest'
import { assWithLineDirections } from './assDirection'

const RLM = String.fromCharCode(0x200f)
const RLE = String.fromCharCode(0x202b)

const STYLE_FORMAT =
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding'
const style = (name: string, encoding: string) => `Style: ${name},Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,20,${encoding}`
const EVENT_FORMAT = 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
const HEAD = 'Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,'

function script(texts: string[], eol = '\n'): string {
  return ['[Script Info]', 'ScriptType: v4.00+', '', '[V4+ Styles]', STYLE_FORMAT, style('Default', '1'), style('Sign', ' 177'), '', '[Events]', EVENT_FORMAT, ...texts.map((t) => HEAD + t), ''].join(eol)
}

/** The Text fields of the result's Dialogue lines. */
const texts = (out: string) =>
  out
    .split(/\r?\n/)
    .filter((l) => l.startsWith('Dialogue:'))
    .map((l) => l.slice(HEAD.length))

describe('ASS scripts: line direction for libass', () => {
  it('a script without right-to-left letters is not touched', () => {
    const src = script(['Hello there.', '{\\i1}Good evening,\\Nfriends.{\\i0}'])
    expect(assWithLineDirections(src)).toBe(src)
  })

  it('a Hebrew script that stores its closing punctuation first was written for libass as it is: not touched', () => {
    // stored order: the full stop or question mark, then the words
    const src = script(['.' + 'שלום לכולם', '?' + 'מה קרה', 'Tom ' + 'בא' + '\\N' + '.' + 'כלום'])
    expect(assWithLineDirections(src)).toBe(src)
  })

  it('a script whose right-to-left lines all start with a direction mark of their own is not touched', () => {
    const src = script([`${RLE}שלום לכולם.`, `${RLE}מה קרה?\\N${RLE}כלום.`, 'Hello there.'])
    expect(assWithLineDirections(src)).toBe(src)
  })

  it('a script with Hebrew text: every style asks libass to take each line direction from its text', () => {
    const out = assWithLineDirections(script(['שלום לכולם.', 'Hello there.']))
    expect(out).toContain(style('Default', '-1'))
    expect(out).toContain(style('Sign', '-1'))
    expect(out).not.toMatch(/,\s*(1|177)$/m)
    // these two lines get the right direction from their first letter: no mark
    expect(texts(out)).toEqual(['שלום לכולם.', 'Hello there.'])
    // nothing else changed
    expect(out.replaceAll(',-1\n', ',X\n')).toBe(script(['שלום לכולם.', 'Hello there.']).replace(',1\n', ',X\n').replace(', 177\n', ',X\n'))
  })

  it('a Hebrew line that starts with a Latin word gets a right-to-left mark in front of its text', () => {
    const out = assWithLineDirections(script(['Tom הלך הביתה אתמול.', '{\\an8\\i1}Tom הלך הביתה אתמול.', 'שלום.']))
    expect(texts(out)).toEqual([`${RLM}Tom הלך הביתה אתמול.`, `{\\an8\\i1}${RLM}Tom הלך הביתה אתמול.`, 'שלום.'])
  })

  it('each line of an event is decided by itself; a line without letters follows its neighbour, else the script', () => {
    const out = assWithLineDirections(script(['התסריט הזה כתוב כמעט כולו בעברית.', 'Good evening.\\Nערב טוב.', 'שלום.\\N1945.', '1945.', '- Tom בא.\\N- {\\i1}OK{\\i0}']))
    expect(texts(out)).toEqual([
      'התסריט הזה כתוב כמעט כולו בעברית.',
      'Good evening.\\Nערב טוב.',
      // a line of digits would be left to right for libass
      `שלום.\\N${RLM}1945.`,
      `${RLM}1945.`,
      // the script is mostly Hebrew, so the short line with a Latin name is right to left; "OK" alone is Latin
      `${RLM}- Tom בא.\\N- {\\i1}OK{\\i0}`,
    ])
  })

  it('a line that already starts with a direction mark, and an event that draws shapes, get no mark', () => {
    const marked = `${RLE}Tom הלך הביתה אתמול.`
    const drawing = '{\\p1}m 0 0 l 100 0 100 100 0 100{\\p0}'
    const out = assWithLineDirections(script(['שלום לכולם, מה שלומכם היום?', marked, drawing]))
    expect(texts(out)).toEqual(['שלום לכולם, מה שלומכם היום?', marked, drawing])
  })

  it('keeps commas in the text, Windows line ends, and reads the position of Encoding from the Format line', () => {
    const src = script(['Tom, בוא הנה, עכשיו.'], '\r\n')
    const out = assWithLineDirections(src)
    expect(out.split('\r\n')).toHaveLength(src.split('\r\n').length)
    expect(texts(out)).toEqual([`${RLM}Tom, בוא הנה, עכשיו.`])

    const ssa = ['[V4 Styles]', 'Format: Name, Fontname, Encoding, Fontsize', 'Style: Default,Arial,0,48', '', '[Events]', 'Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', 'Dialogue: Marked=0,0:00:01.00,0:00:04.00,Default,,0,0,0,,שלום.'].join('\n')
    expect(assWithLineDirections(ssa)).toContain('Style: Default,Arial,-1,48')
  })
})

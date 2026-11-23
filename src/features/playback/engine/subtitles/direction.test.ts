import { describe, expect, it } from 'vitest'
import { countLetters, cueLineDirections, cueLineText, leadingMark, lineDirection, trackLayout, type TrackLayout } from './direction'

// direction marks, by code point so that no invisible character sits in this file
const LRM = String.fromCharCode(0x200e)
const RLM = String.fromCharCode(0x200f)
const LRE = String.fromCharCode(0x202a)
const RLE = String.fromCharCode(0x202b)
const PDF = String.fromCharCode(0x202c)
const RLI = String.fromCharCode(0x2067)
const BOM = String.fromCharCode(0xfeff)

const LTR_TRACK: TrackLayout = { direction: 'ltr', preparedForLtr: false }
const RTL_TRACK: TrackLayout = { direction: 'rtl', preparedForLtr: false }
/** a Hebrew track whose lines store their closing punctuation first */
const PREPARED: TrackLayout = { direction: 'rtl', preparedForLtr: true }

describe('direction of one subtitle line', () => {
  it('a Hebrew sentence is right to left, whatever ends it', () => {
    expect(lineDirection('שלום לכולם.')).toBe('rtl')
    expect(lineDirection('מה שלומך היום?')).toBe('rtl')
    expect(lineDirection('לא ייאמן!')).toBe('rtl')
    expect(lineDirection('הוא אמר: "בוא הנה"')).toBe('rtl')
    expect(lineDirection('ואז...')).toBe('rtl')
  })

  it('a dialogue line that starts with a dash follows its words', () => {
    expect(lineDirection('- מה קרה?')).toBe('rtl')
    expect(lineDirection('-כלום, באמת!')).toBe('rtl')
    expect(lineDirection('- What happened?')).toBe('ltr')
  })

  it('a Hebrew sentence that starts with a Latin word or a number is still right to left', () => {
    // the first strong character alone would say left to right here
    expect(lineDirection('Tom הלך הביתה אתמול.')).toBe('rtl')
    expect(lineDirection('FBI, תפתחו את הדלת!')).toBe('rtl')
    expect(lineDirection('3 ימים עברו מאז.')).toBe('rtl')
    expect(lineDirection('1945, ברלין.')).toBe('rtl')
  })

  it('a Hebrew sentence that quotes a long Latin title is right to left: it starts with a Hebrew letter', () => {
    // more Latin letters than Hebrew ones
    expect(countLetters('ראיתי את The Lord of the Rings אתמול.')).toMatchObject({ rtl: 12, ltr: 17, first: 'rtl' })
    expect(lineDirection('ראיתי את The Lord of the Rings אתמול.')).toBe('rtl')
    expect(lineDirection('האתר הוא www.example-site.com')).toBe('rtl')
  })

  it('a short Hebrew line that starts with a longer Latin name takes the direction of its track', () => {
    expect(countLetters('Tom בא.')).toMatchObject({ rtl: 2, ltr: 3, first: 'ltr' })
    expect(lineDirection('Tom בא.', RTL_TRACK)).toBe('rtl')
    expect(lineDirection('Tom בא.', LTR_TRACK)).toBe('ltr')
  })

  it('English and other left-to-right lines are left to right, also in a right-to-left track', () => {
    for (const track of [LTR_TRACK, RTL_TRACK, PREPARED]) {
      expect(lineDirection('Hello there.', track)).toBe('ltr')
      expect(lineDirection('¿Qué pasa?', track)).toBe('ltr')
      expect(lineDirection('Привет, мир.', track)).toBe('ltr')
      expect(lineDirection('こんにちは。', track)).toBe('ltr')
      expect(lineDirection('Γειά σου, κόσμε.', track)).toBe('ltr')
    }
  })

  it('an English sentence that quotes a Hebrew word stays left to right in a left-to-right track', () => {
    expect(lineDirection('He said שלום to everyone.')).toBe('ltr')
    expect(lineDirection('He said שלום to everyone.', LTR_TRACK)).toBe('ltr')
  })

  it('in a right-to-left track every line with right-to-left letters is right to left: Latin names outnumber the Hebrew words of many lines', () => {
    expect(lineDirection('Game of Thrones היא סדרה.', RTL_TRACK)).toBe('rtl')
    // the known price of that choice
    expect(lineDirection('He said שלום to everyone.', RTL_TRACK)).toBe('rtl')
  })

  it('Arabic, Persian and the other right-to-left scripts', () => {
    expect(lineDirection('مرحبا بالعالم.')).toBe('rtl')
    expect(lineDirection('- ماذا حدث؟')).toBe('rtl')
    expect(lineDirection('iPhone هذا هاتف جديد.')).toBe('rtl')
    expect(lineDirection('سلام دنیا!')).toBe('rtl')
    // Syriac, Thaana, and Adlam from the supplementary planes
    expect(lineDirection('ܫܠܡܐ.')).toBe('rtl')
    expect(lineDirection('ހެލޯ.')).toBe('rtl')
    expect(lineDirection(`${String.fromCodePoint(0x1e900, 0x1e901, 0x1e902)}.`)).toBe('rtl')
  })

  it('a line without letters has no direction of its own', () => {
    expect(lineDirection('...')).toBeNull()
    expect(lineDirection('1945.')).toBeNull()
    expect(lineDirection('♪ ♪')).toBeNull()
    expect(lineDirection('')).toBeNull()
    // Arabic-Indic digits and points are not letters
    expect(lineDirection('١٢٣')).toBeNull()
    expect(countLetters('שָׁלוֹם')).toMatchObject({ rtl: 4, ltr: 0 })
  })

  it('a line that starts with a direction mark keeps the direction its author gave it', () => {
    expect(lineDirection(`${RLM}Hello there.`)).toBe('rtl')
    expect(lineDirection(`${RLE}Tom said hello.${PDF}`)).toBe('rtl')
    expect(lineDirection(`${RLI}Hello.`)).toBe('rtl')
    expect(lineDirection(`${LRM}שלום לכולם.`)).toBe('ltr')
    expect(lineDirection(`${LRE}.שלום לכולם${PDF}`, RTL_TRACK)).toBe('ltr')
    // spaces and a byte order mark before the mark do not hide it
    expect(lineDirection(`${BOM} ${RLE}Hello.`)).toBe('rtl')
    expect(leadingMark(`- ${RLM}Hello`)).toBeNull()
    // marks elsewhere are not letters: they change nothing
    expect(lineDirection(`שלום לכולם.${RLM}`)).toBe('rtl')
    expect(lineDirection(`Hello there.${LRM}`)).toBe('ltr')
    expect(countLetters(`${RLM}${LRM}${RLE}a`)).toEqual({ rtl: 0, ltr: 1, first: 'ltr' })
  })
})

describe('directions of the lines of a cue', () => {
  it('each line is decided by itself', () => {
    expect(cueLineDirections(['Good evening.', 'ערב טוב.'])).toEqual(['ltr', 'rtl'])
    expect(cueLineDirections(['- מה קרה?', '- כלום, באמת!'])).toEqual(['rtl', 'rtl'])
    expect(cueLineDirections(['- Where is he?', '- Gone.'], RTL_TRACK)).toEqual(['ltr', 'ltr'])
  })

  it('a line without letters follows the line before it, else the next one, else the track', () => {
    expect(cueLineDirections(['שלום.', '...'])).toEqual(['rtl', 'rtl'])
    expect(cueLineDirections(['...', 'שלום.'])).toEqual(['rtl', 'rtl'])
    expect(cueLineDirections(['Hello.', '1945.', 'שלום.'])).toEqual(['ltr', 'ltr', 'rtl'])
    expect(cueLineDirections(['1945.'], RTL_TRACK)).toEqual(['rtl'])
    expect(cueLineDirections(['1945.'], LTR_TRACK)).toEqual(['ltr'])
    expect(cueLineDirections(['1945.'])).toEqual(['ltr'])
  })
})

describe('what a track says about its layout', () => {
  it('is right to left when most of its letters are', () => {
    expect(trackLayout(['שלום לכולם.', 'Tom בא.', 'OK'])).toEqual(RTL_TRACK)
    expect(trackLayout(['Hello there.', 'He said שלום.'])).toEqual(LTR_TRACK)
    expect(trackLayout([])).toEqual(LTR_TRACK)
    expect(trackLayout(['...', '123'])).toEqual(LTR_TRACK)
  })

  // The stored order is written out with "+": first what the file stores first.
  const stored = ['.' + 'שלום לכולם', '?' + 'מה קרה' + ' -', ',' + 'בוא הנה', '!?' + 'באמת', '...' + 'ואז', 'שלום']

  it('a track that stores the closing punctuation of its lines first was prepared for left-to-right players', () => {
    expect(trackLayout(stored)).toEqual(PREPARED)
    // Arabic: the full stop and the Arabic comma are moved to the start; the Arabic question mark, a right-to-left
    // character itself, stays at the end in such files and is no evidence against
    const arabicQuestion = String.fromCharCode(0x061f)
    const arabicComma = String.fromCharCode(0x060c)
    expect(trackLayout(['.' + 'مرحبا بالعالم', 'ماذا حدث' + arabicQuestion, 'ماذا' + arabicQuestion, arabicComma + 'مرحبا'])).toEqual(PREPARED)
    expect(trackLayout(['ماذا حدث' + arabicQuestion, 'مرحبا بالعالم.']).preparedForLtr).toBe(false)
  })

  it('a track stored in reading order is not: full stops end its lines, and a leading ellipsis is ordinary', () => {
    expect(trackLayout(['שלום לכולם.', '- מה קרה?', '...ואז הוא הלך.', 'בוא הנה,', '..." אמר'])).toEqual(RTL_TRACK)
    expect(trackLayout(['...ואז'])).toEqual(RTL_TRACK)
    // one stray line does not turn a whole track
    expect(trackLayout(['.' + 'שלום', 'שלום לכולם.', 'מה קרה?']).preparedForLtr).toBe(false)
  })

  it('lines wrapped in direction marks and lines without right-to-left letters are not evidence', () => {
    expect(trackLayout([`${RLE}שלום לכולם.${PDF}`, `${RLE}.שלום${PDF}`])).toEqual(RTL_TRACK)
    expect(trackLayout(['.NET is a framework', '.hidden']).preparedForLtr).toBe(false)
  })

  it('the lines of a prepared track are laid out left to right, as on the players it was prepared for', () => {
    for (const line of stored) expect(lineDirection(line, PREPARED), line).toBe('ltr')
    expect(cueLineDirections(['?' + 'מה קרה' + ' -', '.' + 'כלום' + ' -'], PREPARED)).toEqual(['ltr', 'ltr'])
    expect(cueLineDirections(['...'], PREPARED)).toEqual(['ltr'])
    // a line with its own direction mark keeps it
    expect(lineDirection(`${RLE}שלום לכולם.${PDF}`, PREPARED)).toBe('rtl')
  })
})

describe('the text of a cue line', () => {
  it('leaves out the inline markup, whose letters would otherwise be counted as Latin', () => {
    expect(cueLineText('<i>לא.</i>')).toBe('לא.')
    expect(cueLineText('<b><u>שלום</u></b> &lt;3')).toBe('שלום  3')
    // two Hebrew letters against the two letters of the tags: with the markup counted, the first letter would be "i"
    expect(lineDirection('<i>לא.</i>')).toBe('ltr')
    expect(lineDirection(cueLineText('<i>לא.</i>'))).toBe('rtl')
  })
})

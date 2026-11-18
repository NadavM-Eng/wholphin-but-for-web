import { describe, expect, it } from 'vitest'
import {
  androidQualifierToBcp47,
  convertFormatArgs,
  convertString,
  parseResources,
  toI18next,
  unescapeAndroid,
} from './gen-strings.ts'

describe('androidQualifierToBcp47', () => {
  it('maps legacy and region qualifiers', () => {
    expect(androidQualifierToBcp47('')).toBe('en')
    expect(androidQualifierToBcp47('iw')).toBe('he')
    expect(androidQualifierToBcp47('in')).toBe('id')
    expect(androidQualifierToBcp47('pt-rBR')).toBe('pt-BR')
    expect(androidQualifierToBcp47('zh-rCN')).toBe('zh-CN')
    expect(androidQualifierToBcp47('nb-rNO')).toBe('nb-NO')
    expect(androidQualifierToBcp47('b+sr+Latn')).toBe('sr-Latn')
    expect(androidQualifierToBcp47('kab')).toBe('kab')
  })
})

describe('format args', () => {
  it('converts positional and sequential args', () => {
    expect(convertFormatArgs('S%1$d E%2$d-E%3$d')).toBe('S{{p1}} E{{p2}}-E{{p3}}')
    expect(convertFormatArgs('S%1$02dE%2$02d')).toBe('S{{p1}}E{{p2}}')
    expect(convertFormatArgs('%.2f seconds')).toBe('{{p1}} seconds')
    expect(convertFormatArgs('Favorite %s of %d')).toBe('Favorite {{p1}} of {{p2}}')
    expect(convertFormatArgs('%2$s before %1$s')).toBe('{{p2}} before {{p1}}')
    expect(convertFormatArgs('100%% sure')).toBe('100% sure')
    expect(convertFormatArgs('%1$dh %2$dm')).toBe('{{p1}}h {{p2}}m')
  })
  it('uses count for the first arg in plurals', () => {
    expect(convertFormatArgs('%d items', 'count')).toBe('{{count}} items')
    expect(convertFormatArgs('%1$d of %2$s', 'count')).toBe('{{count}} of {{p2}}')
  })
})

describe('unescapeAndroid', () => {
  it('handles escapes', () => {
    expect(unescapeAndroid("Don\\'t")).toBe("Don't")
    expect(unescapeAndroid('Say \\"hi\\"')).toBe('Say "hi"')
    expect(unescapeAndroid('line1\\nline2')).toBe('line1\nline2')
    expect(unescapeAndroid('\\@string')).toBe('@string')
    expect(unescapeAndroid('\\u00e9t\\u00E9')).toBe('été')
    expect(unescapeAndroid('back\\\\slash')).toBe('back\\slash')
  })
  it('collapses whitespace outside quotes and keeps it inside', () => {
    expect(unescapeAndroid('  a \n   b  ')).toBe('a b')
    expect(unescapeAndroid('"D-pad  zoekbalk"')).toBe('D-pad  zoekbalk')
    expect(unescapeAndroid('" lead"')).toBe(' lead')
    expect(unescapeAndroid('x\\n ')).toBe('x\n')
  })
})

describe('convertString', () => {
  it('decodes entities and CDATA before Android processing', () => {
    expect(convertString('<![CDATA[Cast & Crew]]>')).toBe('Cast & Crew')
    expect(convertString('Tom &amp; Jerry &#x2022; &lt;3')).toBe('Tom & Jerry • <3')
    expect(convertString('Hello <b>bold</b> %1$s')).toBe('Hello bold {{p1}}')
  })
})

describe('toI18next', () => {
  const base = parseResources(`<?xml version="1.0" encoding="utf-8"?>
<resources>
  <!-- comment <string name="ignored">x</string> -->
  <string name="app_name" translatable="false">Wholphin</string>
  <string name="red">Red</string>
  <string name="blue">Blue</string>
  <string name="empty"/>
  <plurals name="items">
    <item quantity="zero">%d items</item>
    <item quantity="one">%d item</item>
    <item quantity="other">%d items</item>
  </plurals>
  <string-array name="colors">
    <item>@string/red</item>
    <item>@string/blue</item>
    <item></item>
  </string-array>
  <string name="after_array">After</string>
</resources>`)

  it('does not confuse <string-array> with <string>', () => {
    expect(base.strings.has('colors')).toBe(false)
    expect(base.strings.get('after_array')?.value).toBe('After')
    expect(base.strings.get('red')?.value).toBe('Red')
  })

  it('drops zero for English and keeps base-only keys', () => {
    const en = toI18next('en', base, null)
    expect(en.app_name).toBe('Wholphin')
    expect(en.empty).toBe('')
    expect(en.items_one).toBe('{{count}} item')
    expect(en.items_other).toBe('{{count}} items')
    expect(en.items_zero).toBeUndefined()
    expect(en.colors).toEqual(['Red', 'Blue', ''])
    expect(en.ignored).toBeUndefined()
  })

  it('fills missing CLDR categories from other and resolves refs via base', () => {
    const ru = parseResources(`<resources>
      <string name="app_name" translatable="false">Wholphin</string>
      <string name="red">Красный</string>
      <plurals name="items"><item quantity="one">%d элемент</item><item quantity="other">%d элемента</item></plurals>
      <string-array name="colors"><item>@string/red</item><item>@string/blue</item></string-array>
    </resources>`)
    const out = toI18next('ru', ru, base)
    expect(out.app_name).toBeUndefined()
    expect(out.items_one).toBe('{{count}} элемент')
    expect(out.items_few).toBe('{{count}} элемента')
    expect(out.items_many).toBe('{{count}} элемента')
    expect(out.colors).toEqual(['Красный', 'Blue'])
  })
})

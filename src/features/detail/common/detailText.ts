// Text rules of the detail headers and rows: GenreText.kt, personRole (W/data/model/Person.kt),
// the "Directed by" line (MovieDetailsHeader.kt / EpisodeDetailsHeader.kt) and PersonPage.kt ages. Pure.
import type { BaseItemDto, BaseItemPerson } from '@jellyfin/sdk/lib/generated-client/models'
import { formatDate, type Translate } from '../../../lib/format'

/** `GenreText`: the first 4 joined by ", ", then ", +N". */
export function genreText(genres: readonly string[] | null | undefined): string | null {
  if (!genres?.length) return null
  if (genres.length <= 4) return genres.join(', ')
  return `${genres.slice(0, 4).join(', ')}, +${genres.length - 4}`
}

/** Directors with non-blank names joined by ", ", or null (no line). */
export function directorNames(item: Pick<BaseItemDto, 'People'>): string | null {
  const s = (item.People ?? [])
    .filter((p) => p.Type === 'Director' && p.Name && p.Name.trim() !== '')
    .map((p) => p.Name)
    .join(', ')
  return s === '' ? null : s
}

/** `PersonKind.stringRes`. */
const KIND_LABEL: Record<string, string> = {
  Unknown: 'unknown',
  Actor: 'actor',
  Director: 'director',
  Composer: 'composer',
  Writer: 'writer',
  GuestStar: 'guest_star',
  Producer: 'producer',
  Conductor: 'conductor',
  Lyricist: 'lyricist',
  Arranger: 'arranger',
  Engineer: 'engineer',
  Mixer: 'mixer',
  Remixer: 'mixer',
  Creator: 'creator',
  Artist: 'artist',
  AlbumArtist: 'artist',
}

/** Kotlin enum `name` of a PersonKind ("GuestStar" -> "GUEST_STAR"), which upstream compares the role with. */
const kotlinName = (kind: string) => kind.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase()

/** `personRole(role, type)`: the text under a person card. */
export function personRole(t: Translate, role: string | null | undefined, kind: string | null | undefined): string | null {
  const type = kind ?? 'Unknown'
  if (type === 'Actor' || type === 'GuestStar' || type === 'Unknown') return role ?? null
  const label = KIND_LABEL[type] ? t(KIND_LABEL[type]) : null
  const name = kotlinName(type)
  if (role != null && role.toLowerCase() === name.toLowerCase()) return label
  if (role && role.trim() !== '' && role.toLowerCase().includes(name.toLowerCase())) return role
  const parts = [role && role.trim() !== '' ? role : null, label].filter((p): p is string => !!p)
  return parts.length ? parts.join(' - ') : null
}

/** Whole years between two ISO dates (`LocalDate.until(...).years`). */
export function yearsBetween(fromIso: string, to: Date | string): number | null {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(fromIso)
  if (!a) return null
  let y2: number, m2: number, d2: number
  if (typeof to === 'string') {
    const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(to)
    if (!b) return null
    ;[y2, m2, d2] = [Number(b[1]), Number(b[2]), Number(b[3])]
  } else {
    ;[y2, m2, d2] = [to.getFullYear(), to.getMonth() + 1, to.getDate()]
  }
  const [y1, m1, d1] = [Number(a[1]), Number(a[2]), Number(a[3])]
  let years = y2 - y1
  if (m2 < m1 || (m2 === m1 && d2 < d1)) years--
  return years
}

/** Person page "Born: …" / "Died: …" lines (PersonHeader). */
export function personDates(
  t: Translate,
  person: Pick<BaseItemDto, 'PremiereDate' | 'EndDate'>,
  now: Date,
  locale?: string,
): { born: string | null; died: string | null } {
  const birth = person.PremiereDate ?? null
  const death = person.EndDate ?? null
  let born: string | null = null
  if (birth) {
    const date = formatDate(birth, locale)
    const age = death == null ? yearsBetween(birth, now) : null
    born = `${t('born')}: ${date}` + (age != null ? ` (${t('years_old', { count: age })})` : '')
  }
  let died: string | null = null
  if (death) {
    const age = birth ? yearsBetween(birth, death) : null
    died = `${t('died')}: ${formatDate(death, locale)}` + (age != null ? ` (${t('years_old', { count: age })})` : '')
  }
  return { born, died }
}

/** People of an item in server order (upstream shows all kinds, unfiltered). */
export function peopleOf(item: Pick<BaseItemDto, 'People'>): BaseItemPerson[] {
  return (item.People ?? []).filter((p) => !!p.Id)
}

/** Inline SVG placeholder art for the gallery (no network). */

function svg(w: number, h: number, body: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${body}</svg>`,
  )}`
}

const PALETTES: [string, string, string][] = [
  ['#1b2a49', '#c0392b', '#f5d76e'],
  ['#0f3443', '#34e89e', '#e0f7fa'],
  ['#41295a', '#2f0743', '#ff9a8b'],
  ['#232526', '#414345', '#ffd200'],
  ['#3a1c71', '#d76d77', '#ffaf7b'],
  ['#000428', '#004e92', '#a8edea'],
  ['#42275a', '#734b6d', '#fbd3e9'],
  ['#134e5e', '#71b280', '#fffde4'],
  ['#4b134f', '#c94b4b', '#fceabb'],
  ['#1f1c2c', '#928dab', '#e9e4f0'],
]

/** A 2:3 movie-poster-like image with a title band. */
export function poster(i: number, title: string): string {
  const [a, b, c] = PALETTES[i % PALETTES.length]
  const words = title.toUpperCase()
  return svg(
    400,
    600,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient>
     <radialGradient id="r" cx="0.7" cy="0.35" r="0.5"><stop offset="0" stop-color="${c}" stop-opacity="0.9"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>
     <rect width="400" height="600" fill="url(#g)"/><circle cx="280" cy="210" r="170" fill="url(#r)"/>
     <path d="M0 470 L120 360 L210 430 L300 330 L400 420 L400 600 L0 600Z" fill="${a}" opacity="0.85"/>
     <text x="200" y="540" font-family="Georgia, serif" font-size="38" font-weight="700" fill="${c}" text-anchor="middle" letter-spacing="3">${escapeXml(words.slice(0, 16))}</text>`,
  )
}

/** A 16:9 still / backdrop. */
export function still(i: number, label = ''): string {
  const [a, b, c] = PALETTES[(i + 3) % PALETTES.length]
  return svg(
    640,
    360,
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
     <rect width="640" height="360" fill="url(#g)"/><circle cx="${120 + (i * 97) % 400}" cy="120" r="70" fill="${c}" opacity="0.55"/>
     <path d="M0 300 Q160 210 320 280 T640 250 L640 360 L0 360Z" fill="${a}" opacity="0.7"/>
     <text x="24" y="340" font-family="Arial, sans-serif" font-size="22" fill="#fff" opacity="0.8">${escapeXml(label)}</text>`,
  )
}

/** A square portrait with a head-and-shoulders silhouette. */
export function portrait(i: number): string {
  const [a, b, c] = PALETTES[(i + 5) % PALETTES.length]
  return svg(
    300,
    300,
    `<rect width="300" height="300" fill="${b}"/><circle cx="150" cy="120" r="62" fill="${c}" opacity="0.9"/>
     <path d="M40 300 Q50 200 150 195 Q250 200 260 300Z" fill="${a}"/>`,
  )
}

/** A transparent "logo" with the title in a display face. */
export function logo(title: string): string {
  return svg(
    640,
    160,
    `<text x="10" y="112" font-family="Georgia, serif" font-size="96" font-weight="700" fill="#fff" stroke="#000" stroke-opacity="0.3" stroke-width="2">${escapeXml(title)}</text>`,
  )
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

export const MOVIES = [
  { title: 'The Long Horizon', year: '2023' },
  { title: 'Night Train to Lisbon', year: '2013' },
  { title: 'Paper Moons', year: '1998' },
  { title: 'A Very Long Title That Will Need The Marquee To Be Read', year: '2021' },
  { title: 'Quiet Harbor', year: '2019' },
  { title: 'Ember', year: '2024' },
  { title: 'The Cartographer', year: '2017' },
  { title: 'Salt & Static', year: '2022' },
  { title: 'Northbound', year: '2010' },
  { title: 'Glass Animals', year: '2016' },
] as const

export const PEOPLE = [
  { name: 'Alexandra Whitfield-Montgomery', role: 'Captain Elena Voss' },
  { name: 'Sam Ortiz', role: 'Director' },
  { name: 'Mei Tanaka', role: 'Dr. Hart' },
  { name: 'Jonas Berg', role: null },
  { name: 'Priya Natarajan', role: 'Writer' },
] as const

export const GENRES = [
  { id: '5d2f1a0e-7c3b-4a9d-8e6f-abcdefabcdef', name: 'Adventure' },
  { id: 'e9b1c3f0-1234-4bcd-9abc-0123456789ab', name: 'Comedy' },
  { id: '38f5f7a0-9f4c-4e1b-8a43-1f2e3d4c5b6a', name: 'Drama' },
  { id: 'a1b2c3d4-e5f6-4789-abcd-ef0123456789', name: 'Science Fiction' },
] as const

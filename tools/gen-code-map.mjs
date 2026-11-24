// Writes docs/CODE-MAP.md: where things are in this repository, for a person or an agent who knows what they see
// on the screen and wants the file that is responsible for it.
//
//   node tools/gen-code-map.mjs          write docs/CODE-MAP.md
//   node tools/gen-code-map.mjs --check  exit 1 when the file is out of date or names a path that is gone
//
// Two kinds of content:
// - written by hand, in tools/code-map/: intro.md (how to get from the screen to the code), where.json ("what you
//   see" -> files, with the marker to look for) and folders.json (one line per folder);
// - read from the code on every run: the folder trees, every file of src/ with the first sentence of its own
//   comment, the screens (the table in src/app/routes.tsx) and the data-* markers the pages carry.
// The check keeps the two honest: a hand-written entry may only name files that exist.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = 'docs/CODE-MAP.md'
const read = (p) => readFileSync(join(root, p), 'utf8')
const readJson = (p, fallback) => (existsSync(join(root, p)) ? JSON.parse(read(p)) : fallback)

/** Every tracked file and every new file that is not ignored, with forward slashes. */
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\n')
  .map((l) => l.trim())
  .filter((f) => f && existsSync(join(root, f)))
  .sort((a, b) => a.localeCompare(b, 'en'))
const fileSet = new Set(files)
const dirSet = new Set()
for (const f of files) {
  const parts = f.split('/')
  for (let i = 1; i < parts.length; i++) dirSet.add(parts.slice(0, i).join('/'))
}

const folders = readJson('tools/code-map/folders.json', {})
const where = readJson('tools/code-map/where.json', [])
const intro = existsSync(join(root, 'tools/code-map/intro.md')) ? read('tools/code-map/intro.md').trim() : ''
const problems = []

// ---- one line about a source file, from its own comment ------------------------------------------
const isCode = (f) => /\.(ts|tsx|mjs)$/.test(f) && !/\.test\.|\.gen\.|\.d\.ts$/.test(f)
const isTest = (f) => /\.test\.(ts|tsx)$/.test(f)

function commentText(raw) {
  return raw
    .split('\n')
    .map((l) => l.replace(/^\s*(\/\*\*?|\*\/|\*|\/\/)\s?/, '').replace(/\*\/\s*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The first sentence or two of a comment, short enough for one line of a list. */
function firstSentence(text) {
  const clean = text.replace(/eslint-disable[^.]*/g, '').trim()
  if (!clean) return ''
  // a sentence ends at ". " before a capital, a quote or a bracket; "e.g. x" and "file.kt:12" do not end one
  const parts = clean.split(/(?<=[.!?])\s+(?=[A-Z"'`([])/)
  let out = parts[0]
  if (out.length < 60 && parts[1]) out += ` ${parts[1]}`
  return out.length > 220 ? `${out.slice(0, 217).replace(/\s+\S*$/, '')}…` : out
}

function describe(file) {
  const text = read(file).replace(/^﻿/, '')
  // a comment at the very top of the file
  const top = /^\s*((?:\/\/[^\n]*\n)+|\/\*[\s\S]*?\*\/)/.exec(text)
  if (top) {
    const s = firstSentence(commentText(top[1]))
    if (s) return s
  }
  // else the comment on the thing the file is named after, else on the first thing it exports. One comment block
  // only: a block that reaches from a property's comment to a later export is not about the export.
  const block = String.raw`\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*`
  const stem = file.split('/').pop().replace(/\.(tsx?|mjs)$/, '')
  const named = new RegExp(`${block}export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|class)\\s+${stem.replace(/[^A-Za-z0-9_]/g, '')}\\b`).exec(text)
  const doc = named ?? new RegExp(`${block}export\\s`).exec(text)
  if (doc) {
    const s = firstSentence(commentText(doc[1]))
    if (s) return s
  }
  const names = [...text.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|type|interface)\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1])
  return names.length ? `Exports ${names.slice(0, 6).join(', ')}${names.length > 6 ? ', …' : ''}.` : ''
}

// ---- hand-written entries: every path must exist -------------------------------------------------
for (const e of where) {
  for (const f of e.files ?? []) if (!fileSet.has(f)) problems.push(`tools/code-map/where.json: "${e.see}" names ${f}, which does not exist`)
}
for (const p of Object.keys(folders)) if (!dirSet.has(p)) problems.push(`tools/code-map/folders.json: ${p} is not a folder of the repository`)
for (const m of intro.matchAll(/`((?:src|tools|docs|e2e|server)\/[A-Za-z0-9_./-]+)`/g)) {
  if (!fileSet.has(m[1]) && !dirSet.has(m[1].replace(/\/$/, ''))) problems.push(`tools/code-map/intro.md names ${m[1]}, which does not exist`)
}

// ---- pieces of the page ---------------------------------------------------------------------------
const link = (f, label = f) => `[\`${label}\`](../${f})`

/** A folder tree as text: folders only, down to `depth` below `base`, each with its line from folders.json. */
function tree(base, depth) {
  const lines = []
  const walk = (dir, prefix, level) => {
    const kids = [...dirSet].filter((d) => d.startsWith(`${dir}/`) && !d.slice(dir.length + 1).includes('/')).sort((a, b) => a.localeCompare(b, 'en'))
    kids.forEach((kid, i) => {
      const last = i === kids.length - 1
      const name = `${kid.slice(dir.length + 1)}/`
      const count = files.filter((f) => f.startsWith(`${kid}/`)).length
      const about = folders[kid] ?? ''
      lines.push(`${prefix}${last ? '└── ' : '├── '}${name}${about ? `  ${about}` : ''}${about ? '' : `  (${count} files)`}`)
      if (level < depth) walk(kid, `${prefix}${last ? '    ' : '│   '}`, level + 1)
    })
  }
  lines.push(`${base}/${folders[base] ? `  ${folders[base]}` : ''}`)
  walk(base, '', 1)
  return lines.join('\n')
}

function projectTree() {
  const top = [...dirSet].filter((d) => !d.includes('/')).sort((a, b) => a.localeCompare(b, 'en'))
  const lines = ['.']
  top.forEach((d, i) => {
    const last = i === top.length - 1
    lines.push(`${last ? '└── ' : '├── '}${d}/${folders[d] ? `  ${folders[d]}` : ''}`)
    const kids = [...dirSet].filter((k) => k.startsWith(`${d}/`) && !k.slice(d.length + 1).includes('/')).sort((a, b) => a.localeCompare(b, 'en'))
    // one more level for the folders people work in; the others are listed by name only
    if (!['src', 'tools', 'e2e', 'docs', 'server'].includes(d)) return
    kids.forEach((k, j) => {
      const kLast = j === kids.length - 1
      lines.push(`${last ? '    ' : '│   '}${kLast ? '└── ' : '├── '}${k.slice(d.length + 1)}/${folders[k] ? `  ${folders[k]}` : ''}`)
    })
  })
  return lines.join('\n')
}

/** The screens: the table in the comment at the top of src/app/routes.tsx. */
function screens() {
  const rows = []
  for (const line of read('src/app/routes.tsx').split('\n')) {
    const m = /^\s*\*\s*\|\s*(\/[^|]*?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/.exec(line)
    if (!m) continue
    const [, address, page, upstream, layout] = m
    const file = [`src/features/${page}.tsx`, `src/${page}.tsx`, `src/features/${page}/index.tsx`].find((f) => fileSet.has(f))
    rows.push(`| \`${address}\` | ${file ? link(file, file.replace(/^src\//, '')) : `\`${page}\``} | ${layout} | ${upstream.replace(/\|/g, '/')} |`)
  }
  return rows
}

/** data-* attributes written in the components, each with the files that set it. */
function markers() {
  const found = new Map()
  for (const f of files.filter((x) => x.startsWith('src/') && x.endsWith('.tsx') && !isTest(x))) {
    const text = read(f)
    for (const m of text.matchAll(/[\s{'"`](data-[a-z][a-z0-9-]*)(?=[=\s}'"`:\]])/g)) {
      if (!found.has(m[1])) found.set(m[1], new Set())
      found.get(m[1]).add(f)
    }
  }
  return [...found]
    .filter(([name]) => !['data-index', 'data-testid'].includes(name))
    .sort((a, b) => a[0].localeCompare(b[0], 'en'))
    .map(([name, set]) => {
      const list = [...set].sort()
      // names only (no links): the rows stay short enough for search tools that skip very long lines
      const shown = list.slice(0, 4).map((f) => `\`${f.replace(/^src\//, '')}\``)
      return `| \`${name}\` | ${shown.join(', ')}${list.length > 4 ? `, and ${list.length - 4} more` : ''} |`
    })
}

/** Every folder of src/ with its files: code files with their line, tests and stylesheets named beside them. */
function srcFiles() {
  const out = []
  const dirs = [...dirSet].filter((d) => d === 'src' || d.startsWith('src/')).sort((a, b) => a.localeCompare(b, 'en'))
  for (const dir of dirs) {
    const here = files.filter((f) => f.startsWith(`${dir}/`) && !f.slice(dir.length + 1).includes('/'))
    if (here.length === 0) continue
    out.push(`### ${dir}/`, '')
    if (folders[dir]) out.push(folders[dir], '')
    const code = here.filter(isCode)
    const used = new Set(code)
    for (const f of code) {
      const stem = f.replace(/\.(tsx?|mjs)$/, '')
      const extras = []
      for (const [suffix, label] of [
        ['.module.css', 'styles'],
        ['.test.ts', 'test'],
        ['.test.tsx', 'test'],
      ]) {
        if (fileSet.has(stem + suffix)) {
          extras.push(link(stem + suffix, label))
          used.add(stem + suffix)
        }
      }
      const about = describe(f)
      out.push(`- ${link(f, f.slice(dir.length + 1))}${extras.length ? ` (${extras.join(', ')})` : ''}${about ? `: ${about}` : ''}`)
    }
    const rest = here.filter((f) => !used.has(f))
    if (rest.length > 12) out.push(`- and ${rest.length} other files (${[...new Set(rest.map((f) => f.split('.').pop()))].join(', ')})`)
    else for (const f of rest) out.push(`- ${link(f, f.slice(dir.length + 1))}`)
    out.push('')
  }
  return out
}

/** What a file of a row decides, by its kind: the first thing a reader wants to know before opening it. */
function role(f) {
  if (f.endsWith('.module.css') || f.endsWith('.css')) return 'the look: size, colour, spacing, see-through, motion'
  if (f.endsWith('.tsx')) return f.startsWith('src/ui/') ? 'shared part: what it is made of' : 'what is shown and when'
  if (f.endsWith('.json')) return 'data'
  return 'the rules behind it'
}

const anchor = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-')

/**
 * "What you see" -> files, one short block a row: lines, not a table, so that a search tool that skips very long
 * lines still shows them, and each file says what it decides.
 */
function whereBlocks() {
  const out = []
  const areas = [...new Set(where.map((e) => e.area))]
  // a few to a line: one line of all of them would be too long for search tools
  out.push('Headings:')
  for (let i = 0; i < areas.length; i += 6) out.push(areas.slice(i, i + 6).map((a) => `[${a}](#${anchor(a)})`).join(' · ') + (i + 6 < areas.length ? ' ·' : ''))
  out.push('')
  for (const area of areas) {
    out.push(`### ${area}`, '')
    for (const e of where.filter((x) => x.area === area)) {
      const text = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
      out.push(`- **${text(e.see)}**`)
      for (const f of e.files ?? []) out.push(`  - ${link(f)} (${role(f)})`)
      if (e.find) out.push(`  - Find it: ${text(e.find)}`)
      if (e.note) out.push(`  - Note: ${text(e.note)}`)
    }
    out.push('')
  }
  return out
}

// ---- the page -------------------------------------------------------------------------------------
const page = [
  '# Code map: where things are',
  '',
  '<!-- Written by tools/gen-code-map.mjs (npm run map). Do not edit this file: edit tools/code-map/ and the comments in the code, then run the command. -->',
  '',
  intro,
  '',
  '## Where is … ?',
  '',
  'What a person sees or does in the app, and the files responsible for it, grouped under the headings below. Each file says what it decides: for a problem with how something looks or moves, open the one marked "the look"; for a problem with what appears or when, the one marked "what is shown and when".',
  '',
  ...whereBlocks(),
  '## The screens',
  '',
  'Every address of the app and the file of its page (from the table at the top of [`src/app/routes.tsx`](../src/app/routes.tsx), the only place where routes are declared).',
  '',
  '| Address | Page | Layout | Screen of the TV app |',
  '|---|---|---|---|',
  ...screens(),
  '',
  '## Markers in the page',
  '',
  'Attributes the components put on their elements. Right-click the thing in the browser, choose Inspect, look at the element and the ones around it for an attribute that starts with `data-`, and find it here.',
  '',
  '| Marker | Set in |',
  '|---|---|',
  ...markers(),
  '',
  '## The project',
  '',
  '```text',
  projectTree(),
  '```',
  '',
  '## The source folder',
  '',
  '```text',
  tree('src', 3),
  '```',
  '',
  '## Every file of the source folder',
  '',
  'Each file with the first sentence of its own comment. A file is listed with its stylesheet (the look) and its test when it has them.',
  '',
  ...srcFiles(),
].join('\n')

const text = `${page.replace(/\n{3,}/g, '\n\n').trimEnd()}\n`

if (process.argv.includes('--check')) {
  const current = existsSync(join(root, OUT)) ? read(OUT).replace(/\r\n/g, '\n') : ''
  if (current !== text) problems.push(`${OUT} is out of date: run "npm run map"`)
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  console.log(`${OUT} is up to date`)
} else {
  writeFileSync(join(root, OUT), text)
  for (const p of problems) console.warn(`warning: ${p}`)
  console.log(`${OUT}: ${where.length} "where is" entries, ${files.filter((f) => f.startsWith('src/') && isCode(f)).length} source files, ${Object.keys(folders).length} folder descriptions${problems.length ? `, ${problems.length} warnings` : ''}`)
  if (problems.length) process.exitCode = 1
}

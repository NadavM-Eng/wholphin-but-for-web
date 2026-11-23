// Writes a readable copy of a Claude Code session of this project: the chat between the owner and the lead, every
// subagent's chat, every workflow run, and the pictures in them. The output is local only (git-ignored: a session
// holds local paths and private details and is not part of the published repository).
//
//   node tools/export-conversation.mjs                  the newest session of this project
//   node tools/export-conversation.mjs "<session>"      a session .jsonl file, its folder, or its id
//     --limit 2000        characters kept of each tool input and output (0 = everything)
//     --no-agent-images   leave the pictures out of the subagents' chats (they are most of the size)
//     --force             write every subagent chat again, also the unchanged ones
//     --every 5 --quiet   for a Claude Code "Stop" hook: count the replies, rebuild on every 5th, print nothing
//
// Output:
//   conversation.md                    the chat, in order, with pictures and a link at each subagent / workflow start
//   conversation/index.md              every subagent chat and workflow run, in order of start
//   conversation/agents/<id>.md        one subagent's whole chat (brief, replies, tool calls, results)
//   conversation/workflows/<run>.md    one workflow run: its script, its agents, what each returned
//   conversation/images/<hash>.<ext>   the pictures, each stored once
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const option = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback)
const LIMIT = Number(option('--limit', '2000'))
const AGENT_IMAGES = !flag('--no-agent-images')
const FORCE = flag('--force')
const QUIET = flag('--quiet')
const EVERY = Number(option('--every', '0'))
let positional = argv.filter((a, i) => !a.startsWith('--') && !['--limit', '--every'].includes(argv[i - 1]))[0]

// As a Claude Code "Stop" hook (--every N): count the replies and do the work on every Nth only. The hook hands
// over the session's transcript on standard input, so the copy is of the session that just replied.
if (EVERY > 0) {
  mkdirSync(join(root, 'conversation'), { recursive: true })
  const counter = join(root, 'conversation', '.replies')
  const n = (Number(existsSync(counter) ? readFileSync(counter, 'utf8') : 0) || 0) + 1
  writeFileSync(counter, String(n))
  if (n % EVERY !== 0) process.exit(0)
  if (!positional && !process.stdin.isTTY) {
    try {
      positional = JSON.parse(readFileSync(0, 'utf8')).transcript_path
    } catch {
      // no hook input: the newest session of the project
    }
  }
}

// ---- which session ---------------------------------------------------------------------------
function findSession(arg) {
  const projects = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects')
  if (arg && existsSync(arg)) return statSync(arg).isDirectory() ? `${arg.replace(/[\\/]+$/, '')}.jsonl` : arg
  // Claude Code names a project's folder after its path, every other character replaced by a dash
  const slug = root.replace(/[^A-Za-z0-9]/g, '-').toLowerCase()
  const dir = existsSync(projects) ? readdirSync(projects).find((n) => n.toLowerCase() === slug) : null
  if (!dir) return null
  const files = readdirSync(join(projects, dir))
    .filter((n) => n.endsWith('.jsonl') && (!arg || n.startsWith(arg)))
    .map((n) => join(projects, dir, n))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return files[0] ?? null
}
const sessionFile = findSession(positional)
if (!sessionFile || !existsSync(sessionFile)) {
  console.error('No session found. Usage: node tools/export-conversation.mjs ["<session .jsonl, folder or id>"]')
  process.exit(1)
}
const sessionDir = sessionFile.replace(/\.jsonl$/, '')
const out = join(root, 'conversation')
for (const d of ['agents', 'workflows', 'images']) mkdirSync(join(out, d), { recursive: true })

// ---- small helpers ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const oneLine = (s, max = 110) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}
const cut = (s, limit = LIMIT) => {
  const t = String(s ?? '')
  return limit > 0 && t.length > limit ? `${t.slice(0, limit)}\n[… ${t.length - limit} more characters]` : t
}
/** A code block whose fence is longer than any run of backticks inside it. */
const code = (text, lang = '') => {
  const t = String(text ?? '').replace(/\s+$/, '')
  const longest = Math.max(2, ...(t.match(/`+/g) ?? []).map((m) => m.length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}${lang}\n${t}\n${fence}`
}
const details = (summary, body) => `\n<details>\n<summary>${esc(oneLine(summary, 160))}</summary>\n\n${body}\n\n</details>\n`
const when = (ts) => (ts ? new Date(ts).toLocaleString('sv-SE').slice(0, 16) : '')
/** Reminders the app adds around a message: not part of what was said. */
const clean = (s) => String(s ?? '').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim()
const tag = (s, name) => (String(s).match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)) ?? [])[1]?.trim()
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}
async function* records(file) {
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
    if (!line) continue
    try {
      yield JSON.parse(line)
    } catch {
      // a half-written last line of a running session
    }
  }
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }
let imageCount = 0
/** Stores a picture once, under the hash of its content; returns its file name. */
function saveImage(bytes, ext) {
  const name = `${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}.${ext}`
  const file = join(out, 'images', name)
  if (!existsSync(file)) {
    writeFileSync(file, bytes)
    imageCount++
  }
  return name
}
const saveBlock = (block) => saveImage(Buffer.from(block.source.data, 'base64'), EXT[block.source.media_type] ?? 'png')

// ---- what exists: subagent transcripts and workflow runs ---------------------------------------
const agents = new Map() // id -> { file, meta, run, label, phase }
const runs = new Map() // runId -> { info, journal, agentIds }
const subDir = join(sessionDir, 'subagents')
function collectAgents(dir, run) {
  if (!existsSync(dir)) return
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) collectAgents(join(dir, e.name), e.name.startsWith('wf_') ? e.name : run)
    else if (/^agent-.*\.jsonl$/.test(e.name)) {
      const id = e.name.replace(/^agent-|\.jsonl$/g, '')
      agents.set(id, { file: join(dir, e.name), meta: readJson(join(dir, `agent-${id}.meta.json`)) ?? {}, run })
    }
  }
}
collectAgents(subDir, null)
const wfDir = join(subDir, 'workflows')
const scriptDir = join(sessionDir, 'workflows', 'scripts')
const scripts = existsSync(scriptDir) ? readdirSync(scriptDir) : []
for (const run of existsSync(wfDir) ? readdirSync(wfDir) : []) {
  const journalFile = join(wfDir, run, 'journal.jsonl')
  const journal = existsSync(journalFile)
    ? readFileSync(journalFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l)
          } catch {
            return null
          }
        })
        .filter(Boolean)
    : []
  const info = readJson(join(sessionDir, 'workflows', `${run}.json`)) ?? {}
  if (!info.workflowName) {
    // a run that is still going has no record yet; its script file carries the name and the start time
    const script = scripts.find((n) => n.includes(run))
    if (script) {
      info.workflowName = script.replace(/-wf_.*$/, '')
      info.status = 'not finished'
      info.timestamp = statSync(join(scriptDir, script)).birthtime.toISOString()
      info.script = readFileSync(join(scriptDir, script), 'utf8')
    }
  }
  const agentIds = []
  for (const e of journal) {
    if (e.type !== 'started' || !e.agentId) continue
    agentIds.push(e.agentId)
    const a = agents.get(e.agentId)
    if (a) Object.assign(a, { label: e.label, phase: e.phase, run })
  }
  runs.set(run, { info, journal, agentIds })
}
const agentTitle = (id) => {
  const a = agents.get(id)
  return a ? a.label || a.meta.description || a.meta.agentType || id : id
}

// ---- turning records into markdown --------------------------------------------------------------
/**
 * One chat. `up` is the path from the chat's file to the `conversation` folder; `main` is the owner's chat with the
 * lead (the other chats are a subagent's: there the first message is its brief).
 */
function makeChat({ up, main, images }) {
  const md = []
  const pending = new Map() // tool_use id -> block
  const shown = new Set() // uuids of the owner's messages already written
  let speaker = ''
  const counts = { messages: 0, replies: 0, tools: 0, pictures: 0 }
  const agentLink = (id) => (agents.has(id) ? `[${esc(agentTitle(id))}](${up}agents/${id}.md)` : `\`${id}\``)
  const img = (name) => {
    counts.pictures++
    return `![picture](${up}images/${name})`
  }
  const say = (who, ts) => {
    if (speaker !== who) md.push(`\n## ${who}${ts ? ` · ${when(ts)}` : ''}\n`)
    speaker = who
  }

  /** Text and pictures of a message's content. */
  function parts(content, keepImages = true) {
    if (typeof content === 'string') return { text: content, pics: [] }
    const text = []
    const pics = []
    for (const b of Array.isArray(content) ? content : []) {
      if (b.type === 'text') text.push(b.text)
      else if (b.type === 'image' && b.source?.data && keepImages) pics.push(saveBlock(b))
    }
    return { text: text.join('\n'), pics }
  }

  function human(content, ts, note) {
    const { text, pics } = parts(content)
    const body = clean(text)
    if (!body && pics.length === 0) return
    counts.messages++
    speaker = ''
    say(main ? 'Owner' : 'Lead', ts)
    if (note) md.push(`*${note}*\n`)
    if (body) md.push(`${body}\n`)
    for (const p of pics) md.push(`${img(p)}\n`)
  }

  function notice(text, ts) {
    const summary = tag(text, 'summary') ?? oneLine(clean(text), 200)
    const status = tag(text, 'status')
    speaker = ''
    md.push(`\n> *Background task${status ? ` ${status}` : ''} · ${when(ts)}:* ${esc(oneLine(summary, 300))}\n`)
  }

  function report(origin, text, ts) {
    speaker = ''
    const body = origin?.handbackReportText ?? clean(text)
    md.push(`\n**Report from subagent ${origin?.from ? agentLink(origin.from) : ''}** · ${when(ts)}\n${details('The report', body)}`)
  }

  function inputOf(name, input) {
    if (input == null) return ''
    if (typeof input.command === 'string') return code(cut(input.command), name === 'PowerShell' ? 'powershell' : 'bash')
    if (name === 'Edit') return `\`${input.file_path}\`\n\nReplace:\n\n${code(cut(input.old_string))}\n\nWith:\n\n${code(cut(input.new_string))}`
    if (name === 'Write') return `\`${input.file_path}\`\n\n${code(cut(input.content))}`
    const rest = { ...input }
    delete rest.description
    return Object.keys(rest).length ? code(cut(JSON.stringify(rest, null, 2)), 'json') : ''
  }

  function tool(block, result, extra, ts) {
    const { name, input = {} } = block
    if (name === 'mcp__ccd_turn__update_plan') return // the app's task list: not part of the chat
    counts.tools++
    const res = result ? parts(result.content, images) : { text: '', pics: [] }
    const failed = result?.is_error ? ' (failed)' : ''
    const pictures = res.pics.map((p) => `${img(p)}\n`).join('\n')
    say(main ? 'Claude' : 'Agent', ts)

    if (name === 'mcp__ccd_session__mark_chapter') {
      md.push(`\n---\n\n# ${esc(input.title ?? 'Chapter')}\n`)
      speaker = ''
      return
    }
    if (name === 'mcp__ccd_turn__wrap_up') {
      const buttons = (input.actions ?? []).map((a) => `[${a.label ?? a.action}]`).join(' ')
      md.push(`\n> **Recap:** ${oneLine(input.recap, 2000)}${input.ask ? `\n>\n> **Question:** ${oneLine(input.ask, 500)} ${buttons}` : ''}\n`)
      return
    }
    if (name === 'AskUserQuestion') {
      const answers = extra?.answers ?? {}
      for (const q of input.questions ?? []) {
        md.push(`\n**Question to the owner:** ${q.question}\n\n${(q.options ?? []).map((o) => `- ${o.label}: ${o.description ?? ''}`).join('\n')}\n`)
        if (answers[q.question]) md.push(`\n**Answer:** ${answers[q.question]}\n`)
      }
      if (Object.keys(answers).length === 0 && res.text) md.push(`\n**Answer:** ${cut(res.text)}\n`)
      return
    }
    if (name === 'SendUserFile') {
      md.push(`\n**Sent to the owner${input.caption ? `:** ${input.caption}` : '**'}\n`)
      for (const f of input.files ?? []) {
        const ext = extname(f).slice(1).toLowerCase()
        const file = resolve(root, f)
        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) && existsSync(file)) md.push(`\n${img(saveImage(readFileSync(file), ext === 'jpeg' ? 'jpg' : ext))}\n`)
        else md.push(`\n- \`${f}\`${existsSync(file) ? '' : ' (the file no longer exists)'}\n`)
      }
      return
    }
    if (name === 'Agent' || name === 'Task') {
      const id = extra?.agentId
      md.push(`\n**Subagent started: ${id ? agentLink(id) : esc(input.description ?? '')}** (${[input.subagent_type, input.model].filter(Boolean).join(', ') || 'general-purpose'})\n`)
      md.push(details('Its brief', code(cut(input.prompt, LIMIT * 4))))
      if (res.text) md.push(details(`What came back at once${failed}`, code(cut(res.text))))
      return
    }
    if (name === 'Workflow') {
      const run = extra?.runId
      const title = extra?.workflowName ?? input.name ?? 'workflow'
      md.push(`\n**Workflow started: ${run && runs.has(run) ? `[${esc(title)}](${up}workflows/${run}.md)` : esc(title)}**${extra?.summary ? ` — ${extra.summary}` : ''}\n`)
      if (!run && res.text) md.push(details(`Result${failed}`, code(cut(res.text))))
      return
    }
    if (name === 'StructuredOutput' || /handback/i.test(name)) {
      md.push(`\n**Result returned:**\n\n${code(cut(JSON.stringify(input, null, 2), LIMIT * 8), 'json')}\n`)
      return
    }
    const about = input.description ?? input.file_path ?? input.pattern ?? input.url ?? input.query ?? input.skill ?? input.action ?? ''
    const body = [inputOf(name, input), res.text.trim() ? `Output${failed}:\n\n${code(cut(clean(res.text)))}` : result ? '' : '(no result recorded)', pictures].filter(Boolean).join('\n\n')
    md.push(details(`${name.replace(/^mcp__/, '')}${about ? `: ${about}` : ''}${failed}${res.pics.length ? ' (picture)' : ''}`, body || '(nothing)'))
  }

  function record(o) {
    if (o.type === 'assistant' && o.message) {
      for (const b of Array.isArray(o.message.content) ? o.message.content : []) {
        if (b.type === 'text' && b.text.trim()) {
          counts.replies++
          say(main ? 'Claude' : 'Agent', o.timestamp)
          md.push(`${b.text.trim()}\n`)
        } else if (b.type === 'tool_use') pending.set(b.id, { block: b, ts: o.timestamp })
      }
      return
    }
    if (o.type === 'attachment' && o.attachment?.type === 'queued_command') {
      // a message that arrived while a turn was running
      const a = o.attachment
      if (a.origin?.kind === 'human') {
        if (shown.has(a.source_uuid)) return
        shown.add(a.source_uuid)
        human(a.prompt, a.timestamp ?? o.timestamp, 'sent while Claude was working')
      } else if (a.origin?.kind === 'peer') report(a.origin, typeof a.prompt === 'string' ? a.prompt : '', a.timestamp ?? o.timestamp)
      else if (a.commandMode === 'task-notification') notice(typeof a.prompt === 'string' ? a.prompt : '', a.timestamp ?? o.timestamp)
      return
    }
    if (o.type === 'system' && o.subtype === 'compact_boundary') {
      speaker = ''
      md.push(`\n---\n\n*The context was compacted here (${when(o.timestamp)}): Claude went on from a summary of everything above.*\n`)
      return
    }
    if (o.type !== 'user' || !o.message) return
    const content = o.message.content
    if (Array.isArray(content) && content.some((b) => b.type === 'tool_result')) {
      for (const b of content) {
        if (b.type !== 'tool_result') continue
        const call = pending.get(b.tool_use_id)
        pending.delete(b.tool_use_id)
        if (call) tool(call.block, b, o.toolUseResult, call.ts)
      }
      return
    }
    const text = parts(content, false).text
    if (o.isCompactSummary) {
      md.push(details('The summary Claude continued from', clean(text)))
      return
    }
    if (o.isMeta) return // skill texts and other material the app adds
    if (o.origin?.kind === 'peer') return report(o.origin, text, o.timestamp)
    if (o.origin?.kind === 'task-notification' || /^\s*<task-notification>/.test(text)) return notice(text, o.timestamp)
    if (o.origin?.kind === 'human' || !main) {
      if (shown.has(o.uuid)) return
      shown.add(o.uuid)
      return human(content, o.timestamp)
    }
    const body = clean(text)
    if (/^\[Request interrupted/.test(body)) {
      speaker = ''
      md.push(`\n> *The owner stopped the reply here · ${when(o.timestamp)}*\n`)
    } else if (body) md.push(details(`Added by the app: ${oneLine(body, 80)}`, code(cut(body))))
  }

  function end() {
    // calls that never got a result: the session stopped, or they are still running
    for (const { block, ts } of pending.values()) tool(block, null, null, ts)
    pending.clear()
  }

  return { md, counts, record, end }
}

// ---- the subagents' chats -----------------------------------------------------------------------
let written = 0
let kept = 0
for (const [id, a] of agents) {
  const dest = join(out, 'agents', `${id}.md`)
  const source = statSync(a.file)
  a.started = source.birthtimeMs
  if (!FORCE && existsSync(dest) && statSync(dest).mtimeMs > source.mtimeMs) {
    kept++
    const head = readFileSync(dest, 'utf8').slice(0, 600)
    a.started = Date.parse((head.match(/- started: (.+)/) ?? [])[1] ?? '') || a.started
    continue
  }
  const chat = makeChat({ up: '../', main: false, images: AGENT_IMAGES })
  let model = ''
  let first = ''
  for await (const o of records(a.file)) {
    first ||= o.timestamp ?? ''
    if (o.type === 'assistant') model = o.message?.model || model
    chat.record(o)
  }
  chat.end()
  if (first) a.started = Date.parse(first)
  const head = [
    `# ${agentTitle(id)}`,
    '',
    `- id: ${id}`,
    `- type: ${a.meta.agentType ?? ''}`,
    `- model: ${model || a.meta.model || ''}`,
    a.run ? `- workflow run: [${runs.get(a.run)?.info.workflowName ?? a.run}](../workflows/${a.run}.md)${a.phase ? `, phase ${a.phase}` : ''}` : null,
    `- started: ${first ? new Date(first).toISOString() : ''}`,
    `- ${chat.counts.replies} replies, ${chat.counts.tools} tool calls, ${chat.counts.pictures} pictures`,
    '',
    '[Back to the conversation](../../conversation.md) · [All subagents](../index.md)',
    '',
  ].filter((l) => l !== null)
  writeFileSync(dest, `${head.join('\n')}${chat.md.join('\n')}\n`)
  written++
  if (written % 25 === 0 && !QUIET) console.log(`  ${written} subagent chats written…`)
}

// ---- the workflow runs --------------------------------------------------------------------------
for (const [run, { info, journal, agentIds }] of runs) {
  const results = new Map()
  for (const e of journal) if (e.type === 'result') results.set(e.agentId ?? e.key, e)
  const md = [
    `# Workflow: ${info.workflowName ?? run}`,
    '',
    `- run: ${run}`,
    info.timestamp ? `- started: ${when(info.timestamp)}` : null,
    info.status ? `- status: ${info.status}` : null,
    info.durationMs ? `- duration: ${Math.round(info.durationMs / 60000)} minutes` : null,
    `- agents: ${agentIds.length} started, ${results.size} returned`,
    info.summary ? `- summary: ${info.summary}` : null,
    info.error ? `- error: ${oneLine(info.error, 400)}` : null,
    '',
    '[Back to the conversation](../../conversation.md) · [All subagents](../index.md)',
    '',
    '## Agents',
    '',
    ...agentIds.map((id) => `- ${agents.has(id) ? `[${esc(agentTitle(id))}](../agents/${id}.md)` : esc(id)}${agents.get(id)?.phase ? ` (${agents.get(id).phase})` : ''}: ${results.has(id) ? 'returned' : 'no result recorded'}`),
    '',
    '## What each agent returned',
    ...agentIds
      .filter((id) => results.has(id))
      .map((id) => {
        const r = results.get(id).result
        return details(agentTitle(id), code(cut(typeof r === 'string' ? r : JSON.stringify(r, null, 2), LIMIT * 8)))
      }),
    info.result != null ? `\n## What the run returned\n\n${code(cut(typeof info.result === 'string' ? info.result : JSON.stringify(info.result, null, 2), LIMIT * 8))}` : null,
    info.script ? `\n## The script\n\n${code(info.script, 'js')}` : null,
    '',
  ].filter((l) => l !== null)
  writeFileSync(join(out, 'workflows', `${run}.md`), md.join('\n'))
}

// ---- the chat itself ------------------------------------------------------------------------------
const chat = makeChat({ up: 'conversation/', main: true, images: true })
let firstAt = ''
let lastAt = ''
for await (const o of records(sessionFile)) {
  if (o.timestamp) {
    firstAt ||= o.timestamp
    lastAt = o.timestamp
  }
  chat.record(o)
}
chat.end()
const title = readJson(join(sessionDir, 'custom-title.json'))?.customTitle ?? basename(sessionDir)
writeFileSync(
  join(root, 'conversation.md'),
  [
    `# ${title}`,
    '',
    `The conversation of this project, from ${when(firstAt)} to ${when(lastAt)}. Written by \`tools/export-conversation.mjs\`; run \`npm run conversation\` to bring it up to date. Local only: it is not in the repository.`,
    '',
    `- ${chat.counts.messages} messages from the owner, ${chat.counts.replies} replies, ${chat.counts.tools} tool calls (folded: click a line to open it), ${chat.counts.pictures} pictures`,
    `- [${agents.size} subagent chats and ${runs.size} workflow runs](conversation/index.md)`,
    LIMIT > 0 ? `- Tool inputs and outputs are cut at ${LIMIT} characters; the messages themselves are whole.` : null,
    '',
  ]
    .filter((l) => l !== null)
    .join('\n') +
    chat.md.join('\n') +
    '\n',
)

// ---- the index of subagents and runs ---------------------------------------------------------------
const index = [`# Subagents and workflow runs of "${title}"`, '', '[Back to the conversation](../conversation.md)', '', '## Workflow runs', '']
for (const [run, { info, agentIds }] of [...runs].sort((a, b) => String(a[1].info.timestamp ?? '').localeCompare(String(b[1].info.timestamp ?? ''))))
  index.push(`- ${when(info.timestamp)} [${esc(info.workflowName ?? run)}](workflows/${run}.md): ${agentIds.length} agents${info.status ? `, ${info.status}` : ''}`)
index.push('', '## Subagent chats', '')
for (const [id, a] of [...agents].sort((x, y) => (x[1].started ?? 0) - (y[1].started ?? 0)))
  index.push(`- ${when(a.started)} [${esc(agentTitle(id))}](agents/${id}.md)${a.run ? ` (workflow ${esc(runs.get(a.run)?.info.workflowName ?? a.run)})` : ''}`)
writeFileSync(join(out, 'index.md'), `${index.join('\n')}\n`)

if (!QUIET)
  console.log(
    `conversation.md: ${chat.counts.messages} owner messages, ${chat.counts.replies} replies, ${chat.counts.tools} tool calls\n` +
      `conversation/: ${written} subagent chats written, ${kept} unchanged, ${runs.size} workflow runs, ${imageCount} new pictures`,
  )

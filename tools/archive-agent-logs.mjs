// Archives what the build agents were asked and what they reported, so the project history can be
// documented from primary sources. Reads a Claude Code session folder (subagent transcripts and
// workflow journals) and writes a compact, readable copy to .agent-logs/ (git-ignored: raw logs
// contain local paths and are not part of the published repository).
//
//   node tools/archive-agent-logs.mjs "<session folder>"
//
// Output:
//   .agent-logs/agents/<id>.md             brief + final report of each directly spawned agent
//   .agent-logs/workflows/<run>/script.js  the orchestration script of each workflow run
//   .agent-logs/workflows/<run>/agents.md  every workflow agent: label, phase, and its returned result
//   .agent-logs/index.md                   one line per agent / run
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const session = process.argv[2]
if (!session || !existsSync(session)) {
  console.error('usage: node tools/archive-agent-logs.mjs "<session folder>"')
  process.exit(1)
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, '.agent-logs')
mkdirSync(join(out, 'agents'), { recursive: true })
mkdirSync(join(out, 'workflows'), { recursive: true })

const readJsonl = (file) =>
  readFileSync(file, 'utf8')
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

const textOf = (content) => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

const index = ['# Agent log archive', '', `Generated from ${session}`, '']

// ---- directly spawned agents -------------------------------------------------------------
const subDir = join(session, 'subagents')
index.push('## Directly spawned agents', '')
for (const f of readdirSync(subDir).filter((n) => /^agent-.*\.jsonl$/.test(n)).sort()) {
  const id = f.replace(/^agent-|\.jsonl$/g, '')
  const metaFile = join(subDir, `agent-${id}.meta.json`)
  const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {}
  const entries = readJsonl(join(subDir, f))
  const firstUser = entries.find((e) => e.type === 'user' && e.message)
  const brief = firstUser ? textOf(firstUser.message.content) : ''
  let report = ''
  let toolUses = 0
  let model = ''
  for (const e of entries) {
    if (e.type !== 'assistant' || !e.message) continue
    model = e.message.model || model
    const content = Array.isArray(e.message.content) ? e.message.content : []
    for (const b of content) {
      if (b.type === 'tool_use') {
        toolUses++
        // the hand-back tool carries the final report
        if (/handback/i.test(b.name || '')) report = typeof b.input === 'string' ? b.input : Object.values(b.input || {}).join('\n')
      }
    }
    const t = textOf(content)
    if (t.trim() && !report) report = t // falls back to the last plain-text message
  }
  const title = meta.description || meta.agentType || id
  writeFileSync(
    join(out, 'agents', `${id}.md`),
    `# ${title}\n\n- id: ${id}\n- type: ${meta.agentType ?? ''}\n- model: ${model}\n- tool calls: ${toolUses}\n\n## Brief\n\n${brief}\n\n## Final report\n\n${report}\n`,
  )
  index.push(`- [${title}](agents/${id}.md) — ${model}, ${toolUses} tool calls`)
}

// ---- workflow runs -----------------------------------------------------------------------
index.push('', '## Workflow runs', '')
const wfDir = join(subDir, 'workflows')
const scriptDir = join(session, 'workflows', 'scripts')
for (const run of existsSync(wfDir) ? readdirSync(wfDir).sort() : []) {
  const dest = join(out, 'workflows', run)
  mkdirSync(dest, { recursive: true })
  const script = existsSync(scriptDir) ? readdirSync(scriptDir).find((n) => n.includes(run)) : null
  if (script) writeFileSync(join(dest, 'script.js'), readFileSync(join(scriptDir, script)))
  const journalFile = join(wfDir, run, 'journal.jsonl')
  if (!existsSync(journalFile)) continue
  const journal = readJsonl(journalFile)
  const started = new Map()
  const results = new Map()
  for (const e of journal) {
    const k = e.agentId ?? e.key
    if (e.type === 'started') started.set(k, e)
    if (e.type === 'result') results.set(e.agentId ?? e.key, e)
  }
  let md = `# Workflow ${script ? script.replace(/-wf_.*$/, '') : run}\n\nRun ${run}. ${started.size} agents started, ${results.size} returned.\n`
  for (const [k, s] of started) {
    const r = results.get(k) ?? [...results.values()].find((x) => x.key === s.key)
    md += `\n## ${s.label ?? k}\n\n- phase: ${s.phase ?? ''}\n- status: ${r ? 'returned' : 'no result recorded (running, failed, or skipped)'}\n`
    if (r) md += `\n\`\`\`json\n${JSON.stringify(r.result ?? r, null, 2)}\n\`\`\`\n`
  }
  writeFileSync(join(dest, 'agents.md'), md)
  index.push(`- [${script ? script.replace(/-wf_.*$/, '') : run}](workflows/${run}/agents.md) — ${started.size} agents, ${results.size} returned`)
}

writeFileSync(join(out, 'index.md'), index.join('\n') + '\n')
console.log(`archived to ${out}`)

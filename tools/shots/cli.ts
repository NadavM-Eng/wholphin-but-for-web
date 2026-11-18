// Screenshot crawler entry: npm run shots -- --help
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Browser } from '@playwright/test'
import { defaultRunName, HELP, matchesAny, parseArgs } from './args.ts'
import { capture, launch, obtainSession, resolveScenes } from './capture.ts'
import { mappedScenes, writeCompareSheet } from './compare.ts'
import { ensureDevServer, ROOT } from './devServer.ts'
import { hasFailures, sortEntries, summarize, writeReports } from './report.ts'
import { SCENES } from './scenes.ts'
import { writeContactSheet } from './sheet.ts'
import { VIEWPORTS, type RunReport } from './types.ts'

async function main(): Promise<number> {
  const o = parseArgs(process.argv.slice(2))
  if (o.help) {
    console.log(HELP)
    return 0
  }
  const outRoot = path.join(ROOT, 'shots', 'out')
  const compareMode = o.compare
  if (compareMode) {
    if (!o.scene.length) o.scene = mappedScenes()
    if (!o.explicit.theme) o.theme = ['PURPLE']
    if (!o.explicit.viewport) o.viewport = VIEWPORTS.filter((v) => v.name.startsWith('desktop'))
    if (!o.explicit.channel) o.channel = 'msedge'
  }
  const run = o.run ?? `${defaultRunName()}${o.rtl ? '-rtl' : ''}${compareMode ? '-compare' : ''}`
  const runDir = path.join(outRoot, run)

  if (compareMode && o.noCapture) {
    const file = path.join(runDir, 'report.json')
    const report = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as RunReport) : null
    const out = writeCompareSheet(runDir, report, o.theme[0])
    console.log(`[shots] compare sheet: ${out}`)
    return 0
  }

  // the reference-picture states (compareOnly) run in compare mode or when --scene names them, never in a plain crawl
  const selected = SCENES.filter(
    (s) => matchesAny(o.scene, s.name) && (!s.servers || s.servers.includes(o.server)) && (!s.compareOnly || compareMode || o.scene.length > 0),
  )
  if (selected.length === 0) throw new Error(`No scene matches --scene ${o.scene.join(',')}. Try --list.`)
  const names = new Set(SCENES.map((s) => s.name))
  if (names.size !== SCENES.length) throw new Error('Duplicate scene names in tools/shots/scenes.ts')

  const server = await ensureDevServer({ port: o.port, url: o.url })
  let browser: Browser | null = null
  const cleanup = async () => {
    await browser?.close().catch(() => {})
    server.stop()
  }
  // Ctrl+C / kill: stop the dev server and the browser this process started instead of relying on pipe closure
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(sig, () => {
      void cleanup().finally(() => process.exit(130))
    })
  }
  const startedAt = new Date().toISOString()
  let exit = 0
  try {
    browser = await launch(o.engine, o.channel)
    if (o.engine !== 'chromium') console.log(`[shots] engine: ${o.engine}`)
    console.log(`[shots] signing in to the ${o.server} server through /dev/login`)
    const session = await obtainSession(browser, server.origin, o.server)
    const scenes = await resolveScenes(selected, session.jf)
    if (o.list) {
      for (const s of scenes) console.log(`${s.url ? 'ok  ' : 'skip'} ${s.scene.name.padEnd(34)} ${s.url ?? s.skipReason}`)
      return 0
    }
    mkdirSync(runDir, { recursive: true })
    const skipped = scenes.filter((s) => !s.url).length
    console.log(
      `[shots] run "${run}": ${scenes.length - skipped} scenes x ${o.viewport.length} viewports x ${o.theme.length} themes` +
        `${skipped ? ` (${skipped} scenes skipped: no data)` : ''}${o.rtl ? ', RTL' : ''}`,
    )
    const entries = sortEntries(
      await capture({ options: o, origin: server.origin, runDir, scenes, session, browser }),
      SCENES.map((s) => s.name),
    )
    const report: RunReport = {
      run,
      startedAt,
      finishedAt: new Date().toISOString(),
      server: o.server,
      origin: server.origin,
      rtl: o.rtl,
      engine: o.engine,
      args: process.argv.slice(2),
      totals: summarize(entries),
      entries,
    }
    writeReports(runDir, report)
    writeContactSheet(runDir, report)
    writeFileSync(path.join(outRoot, 'latest.json'), JSON.stringify({ run }))
    if (compareMode) console.log(`[shots] compare sheet: ${writeCompareSheet(runDir, report, o.theme[0])}`)
    const t = report.totals
    console.log(`[shots] ${t.shots} pictures: ${t.ok} ok, ${t.warn} warn, ${t.error} error; ${t.skipped} scenes skipped`)
    console.log(`[shots] contact sheet: ${path.join(runDir, 'index.html')}`)
    console.log(`[shots] report:        ${path.join(runDir, 'report.html')}`)
    if (o.strict && hasFailures(report, o.strictWarnings)) {
      console.error('[shots] --strict: failing because of issues above')
      exit = 1
    }
  } finally {
    await cleanup()
  }
  return exit
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error('[shots] failed:', err instanceof Error ? err.message : err)
    process.exit(2)
  },
)

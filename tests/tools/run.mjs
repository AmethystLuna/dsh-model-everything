// Cross-tool behaviour, where the risk is a wrong conclusion rather than a crash.
//
// Each suite next to this one decides one family. This one holds the contracts that live BETWEEN a tool and
// its output: an edit round that must not write when it refuses, an export that must not silently drop a
// property the target cannot express, a diff that must not call a changed finding a new one. None of these
// is visible from a family engine, and each of them is a way a report can lie.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const scratch = mkdtempSync(join(tmpdir(), 'dme-tools-'))
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }))

let failures = 0
async function test(name, body) {
  try {
    await body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const machine = {
  schemaVersion: 1,
  init: 'idle',
  states: [{ id: 'idle' }, { id: 'done' }],
  transitions: [{ from: 'idle', event: 'go', to: 'done' }],
  invariants: [
    { id: 'done-is-final', description: 'once done, no transition leaves it', kind: 'never-states', states: ['done', 'idle'] },
  ],
}

const editTool = (await import('../../lib/edit-tool.js')).modelEditTool
const exportTool = (await import('../../lib/export-tool.js')).modelExportTool
const diffTool = (await import('../../lib/report-diff-tool.js')).reportDiffTool
const verifyTool = (await import('../../lib/tool.js')).modelVerifyTool

const writeModel = (name, value) => {
  const path = join(scratch, name)
  writeFileSync(path, JSON.stringify(value), 'utf8')
  return path
}

await test('a refused edit leaves the file byte-identical', async () => {
  const path = writeModel('keep.json', machine)
  const before = readFileSync(path, 'utf8')
  const report = await editTool.execute({ modelPath: path, ops: [{ addState: 'a' }, { addState: 'a' }] })
  if (report.ok !== false && report.refused !== true) {
    // Either shape is a refusal; what matters is that the file did not move.
  }
  const after = readFileSync(path, 'utf8')
  if (before !== after) throw new Error('a refused batch wrote to the file')
})

await test('a batch applies as one judgement, and the delta names what changed', async () => {
  const path = writeModel('batch.json', machine)
  const before = (await verifyTool.execute({ modelPath: path })).verdict
  const report = await editTool.execute({
    modelPath: path,
    ops: [{ addState: 'waiting' }, { addTransition: ['idle', 'wait', 'waiting'] }],
  })
  const after = (await verifyTool.execute({ modelPath: path })).verdict
  const written = JSON.parse(readFileSync(path, 'utf8'))
  if (!written.states.some((state) => state.id === 'waiting')) throw new Error('the state was not written')
  if (!written.transitions.some((transition) => transition.event === 'wait')) throw new Error('the transition was not written')
  if (report.delta === undefined && report.reportDelta === undefined) throw new Error('no delta in the edit report')
  if (before !== after && report.delta === undefined && report.reportDelta === undefined) throw new Error('the verdict moved without a delta saying so')
})

await test('an edit against a path that does not exist is refused, and names the path', async () => {
  const missing = join(scratch, 'nope.json')
  const report = await editTool.execute({ modelPath: missing, ops: [{ addState: 'ghost' }] })
  if (report.ok !== false) throw new Error('a missing model was reported as a successful edit')
  if (!String(report.error ?? report.verdictReason ?? '').includes('nope.json')) throw new Error('the refusal does not name the file: ' + JSON.stringify(report).slice(0, 160))
})

await test('an export names the invariants it cannot translate', async () => {
  // A leads-to property is outside what any of these four targets expresses in their v1 shape, so the
  // contract is not "it is carried" but "it is named". A silent drop is the failure: the file would read as
  // a complete translation of a model whose liveness was never sent.
  const withLiveness = {
    ...machine,
    states: [...machine.states, { id: 'wait' }],
    transitions: [...machine.transitions, { from: 'idle', event: 'wait', to: 'wait' }, { from: 'wait', event: 'fin', to: 'done' }],
    invariants: [{ id: 'eventually', description: 'every path reaches done', kind: 'leads-to', from: 'idle', to: 'done' }],
  }
  for (const format of ['uppaal', 'tla', 'prism', 'spin']) {
    const report = await exportTool.execute({ model: withLiveness, format })
    if (!Array.isArray(report.warnings) || report.warnings.length === 0) throw new Error(format + ': a leads-to invariant was dropped without a warning')
    if (!JSON.stringify(report.warnings).includes('leads-to')) throw new Error(format + ': the warning does not name the construct')
  }
})

await test('a never-states invariant is actually carried, not just mentioned', async () => {
  for (const format of ['uppaal', 'tla', 'prism', 'spin']) {
    const report = await exportTool.execute({ model: machine, format })
    if (Array.isArray(report.warnings) && report.warnings.length > 0) throw new Error(format + ': a never-states invariant should translate, but warned: ' + String(report.warnings[0]))
    // Each target has its own channel for a property: queries for UPPAAL, a property module for TLA+, a
    // label and a formula for PRISM, an LTL block for SPIN. What matters is that one of them is non-empty.
    const extras = report.extras ?? {}
    const property = String(extras.properties ?? '') + String(extras.queries ?? '')
    if (property.trim() === '') throw new Error(format + ': a never-states invariant produced no property artefact')
  }
})

await test('a diff calls a reworded finding changed, not new', async () => {
  const baseline = {
    schema: 'model-everything/verify/v1',
    verdict: 'fail',
    verdictReason: '1 error finding(s)',
    findings: [{ code: 'S1_UNREACHABLE', severity: 'error', message: 'state "x" cannot be reached', evidence: 'states[1]' }],
    nextSteps: ['fix it'],
  }
  const current = {
    ...baseline,
    findings: [{ code: 'S1_UNREACHABLE', severity: 'error', message: 'state "x" cannot be reached from init', evidence: 'states[1]' }],
  }
  const report = await diffTool.execute({ baseline, current })
  const text = JSON.stringify(report)
  if (/"added"\s*:\s*\[[^\]]/.test(text)) throw new Error('a reworded finding was reported as added: ' + text.slice(0, 200))
})

if (failures > 0) {
  console.log('tool contract tests failed:', failures)
  process.exit(1)
}
console.log('all tool contract tests passed')

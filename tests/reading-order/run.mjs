// The reading order, checked against the reports it describes.
//
// The skill that tells a reader how to read a report makes claims that are structural: which field holds the verdict, where each family keeps its
// findings, that `nextSteps` is never empty, and that the design review's three lists never share a code. A reader who trusts the map and finds it
// wrong goes looking in a field that does not exist.
import { runCompositionVerification, runVerification } from '../../lib/engine.js'
import { runDataVerification } from '../../lib/data-engine.js'
import { runDesignReview } from '../../lib/design-engine.js'
import { diffReports } from '../../lib/baseline.js'

let failures = 0
function test(name, body) {
  try {
    body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const MACHINE = { schemaVersion: 1, init: 'i', states: [{ id: 'i' }, { id: 'd', terminal: true }], transitions: [{ from: 'i', event: 'go', to: 'd' }] }
const BROKEN = { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }] }
const TABLE = { schemaVersion: 1, entities: [{ name: 'A', fields: [{ name: 'id', type: 'int', required: true }], primaryKey: ['id'] }], relationships: [] }
const DESIGN = {
  schemaVersion: 1,
  architecture: { nodes: ['ui', 'svc', 'db'], edges: [['ui', 'svc'], ['svc', 'db'], ['db', 'ui']] },
  types: [
    { name: 'ui', stereotype: 'component', layer: 'top' },
    { name: 'svc', stereotype: 'component', layer: 'mid' },
    { name: 'db', stereotype: 'component', layer: 'bot' },
  ],
  declare: { layers: [{ name: 'top', members: ['ui'] }, { name: 'mid', members: ['svc'] }, { name: 'bot', members: ['db'] }] },
}

test('the check-carried families put every finding under a check', () => {
  // The table in the skill names these four; a finding at the top level of one of them would be invisible to a reader who looks where told.
  const reports = {
    model_verify: runVerification(BROKEN),
    model_compose_verify: runCompositionVerification([MACHINE, MACHINE], { rendezvous: ['never'] }),
    model_datamodel_verify: runDataVerification(TABLE, { beforeModel: { ...TABLE, entities: [{ name: 'A', fields: [{ name: 'id', type: 'int', required: true }, { name: 'gone', type: 'text' }], primaryKey: ['id'] }] } }),
    model_design_review: runDesignReview(DESIGN),
  }
  for (const [name, report] of Object.entries(reports)) {
    if ((report.findings ?? []).length > 0) throw new Error(name + ' carries top-level findings')
    const nested = (report.checks ?? []).flatMap((check) => check.findings ?? [])
    if (nested.length === 0) throw new Error(name + ' reported nothing under its checks')
  }
})

test('nextSteps is never empty, in any family', () => {
  const reports = {
    verify: runVerification(MACHINE),
    verify_failing: runVerification(BROKEN),
    compose: runCompositionVerification([MACHINE, MACHINE]),
    datamodel: runDataVerification(TABLE),
    design: runDesignReview(DESIGN),
    diff: diffReports(runVerification(BROKEN), runVerification(BROKEN)),
  }
  for (const [name, report] of Object.entries(reports)) {
    const steps = report.nextSteps
    if (!Array.isArray(steps) || steps.length === 0) throw new Error(name + ' has no next step')
  }
})

test('a failing verdict names its first error code in the reason', () => {
  const report = runVerification(BROKEN)
  const firstError = (report.checks ?? []).flatMap((check) => check.findings ?? []).find((finding) => finding.severity === 'error')
  if (firstError === undefined) throw new Error('the broken machine reported no error')
  if (!String(report.verdictReason).includes(String(firstError.code))) {
    throw new Error('the reason does not name ' + String(firstError.code) + ': ' + String(report.verdictReason).slice(0, 80))
  }
})

test('the design review keeps its violations and its signals apart', () => {
  const report = runDesignReview(DESIGN)
  const violations = new Set((report.violations ?? []).map((finding) => String(finding.code)))
  const signals = new Set((report.signals ?? []).map((finding) => String(finding.code)))
  for (const code of violations) if (signals.has(code)) throw new Error(code + ' is in both lists')
  if (violations.size === 0) throw new Error('the cyclic design reported no violation')
  // `facts` is a measurement object, not a finding list: it is where a reader learns which checks never ran.
  if (!Array.isArray(report.facts?.checksSkipped)) throw new Error('facts carries no checksSkipped')
})

test('a diff carries no findings: its subject is the difference', () => {
  const report = diffReports(runVerification(BROKEN), runVerification(BROKEN))
  if ((report.findings ?? []).length > 0) throw new Error('a diff carries findings')
  if (report.verdict !== 'pass') throw new Error('the delta verdict is ' + String(report.verdict))
  if (report.currentVerdict !== 'fail') throw new Error('currentVerdict is ' + String(report.currentVerdict))
})

if (failures > 0) {
  console.log('reading-order tests failed:', failures)
  process.exit(1)
}
console.log('all reading-order tests passed')
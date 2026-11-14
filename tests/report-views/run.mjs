// The two views a report is read in: the body a person reads, and the whole object a tool hands on.
//
// They answer different questions, so they may differ in size and in detail - but never in the conclusion. A reader who switches to `full` to
// hand the report to `report_diff` must not get a different verdict, and the body must not lose the reason or the first thing to do.
import { renderReportText } from '../../lib/report-view.js'
import { runCompositionVerification, runVerification } from '../../lib/engine.js'
import { runDataVerification } from '../../lib/data-engine.js'
import { runDesignReview } from '../../lib/design-engine.js'
import { diffReports } from '../../lib/baseline.js'
import { runConcurrencyScan } from '../../lib/concurrency.js'
import { reviewUml } from '../../lib/uml.js'

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

const REPORTS = {
  'a review that fails': reviewUml({ model: { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }] } }),
  'a review that passes': reviewUml({ model: { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }, { from: 'b', event: 'back', to: 'a' }] } }),
  'a machine that fails': runVerification({ schemaVersion: 1, init: 's0', states: [{ id: 's0' }, { id: 's1', terminal: true }], transitions: [{ from: 's0', event: 'go', to: 's1' }, { from: 's1', event: 'back', to: 's0' }] }),
  // The roster is every family that states a verdict, because the two views are one contract and a family missing from here is a family whose
  // body nobody compares with its object.
  'a composition that fails': runCompositionVerification(
    [{ schemaVersion: 1, init: 'i', states: [{ id: 'i' }, { id: 'd', terminal: true }], transitions: [{ from: 'i', event: 'go', to: 'd' }] },
     { schemaVersion: 1, init: 'i', states: [{ id: 'i' }, { id: 'd', terminal: true }], transitions: [{ from: 'i', event: 'go', to: 'd' }] }],
    { rendezvous: ['never'] }),
  'a data model that fails': runDataVerification(
    { schemaVersion: 1, entities: [{ name: 'A', fields: [{ name: 'id', type: 'int', required: true }], primaryKey: ['id'] }], relationships: [] },
    { beforeModel: { schemaVersion: 1, entities: [{ name: 'A', fields: [{ name: 'id', type: 'int', required: true }, { name: 'gone', type: 'text' }], primaryKey: ['id'] }], relationships: [] } }),
  'a design that fails': runDesignReview({ schemaVersion: 1, architecture: { nodes: ['a', 'b'], edges: [['a', 'b'], ['b', 'a']] } }),
  'a scan that finds an absolute claim': runConcurrencyScan('The cache is guarded by a mutex, so it is thread-safe.'),
  'a delta with an added error': diffReports(
    runVerification({ schemaVersion: 1, init: 'i', states: [{ id: 'i' }, { id: 'd', terminal: true }], transitions: [{ from: 'i', event: 'go', to: 'd' }] }),
    runVerification({ schemaVersion: 1, init: 's0', states: [{ id: 's0' }, { id: 's1', terminal: true }], transitions: [{ from: 's0', event: 'go', to: 's1' }, { from: 's1', event: 'back', to: 's0' }] })),
}

test('the full view is the report itself, and it parses back to the same conclusion', () => {
  for (const [name, report] of Object.entries(REPORTS)) {
    const full = JSON.parse(renderReportText(report, { full: true }))
    if (full.verdict !== report.verdict) throw new Error(name + ': verdict ' + String(full.verdict))
    if (full.verdictReason !== report.verdictReason) throw new Error(name + ': reason changed')
    if (JSON.stringify(full.nextSteps) !== JSON.stringify(report.nextSteps)) throw new Error(name + ': nextSteps changed')
  }
})

test('the body states the verdict, the reason and the first thing to do', () => {
  for (const [name, report] of Object.entries(REPORTS)) {
    const body = renderReportText(report)
    if (!body.includes(report.verdict)) throw new Error(name + ': the body does not state the verdict')
    const reason = String(report.verdictReason)
    // The body may wrap the reason, so the first clause is what has to survive.
    const firstClause = reason.split(' (')[0].split(',')[0]
    if (!body.includes(firstClause)) throw new Error(name + ': the body does not carry the reason: ' + firstClause)
    const step = String(report.nextSteps[0]).slice(0, 24)
    if (!body.includes(step)) throw new Error(name + ': the body does not carry the first step: ' + step)
  }
})

test('the body costs less than the object it summarises', () => {
  for (const [name, report] of Object.entries(REPORTS)) {
    const body = renderReportText(report)
    const full = renderReportText(report, { full: true })
    if (body.length >= full.length) throw new Error(name + ': the body is not shorter (' + String(body.length) + ' vs ' + String(full.length) + ')')
  }
})

if (failures > 0) {
  console.log('report-views tests failed:', failures)
  process.exit(1)
}
console.log('all report-views tests passed')
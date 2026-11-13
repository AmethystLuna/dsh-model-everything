// The summary counters, against the details they summarise.

// A reader takes `summary.errors` and `summary.checksRun` at face value - they are the numbers the whole verdict rests on - so a counter that
// disagrees with the checks it counts is a report that lies in its first line. Each family keeps its own set, and each set is checked against
// what the checks actually carry.
import { runVerification, runCompositionVerification } from '../../lib/engine.js'
import { runDataVerification } from '../../lib/data-engine.js'

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

const findingsOf = (report) => (report.checks ?? []).flatMap((check) => check.findings ?? [])
const countSeverity = (report, severity) => findingsOf(report).filter((finding) => finding.severity === severity).length
const skippedOf = (report) => (report.checks ?? []).filter((check) => check.status === 'skip').map((check) => check.id)

const MACHINES = {
  passes: { schemaVersion: 1, init: 's0', states: [{ id: 's0' }, { id: 's1', terminal: true }], transitions: [{ from: 's0', event: 'go', to: 's1' }] },
  warns: { schemaVersion: 1, init: 's0', states: [{ id: 's0' }, { id: 's1', terminal: true }], transitions: [{ from: 's0', event: 'go', to: 's1' }, { from: 's1', event: 'back', to: 's0' }] },
  barely: { schemaVersion: 1, init: 'idle', states: [{ id: 'idle' }, { id: 'x' }, { id: 'y', terminal: true }], transitions: [{ from: 'idle', event: 'a', to: 'x' }] },
}

test('a verification report counts what its checks carry', () => {
  for (const [name, machine] of Object.entries(MACHINES)) {
    const report = runVerification(machine)
    if (report.summary.errors !== countSeverity(report, 'error')) throw new Error(name + ': errors ' + String(report.summary.errors))
    if (report.summary.warnings !== countSeverity(report, 'warning')) throw new Error(name + ': warnings ' + String(report.summary.warnings))
    const ran = (report.checks ?? []).filter((check) => check.status !== 'skip').length
    if (report.summary.checksRun !== ran) throw new Error(name + ': checksRun ' + String(report.summary.checksRun) + ' against ' + String(ran))
    if (JSON.stringify(report.summary.checksSkipped) !== JSON.stringify(skippedOf(report))) {
      throw new Error(name + ': checksSkipped ' + JSON.stringify(report.summary.checksSkipped))
    }
  }
})

test('the verdict follows the error count', () => {
  for (const [name, machine] of Object.entries(MACHINES)) {
    const report = runVerification(machine)
    const errors = countSeverity(report, 'error')
    if (errors === 0 && report.verdict === 'fail') throw new Error(name + ': fail with no error')
    if (errors > 0 && report.verdict !== 'fail') throw new Error(name + ': ' + String(errors) + ' error(s) and verdict ' + String(report.verdict))
  }
})

test('a data model report counts what its checks carry', () => {
  const report = runDataVerification({ schemaVersion: 1, entities: [{ name: 'A', fields: [{ name: 'id', type: 'int', required: true }], primaryKey: ['id'] }], relationships: [] })
  if (report.summary.errors !== countSeverity(report, 'error')) throw new Error('errors ' + String(report.summary.errors))
  if (report.summary.warnings !== countSeverity(report, 'warning')) throw new Error('warnings ' + String(report.summary.warnings))
  if (JSON.stringify(report.summary.checksSkipped) !== JSON.stringify(skippedOf(report))) throw new Error('checksSkipped differs')
  const ran = (report.checks ?? []).filter((check) => check.status !== 'skip').length
  if (report.summary.checksRun !== ran) throw new Error('checksRun ' + String(report.summary.checksRun) + ' against ' + String(ran))
})

test('a composition report counts machines and findings, and says when it stopped early', () => {
  const machine = { schemaVersion: 1, init: 'i', states: [{ id: 'i' }, { id: 'd', terminal: true }], transitions: [{ from: 'i', event: 'go', to: 'd' }] }
  const report = runCompositionVerification([machine, machine])
  if (report.summary.machineCount !== 2) throw new Error('machineCount ' + String(report.summary.machineCount))
  if ((report.summary.machines ?? []).length !== 2) throw new Error('machines list ' + String((report.summary.machines ?? []).length))
  if (report.summary.errors !== countSeverity(report, 'error')) throw new Error('errors ' + String(report.summary.errors))
  if (report.summary.warnings !== countSeverity(report, 'warning')) throw new Error('warnings ' + String(report.summary.warnings))
  if (typeof report.summary.truncated !== 'boolean') throw new Error('truncated is not a boolean')
})

if (failures > 0) {
  console.log('summary-counters tests failed:', failures)
  process.exit(1)
}
console.log('all summary-counters tests passed')
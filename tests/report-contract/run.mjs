// The contract every report keeps, whatever family produced it.
//
// A reader acts on three fields: verdict, verdictReason, nextSteps. They have to agree with the findings - a `pass` that carries an error,
// a `fail` whose reason names no failing check, or a `fail` with nothing to do next are the three ways this contract breaks, and all three
// have been seen in this kind of report.
import { readFileSync } from 'node:fs'

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

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const engine = await import('file:///' + repo + 'lib/engine.js')
const uml = await import('file:///' + repo + 'lib/uml.js')

/** Every finding a report carries, wherever the family keeps them. */
const findingsOf = (report) => {
  const direct = report.findings ?? []
  const nested = (report.checks ?? []).flatMap((check) => check.findings ?? [])
  return [...direct, ...nested]
}

const REPORTS = {
  'a review that passes': () => uml.reviewUml({ model: { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }, { from: 'b', event: 'back', to: 'a' }] } }),
  'a review that fails': () => uml.reviewUml({ model: { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }] } }),
  'a machine that passes': () => engine.runVerification({ schemaVersion: 1, init: 's0', states: [{ id: 's0' }, { id: 's1', terminal: true }], transitions: [{ from: 's0', event: 'go', to: 's1' }] }),
  'a machine that fails': () => engine.runVerification({ schemaVersion: 1, init: 's0', states: [{ id: 's0' }, { id: 's1', terminal: true }], transitions: [{ from: 's0', event: 'go', to: 's1' }, { from: 's1', event: 'back', to: 's0' }] }),
}

test('every report keeps the four fields a reader acts on', () => {
  for (const [name, build] of Object.entries(REPORTS)) {
    const report = build()
    if (typeof report.verdict !== 'string' || report.verdict === '') throw new Error(name + ': no verdict')
    if (typeof report.verdictReason !== 'string' || report.verdictReason === '') throw new Error(name + ': no verdictReason')
    if (!Array.isArray(report.nextSteps)) throw new Error(name + ': nextSteps is not a list')
    if (report.nextSteps.length === 0) throw new Error(name + ': nothing to do next')
  }
})

test('a passing verdict carries no error finding, and says so', () => {
  for (const [name, build] of Object.entries(REPORTS)) {
    const report = build()
    if (report.verdict !== 'pass' && report.verdict !== 'pass_with_findings') continue
    const errors = findingsOf(report).filter((finding) => finding.severity === 'error')
    if (errors.length > 0) throw new Error(name + ': ' + report.verdict + ' with ' + String(errors.length) + ' error(s)')
    if (!/no error/i.test(report.verdictReason)) throw new Error(name + ': the reason reads "' + report.verdictReason + '"')
  }
})

test('a failing verdict names the first failing code, and that code is in the report', () => {
  for (const [name, build] of Object.entries(REPORTS)) {
    const report = build()
    if (report.verdict !== 'fail') continue
    const errors = findingsOf(report).filter((finding) => finding.severity === 'error')
    if (errors.length === 0) throw new Error(name + ': fail with no error finding')
    const named = /first error: ([A-Z0-9_]+)/.exec(report.verdictReason)?.[1]
    if (named === undefined) throw new Error(name + ': the reason names no code: ' + report.verdictReason)
    if (!errors.some((finding) => finding.code === named)) throw new Error(name + ': ' + named + ' is not among the findings')
  }
})

test('a failing verdict asks for the errors to be resolved before anything else', () => {
  for (const [name, build] of Object.entries(REPORTS)) {
    const report = build()
    if (report.verdict !== 'fail') continue
    const first = report.nextSteps[0]
    if (!/error|resolve|fix/i.test(first)) throw new Error(name + ': the first step is "' + first.slice(0, 60) + '"')
  }
})

if (failures > 0) {
  console.log('report-contract tests failed:', failures)
  process.exit(1)
}
console.log('all report-contract tests passed')
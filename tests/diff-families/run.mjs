// What a diff may compare, and what it must refuse.
//
// Two reports of different families do not share a finding vocabulary: every finding on one side would read as resolved or added on the other, so
// the comparison is refused rather than answered. The same applies to a value that is not report-shaped at all. A partial report is accepted on
// purpose - `findings` alone is a report - and that is pinned here too, because tightening it later would break callers who build one by hand.
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

const verify = { schema: 'model-everything/verify/v1', verdict: 'pass', verdictReason: 'no error findings', checks: [], nextSteps: ['x'] }

/** The refusal, or undefined when the comparison ran. */
const refusal = (baseline, current) => {
  try {
    diffReports(baseline, current)
    return undefined
  } catch (error) {
    return error
  }
}

test('two reports of different families are refused, naming both', () => {
  for (const other of ['model-everything/datamodel/v1', 'model-everything/uml/review/v1']) {
    const refused = refusal(verify, { ...verify, schema: other })
    if (refused === undefined) throw new Error('compared a verify report with ' + other)
    const said = String(refused.message)
    if (!said.includes('model-everything/verify/v1') || !said.includes(other)) throw new Error('the reason: ' + said.slice(0, 100))
    if (!/same tool/i.test(said)) throw new Error('the reason does not say what to do: ' + said.slice(0, 120))
  }
})

test('a value that is not a report is refused with what it is', () => {
  for (const [role, value] of [['baseline', 'not a report'], ['current', 42], ['baseline', []]]) {
    const refused = value === '' ? undefined : refusal(role === 'baseline' ? value : verify, role === 'current' ? value : verify)
    if (refused === undefined) throw new Error(role + ' ' + JSON.stringify(value) + ' was accepted as a report')
    if (!String(refused.message).includes(role)) throw new Error('the reason does not say which side: ' + String(refused.message).slice(0, 80))
  }
})

test('an object with no report field at all is refused', () => {
  const refused = refusal({}, {})
  if (refused === undefined) throw new Error('{} was accepted as a report')
  if (!/no report fields/.test(String(refused.message))) throw new Error(String(refused.message).slice(0, 80))
})

test('a partial report is a report: two of them compare', () => {
  // Deliberate, and the comment on the guard says so: `findings` alone is one.
  const report = diffReports({ findings: [] }, { findings: [{ code: 'X', severity: 'warning', message: 'm' }] })
  if (report.added.length !== 1) throw new Error('added ' + String(report.added.length))
  // A warning moves the delta from `pass` to `pass_with_findings`: it is a change, not a failure.
  if (report.verdict !== 'pass_with_findings') throw new Error('an added warning gave the delta ' + String(report.verdict))
})

test('two runs of the same report compare, and the delta is clean', () => {
  const report = diffReports(verify, verify)
  if (report.added.length !== 0 || report.removed.length !== 0) throw new Error('a report against itself moved findings')
  if (report.currentVerdict !== 'pass') throw new Error('currentVerdict ' + String(report.currentVerdict))
})

if (failures > 0) {
  console.log('diff-families tests failed:', failures)
  process.exit(1)
}
console.log('all diff-families tests passed')
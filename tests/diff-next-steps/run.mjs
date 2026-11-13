// What a diff tells a reader to do next, in each of the four states a comparison can be in.
//
// The dangerous one is the delta that is clean while the current report still fails: it reads as "nothing to do" and it is not. Each of the four
// states gets its own sentence here, and the summary counters are checked against the lists they summarise.
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

const finding = (code, severity = 'error') => ({ code, severity, message: code, evidence: 'states[0]' })

const report = (findings, verdict) => ({
  schema: 'model-everything/verify/v1',
  verdict,
  verdictReason: verdict === 'fail' ? 'errors present' : 'no error findings',
  findings,
  checks: [],
  nextSteps: ['fix it'],
})

const CASES = {
  'clean delta over a passing report': [report([finding('A')], 'fail'), report([finding('A')], 'pass')],
  'an added error': [report([], 'pass'), report([finding('A')], 'fail')],
  'a resolved error': [report([finding('A')], 'fail'), report([], 'pass')],
  'a clean delta over a report that still fails': [report([finding('A')], 'fail'), report([finding('A')], 'fail')],
}

test('every state says something to do', () => {
  for (const [name, [baseline, current]] of Object.entries(CASES)) {
    const delta = diffReports(baseline, current)
    if (!Array.isArray(delta.nextSteps) || delta.nextSteps.length === 0) throw new Error(name + ': nothing to do')
    for (const step of delta.nextSteps) if (String(step).trim() === '') throw new Error(name + ': an empty step')
  }
})

test('an added error asks for it to be fixed or accepted, and says the run is worse', () => {
  const [baseline, current] = CASES['an added error']
  const delta = diffReports(baseline, current)
  if (delta.verdict !== 'fail') throw new Error('the delta verdict is ' + String(delta.verdict))
  const said = delta.nextSteps.join(' ')
  if (!/new error/.test(said)) throw new Error('the steps do not mention the new error: ' + said.slice(0, 100))
  if (!/worse|still/i.test(said)) throw new Error('the steps do not say the run got worse: ' + said.slice(0, 100))
})

test('a resolved finding asks whether it was fixed or renamed', () => {
  const [baseline, current] = CASES['a resolved error']
  const delta = diffReports(baseline, current)
  const said = delta.nextSteps.join(' ')
  if (!/gone/.test(said)) throw new Error('the steps do not mention the resolved finding: ' + said.slice(0, 100))
  if (!/renamed|fixed/.test(said)) throw new Error('the steps do not warn about a rename: ' + said.slice(0, 100))
})

test('a clean delta over a failing report says the delta being clean is not the run being clean', () => {
  const [baseline, current] = CASES['a clean delta over a report that still fails']
  const delta = diffReports(baseline, current)
  if (delta.verdict !== 'pass') throw new Error('the delta verdict is ' + String(delta.verdict))
  if (delta.currentVerdict !== 'fail') throw new Error('currentVerdict is ' + String(delta.currentVerdict))
  const said = delta.nextSteps.join(' ')
  if (!/still fail/i.test(said)) throw new Error('the steps do not say the report still fails: ' + said.slice(0, 120))
})

test('the summary counts the lists it summarises', () => {
  for (const [name, [baseline, current]] of Object.entries(CASES)) {
    const delta = diffReports(baseline, current)
    if (delta.summary.added !== delta.added.length) throw new Error(name + ': added ' + String(delta.summary.added))
    if (delta.summary.removed !== delta.removed.length) throw new Error(name + ': removed ' + String(delta.summary.removed))
    // An added finding is flattened: the entry itself carries the severity, not an `after` wrapper.
    const addedErrors = delta.added.filter((entry) => entry.severity === 'error').length
    if (delta.summary.addedErrors !== addedErrors) throw new Error(name + ': addedErrors ' + String(delta.summary.addedErrors) + ' against ' + String(addedErrors))
  }
})

if (failures > 0) {
  console.log('diff-next-steps tests failed:', failures)
  process.exit(1)
}
console.log('all diff-next-steps tests passed')
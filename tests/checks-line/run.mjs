// The `CHECKS` line has to be a complete inventory of the roster, in the right groups.
//
// The skill makes this promise: "passing checks stay in the `CHECKS` inventory line". A reader uses that line to see what ran and what did not, so a
// check missing from it is a check nobody can tell was skipped - and a check in the wrong group is the same misreading with a label on it.
import { renderReportText } from '../../lib/report-view.js'
import { runCompositionVerification, runVerification } from '../../lib/engine.js'

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

const REPORTS = {
  'a passing machine': runVerification(MACHINE),
  'a failing machine': runVerification(BROKEN),
  'a composition': runCompositionVerification([MACHINE, MACHINE]),
}

/** The inventory line, as a map from group label to the check ids beneath it. */
const groupsOf = (report) => {
  const line = renderReportText(report, { full: false }).split('\n').find((entry) => entry.startsWith('CHECKS'))
  if (line === undefined) throw new Error('no CHECKS line')
  const groups = {}
  for (const part of line.split('|')) {
    const words = part.replace(/^CHECKS\s*/, '').trim().split(/\s+/).filter((word) => word !== '')
    if (words.length === 0) continue
    const [label, ...ids] = words
    groups[label] = ids
  }
  return groups
}

test('every check in the roster appears in the line exactly once', () => {
  for (const [name, report] of Object.entries(REPORTS)) {
    const groups = groupsOf(report)
    const listed = Object.values(groups).flat()
    const roster = (report.checks ?? []).map((check) => check.id)
    if (listed.length !== roster.length) throw new Error(name + ': ' + String(listed.length) + ' listed against ' + String(roster.length) + ' in the roster')
    const seen = new Set()
    for (const id of listed) {
      if (seen.has(id)) throw new Error(name + ': ' + id + ' is listed twice')
      seen.add(id)
    }
    for (const id of roster) if (!seen.has(id)) throw new Error(name + ': ' + id + ' is missing from the line')
  }
})

test('each check sits under the group its status names', () => {
  const label = { pass: 'pass', fail: 'fail', skip: 'skip' }
  for (const [name, report] of Object.entries(REPORTS)) {
    const groups = groupsOf(report)
    for (const check of report.checks ?? []) {
      const group = Object.entries(groups).find(([, ids]) => ids.includes(check.id))?.[0]
      const expected = check.status === 'fail' && (check.findings ?? []).every((finding) => finding.severity !== 'error') ? 'warn' : label[check.status]
      if (group !== expected) throw new Error(name + ': ' + check.id + ' is under ' + String(group) + ', expected ' + String(expected))
    }
  }
})

test('a skipped check is visible in the line, not only in the counter', () => {
  // The line is where a reader sees that a check did not decide; the counter says how many, and this says which.
  const groups = groupsOf(REPORTS['a passing machine'])
  const skipped = groups.skip ?? []
  if (skipped.length === 0) throw new Error('a machine with skipped checks lists none')
  const summarySkipped = REPORTS['a passing machine'].summary.checksSkipped
  for (const id of summarySkipped) {
    if (!skipped.includes(id)) throw new Error(id + ' is skipped in the summary and absent from the line')
  }
})

if (failures > 0) {
  console.log('checks-line tests failed:', failures)
  process.exit(1)
}
console.log('all checks-line tests passed')
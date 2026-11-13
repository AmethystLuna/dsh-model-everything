// What a report says about a check it could not decide, and what it says about one it did.
//
// A cap is a configuration, not a gap in the model: `maxPermutationEvents: 1` on a machine with two events examines one, and the check then has
// nothing to permute. It reported `pass` with "skipped" in the detail, and a reader who scans statuses takes that as "checked and absent" - this
// engine's own rule is that a check with nothing to hold it to is `skip`.
import { runVerification } from '../../lib/engine.js'

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

/** Two events from `idle`, and only one order reaches `both`: the machine A3 exists to decide. */
const machine = {
  schemaVersion: 1, init: 'idle',
  states: [{ id: 'idle' }, { id: 'xDone' }, { id: 'both', terminal: true }, { id: 'yDone' }],
  transitions: [
    { from: 'idle', event: 'x', to: 'xDone' },
    { from: 'idle', event: 'y', to: 'yDone' },
    { from: 'xDone', event: 'y', to: 'both' },
  ],
}

const checkOf = (report, id) => (report.checks ?? []).find((check) => check.id === id)

test('a cap that leaves a check nothing to decide reports skip, not pass', () => {
  const capped = runVerification(machine, { maxPermutationEvents: 1 })
  const a3 = checkOf(capped, 'A3')
  if (a3 === undefined) throw new Error('A3 is missing')
  if (a3.status !== 'skip') throw new Error('a capped A3 reports ' + String(a3.status))
  if (!String(a3.detail).startsWith('skipped: ')) throw new Error('the detail: ' + String(a3.detail))
  if (!(capped.summary?.checksSkipped ?? []).includes('A3')) throw new Error('A3 is not in checksSkipped')
  // The skip has to be a skip in the count too: `checksRun` is what a reader compares against the roster.
  const full = runVerification(machine)
  const decided = checkOf(full, 'A3')
  if (decided === undefined || decided.status === 'skip') throw new Error('the uncapped A3 skipped too')
  if ((full.summary?.checksRun ?? 0) !== (capped.summary?.checksRun ?? 0) + 1) {
    throw new Error('checksRun did not move: ' + String(capped.summary?.checksRun) + ' -> ' + String(full.summary?.checksRun))
  }
})

test('a skipped check never carries a finding', () => {
  const report = runVerification(machine, { maxPermutationEvents: 1 })
  for (const check of report.checks ?? []) {
    if (check.status !== 'skip') continue
    if ((check.findings ?? []).length > 0) throw new Error(check.id + ' is skipped and carries findings')
    if (!String(check.detail).startsWith('skipped: ')) throw new Error(check.id + ': ' + String(check.detail))
  }
})

if (failures > 0) {
  console.log('check-status tests failed:', failures)
  process.exit(1)
}
console.log('all check-status tests passed')
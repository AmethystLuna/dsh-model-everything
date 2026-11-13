// The three verdicts are defined by the findings, and `ok` is not one of them.
//
// The doctrine skill states the table and then says the thing that is easy to get wrong: `ok` carries a per-family meaning, so reading it as a
// verdict is how a reader concludes the opposite of what the report says. Both halves are checkable, and the second needs two families to show it.
import { runCompositionVerification, runVerification } from '../../lib/engine.js'
import { runDataVerification } from '../../lib/data-engine.js'
import { runDesignReview } from '../../lib/design-engine.js'

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

/** Two machines writing one location with no lock: a warning finding, not an error. */
const RACE = {
  machines: [MACHINE, MACHINE],
  shared: [{ id: 'x', initial: 0 }],
  accesses: [
    { machine: 0, event: 'go', location: 'x', kind: 'write' },
    { machine: 1, event: 'go', location: 'x', kind: 'write' },
  ],
}

const CASES = {
  'a clean verification': runVerification(MACHINE),
  'a clean composition': runCompositionVerification([MACHINE, MACHINE]),
  'a clean data model': runDataVerification(TABLE),
  'a verification with an error': runVerification(BROKEN),
  'a composition with an unresolvable rendezvous': runCompositionVerification([MACHINE, MACHINE], { rendezvous: ['never'] }),
  'a design with a cycle': runDesignReview({ schemaVersion: 1, architecture: { nodes: ['a', 'b'], edges: [['a', 'b'], ['b', 'a']] } }),
  'a composition with an unguarded shared write': runCompositionVerification(RACE.machines, { shared: RACE.shared, accesses: RACE.accesses }),
}

const counts = (report) => ({ errors: Number(report.summary?.errors ?? 0), warnings: Number(report.summary?.warnings ?? 0) })

test('pass means no errors and no warnings', () => {
  for (const [name, report] of Object.entries(CASES)) {
    const { errors, warnings } = counts(report)
    if (errors !== 0 || warnings !== 0) continue
    if (report.verdict !== 'pass') throw new Error(name + ': ' + String(errors) + ' errors, ' + String(warnings) + ' warnings, verdict ' + String(report.verdict))
  }
})

test('pass_with_findings means warnings and no errors', () => {
  let seen = 0
  for (const [name, report] of Object.entries(CASES)) {
    if (report.verdict !== 'pass_with_findings') continue
    seen += 1
    const { errors, warnings } = counts(report)
    if (errors !== 0) throw new Error(name + ': pass_with_findings with ' + String(errors) + ' error(s)')
    if (warnings === 0) throw new Error(name + ': pass_with_findings with no warning')
  }
  if (seen === 0) throw new Error('no case reached pass_with_findings, so the case proved nothing')
})

test('fail means at least one error', () => {
  for (const [name, report] of Object.entries(CASES)) {
    if (report.verdict !== 'fail') continue
    const { errors } = counts(report)
    if (errors === 0) throw new Error(name + ': fail with no error finding')
  }
})

test('ok cannot stand in for the verdict: two families disagree about the same word', () => {
  // A failing verification says `ok: true` and a failing composition says `ok: false`. Both are right for their own family, which is exactly why
  // neither can be read as the answer.
  const verification = runVerification(BROKEN)
  const composition = runCompositionVerification([MACHINE, MACHINE], { rendezvous: ['never'] })
  if (verification.verdict !== 'fail' || composition.verdict !== 'fail') throw new Error('the two cases do not both fail')
  if (verification.ok !== true) throw new Error('a failing verification reports ok ' + String(verification.ok))
  if (composition.ok !== false) throw new Error('a failing composition reports ok ' + String(composition.ok))
})

if (failures > 0) {
  console.log('verdict-table tests failed:', failures)
  process.exit(1)
}
console.log('all verdict-table tests passed')
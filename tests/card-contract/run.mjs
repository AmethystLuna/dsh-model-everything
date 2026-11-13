// The card is a projection of the report, not a second opinion about it.
//
// A card is what a reader sees first, and every field on it is either a value copied from the report or a pointer to another tool. Both can go wrong
// silently: a copied number that drifts from the report it claims to summarise, and a pointer that names a tool nobody registered.
import { reportCard } from '../../lib/presentation.js'
import { ROUTES } from '../../lib/routing.js'
import { runCompositionVerification, runVerification } from '../../lib/engine.js'
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

const REPORTS = [
  ['a passing verification', runVerification(MACHINE), 'model_verify'],
  ['a failing verification', runVerification(BROKEN), 'model_verify'],
  ['a composition', runCompositionVerification([MACHINE, MACHINE]), 'model_compose_verify'],
]

test('the verdict on the card is the report\'s verdict', () => {
  for (const [name, report, family] of REPORTS) {
    const card = reportCard(report, family)
    if (card.verdict !== report.verdict) throw new Error(name + ': ' + String(card.verdict) + ' against ' + String(report.verdict))
  }
})

test('the counters on the card are the summary counters', () => {
  for (const [name, report, family] of REPORTS) {
    const card = reportCard(report, family)
    if (card.errors !== report.summary.errors) throw new Error(name + ': errors ' + String(card.errors))
    if (card.warnings !== report.summary.warnings) throw new Error(name + ': warnings ' + String(card.warnings))
  }
})

test('a failing report puts its first error on the card, and a clean one puts nothing there', () => {
  const failing = reportCard(runVerification(BROKEN), 'model_verify')
  if (failing.first === null || failing.first === undefined) throw new Error('a failing report carries no first finding')
  if (failing.first.severity !== 'error') throw new Error('the first finding is a ' + String(failing.first.severity))
  const clean = reportCard(runVerification(MACHINE), 'model_verify')
  if (clean.first !== null) throw new Error('a clean report names a first finding: ' + JSON.stringify(clean.first))
})

test('every pointer on a card names a tool that exists', () => {
  // A card is user-facing: a `route.instead` naming a tool nobody ships is a dead link in the one place a reader decides where to go next.
  const known = new Set(Object.keys(ROUTES))
  for (const [name, report, family] of REPORTS) {
    const card = reportCard(report, family)
    if (!known.has(card.family)) throw new Error(name + ': family ' + String(card.family) + ' is not a route')
    const instead = card.route?.instead
    if (instead !== undefined && !known.has(instead)) throw new Error(name + ': instead ' + String(instead) + ' is not a route')
  }
})

test('a diff card carries the delta and the other cards do not', () => {
  const baseline = runVerification(BROKEN)
  const card = reportCard(diffReports(baseline, baseline), 'report_diff')
  if (card.delta === undefined || card.delta === null) throw new Error('a diff card has no delta')
  for (const key of ['added', 'removed', 'changed']) {
    if (card.delta[key] !== 0) throw new Error(key + ': ' + String(card.delta[key]))
  }
  const plain = reportCard(runVerification(MACHINE), 'model_verify')
  if (plain.delta !== undefined && plain.delta !== null) throw new Error('a verification card carries a delta')
})

if (failures > 0) {
  console.log('card-contract tests failed:', failures)
  process.exit(1)
}
console.log('all card-contract tests passed')
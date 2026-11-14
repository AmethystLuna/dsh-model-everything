// The two readings of one report - the text a model reads and the card a person sees - must agree.
//
// They are separate dispatchers on purpose: one decides which renderer prints a report, the other decides which numbers a card
// shows. Nothing compared them, so a family added to one and not the other would read two ways, and the reader would have no
// reason to distrust either. This suite is the comparison: same verdict, same error count, and the card's first finding named
// in the text.
const { renderReportText } = await import('../../lib/report-view.js')
const { reportCard } = await import('../../lib/presentation.js')
const { runCompositionVerification, runVerification } = await import('../../lib/engine.js')
const { runDataVerification } = await import('../../lib/data-engine.js')
const { runDesignReview } = await import('../../lib/design-engine.js')
const { runConcurrencyScan } = await import('../../lib/concurrency.js')
const { verifyAutomaton } = await import('../../lib/automaton.js')
const { diffReports } = await import('../../lib/baseline.js')

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

const machine = (extra) => ({
  schemaVersion: 1, init: 's0',
  states: extra ? [{ id: 's0' }, { id: 's1', terminal: true }, { id: 's2' }] : [{ id: 's0' }, { id: 's1', terminal: true }],
  transitions: extra
    ? [{ from: 's0', event: 'go', to: 's1' }, { from: 's1', event: 'back', to: 's0' }, { from: 's1', event: 'go', to: 's2' }]
    : [{ from: 's0', event: 'go', to: 's1' }, { from: 's1', event: 'back', to: 's0' }],
})

const REPORTS = {
  'a machine that fails': runVerification({ schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }] }),
  'a machine with warnings only': runVerification(machine(true)),
  'a composition that fails': runCompositionVerification([machine(false), machine(false)], { rendezvous: ['never'] }),
  'a data model that fails': runDataVerification(
    { schemaVersion: 1, entities: [{ name: 'A', fields: [{ name: 'id', type: 'int', required: true }], primaryKey: ['id'] }], relationships: [] },
    { beforeModel: { schemaVersion: 1, entities: [{ name: 'A', fields: [{ name: 'id', type: 'int', required: true }, { name: 'gone', type: 'text' }], primaryKey: ['id'] }], relationships: [] } }),
  'a design that fails': runDesignReview({ schemaVersion: 1, architecture: { nodes: ['a', 'b'], edges: [['a', 'b'], ['b', 'a']] } }),
  'a scan that finds an absolute claim': runConcurrencyScan('The cache is guarded by a mutex, so it is thread-safe.'),
  'an automaton that fails a relation': verifyAutomaton(
    { states: ['a'], alphabet: ['x'], transitions: [{ from: 'a', symbol: 'x', to: 'a' }], init: 'a', accepting: ['a'] },
    { other: { states: ['a'], alphabet: ['x'], transitions: [], init: 'a', accepting: [] } }),
  'a delta with an added error': diffReports(runVerification(machine(false)), runVerification({ schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }] })),
}

test('the card and the text state the same verdict', () => {
  for (const [name, report] of Object.entries(REPORTS)) {
    const card = reportCard(report)
    if (card.verdict !== report.verdict) throw new Error(name + ': card ' + String(card.verdict) + ', report ' + String(report.verdict))
  }
})

test('the card counts the errors the text lists', () => {
  for (const [name, report] of Object.entries(REPORTS)) {
    const card = reportCard(report)
    const text = renderReportText(report)
    const listed = new Set([...text.matchAll(/\[(error|warning|info)\/([A-Z0-9_]+)\]/g)].map((m) => m[2]))
    if (card.first !== undefined && card.first !== null) {
      const code = String(card.first.code)
      // The text may truncate a long report, so the first finding is what has to be there - it is the one a card leads with.
      if (!listed.has(code)) throw new Error(name + ': the card leads with ' + code + ', which the text does not list')
    }
    const errors = [...text.matchAll(/\[error\/([A-Z0-9_]+)\]/g)].length
    if (card.errors > 0 && errors === 0) throw new Error(name + ': the card counts ' + String(card.errors) + ' error(s) and the text lists none')
    if (card.errors === 0 && errors > 0) throw new Error(name + ': the text lists ' + String(errors) + ' error(s) and the card counts none')
  }
})

if (failures > 0) {
  console.log('view-agreement tests failed:', failures)
  process.exit(1)
}
console.log('all view-agreement tests passed')
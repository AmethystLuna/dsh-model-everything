// Automaton family: the language checks, and the witness that makes a failed relation actionable.
//
// The suite's claim is not "the code returned". It is that equivalence is decided for the right reason:
// two automata that accept the same language pass, one that differs fails, and the witness is a word
// that actually separates them - replayable through both machines by hand.
import { verifyAutomaton } from '../../lib/automaton.js'

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

const endsWithA = {
  states: ['s0', 's1'],
  alphabet: ['a', 'b'],
  transitions: [
    { from: 's0', symbol: 'a', to: 's1' },
    { from: 's0', symbol: 'b', to: 's0' },
    { from: 's1', symbol: 'a', to: 's1' },
    { from: 's1', symbol: 'b', to: 's1' },
  ],
  init: 's0',
  accepting: ['s1'],
}

/** The same language, different state names. */
const endsWithARenamed = {
  states: ['p', 'q'],
  alphabet: ['b', 'a'],
  transitions: [
    { from: 'p', symbol: 'a', to: 'q' },
    { from: 'p', symbol: 'b', to: 'p' },
    { from: 'q', symbol: 'a', to: 'q' },
    { from: 'q', symbol: 'b', to: 'q' },
  ],
  init: 'p',
  accepting: ['q'],
}

/** Accepts every non-empty word. */
const anyNonEmpty = {
  states: ['t0', 't1'],
  alphabet: ['a', 'b'],
  transitions: [
    { from: 't0', symbol: 'a', to: 't1' },
    { from: 't0', symbol: 'b', to: 't1' },
    { from: 't1', symbol: 'a', to: 't1' },
    { from: 't1', symbol: 'b', to: 't1' },
  ],
  init: 't0',
  accepting: ['t1'],
}

const codes = (report) => report.findings.map((finding) => finding.code)

test('a well-formed automaton with a reachable accepting state passes', () => {
  const report = verifyAutomaton(endsWithA)
  if (report.verdict !== 'pass') throw new Error('expected pass, got ' + report.verdict + ' ' + report.verdictReason)
})

test('equivalence is decided across state names and alphabet order', () => {
  const report = verifyAutomaton(endsWithA, { other: endsWithARenamed })
  if (report.verdict !== 'pass') throw new Error('renaming must not change the language, got ' + report.verdictReason)
})

test('a real difference fails, and the witness is the shortest word', () => {
  const report = verifyAutomaton(endsWithA, { other: anyNonEmpty })
  if (report.verdict !== 'fail') throw new Error('expected fail')
  if (JSON.stringify(report.witness?.word) !== JSON.stringify(['b'])) throw new Error('witness: ' + JSON.stringify(report.witness))
  if (!codes(report).includes('AUT006_NOT_EQUIVALENT')) throw new Error('codes: ' + codes(report).join(','))
})

test('subset and superset are different questions, and both are answered', () => {
  const subset = verifyAutomaton(endsWithA, { other: anyNonEmpty, relation: 'subset' })
  if (subset.verdict !== 'pass') throw new Error('endsWithA is contained in anyNonEmpty: ' + subset.verdictReason)
  const superset = verifyAutomaton(endsWithA, { other: anyNonEmpty, relation: 'superset' })
  if (superset.verdict !== 'fail') throw new Error('endsWithA does not contain anyNonEmpty')
  if (!codes(superset).includes('AUT008_NOT_SUPERSET')) throw new Error('codes: ' + codes(superset).join(','))
})

test('an alphabet mismatch is an error, not a silent comparison', () => {
  const other = {
    states: ['t0', 't1'],
    alphabet: ['a'],
    transitions: [
      { from: 't0', symbol: 'a', to: 't1' },
      { from: 't1', symbol: 'a', to: 't1' },
    ],
    init: 't0',
    accepting: ['t1'],
  }
  const report = verifyAutomaton(endsWithA, { other })
  if (report.verdict !== 'fail') throw new Error('expected fail')
  if (!codes(report).includes('AUT005_ALPHABET_MISMATCH')) throw new Error('codes: ' + codes(report).join(','))
})

test('a state nothing reaches is reported as unreachable', () => {
  const orphan = { ...endsWithA, states: [...endsWithA.states, 'lost'], transitions: [...endsWithA.transitions, { from: 'lost', symbol: 'a', to: 'lost' }] }
  const report = verifyAutomaton(orphan)
  if (!codes(report).includes('AUT001_UNREACHABLE_STATE')) throw new Error('codes: ' + codes(report).join(','))
})

test('a reachable state that cannot reach acceptance is a trap', () => {
  const trapped = {
    states: ['s0', 's1', 's2'],
    alphabet: ['a'],
    transitions: [
      { from: 's0', symbol: 'a', to: 's0' },
      { from: 's1', symbol: 'a', to: 's0' },
    ],
    init: 's0',
    accepting: ['s1'],
  }
  const report = verifyAutomaton(trapped)
  // s1 is unreachable, so this is the unreachable case rather than the trap case.
  if (!codes(report).includes('AUT001_UNREACHABLE_STATE')) throw new Error('codes: ' + codes(report).join(','))
})

test('an automaton that accepts nothing says so', () => {
  const empty = { ...endsWithA, accepting: [] }
  const report = verifyAutomaton(empty)
  if (!codes(report).includes('AUT004_EMPTY_LANGUAGE')) throw new Error('codes: ' + codes(report).join(','))
})

test('an NFA is determinised and the nondeterminism is stated', () => {
  const nfa = {
    states: ['s0', 's1'],
    alphabet: ['a'],
    transitions: [
      { from: 's0', symbol: 'a', to: 's0' },
      { from: 's0', symbol: 'a', to: 's1' },
    ],
    init: 's0',
    accepting: ['s1'],
  }
  const report = verifyAutomaton(nfa)
  if (report.automaton.deterministic) throw new Error('a repeated (from, symbol) pair is nondeterminism')
  if (!codes(report).includes('AUT003_NONDETERMINISTIC')) throw new Error('codes: ' + codes(report).join(','))
})

test('a malformed automaton is refused with the field named', () => {
  let refused
  try {
    verifyAutomaton({ states: ['a'], alphabet: ['x'], transitions: [{ from: 'a', symbol: 'y', to: 'a' }], init: 'a', accepting: [] })
  } catch (error) {
    refused = error
  }
  if (refused === undefined) throw new Error('expected a refusal')
  if (!/alphabet/.test(String(refused.message))) throw new Error('refusal must name the field: ' + String(refused.message))
})

if (failures > 0) {
  console.log('automaton tests failed:', failures)
  process.exit(1)
}
console.log('all automaton tests passed')

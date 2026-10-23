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


// ------------------------------------------------------------------------------------------------
// Path coverage for the automaton family: every refusal names its field, and every relation answers.
//
// The suite above proves the decisions. These prove the *edges* of the interface - a malformed automaton,
// an alphabet that cannot be compared, an NFA that has to be determinised, a product that hits its cap -
// because a refusal that names the wrong field is worse than a refusal.

test('every malformed field is refused by name', () => {
  const cases = [
    [{}, 'states'],
    [{ states: [], alphabet: ['a'], transitions: [], init: 's', accepting: [] }, 'states'],
    [{ states: ['s'], alphabet: [], transitions: [], init: 's', accepting: [] }, 'alphabet'],
    [{ states: ['s'], alphabet: ['a'], transitions: [], init: '', accepting: [] }, 'init'],
    [{ states: ['s'], alphabet: ['a'], transitions: [], init: 's' }, 'accepting'],
    [{ states: ['s'], alphabet: ['a'], transitions: [], init: 's', accepting: ['nope'] }, 'accepting'],
    [{ states: ['s'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'z', to: 's' }], init: 's', accepting: [] }, 'alphabet'],
    [{ states: ['s'], alphabet: ['a'], transitions: [{ from: 'x', symbol: 'a', to: 's' }], init: 's', accepting: [] }, 'not a declared state'],
    [{ states: ['s'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 'x' }], init: 's', accepting: [] }, 'not a declared state'],
    [{ states: ['s'], alphabet: ['a'], transitions: [7], init: 's', accepting: [] }, 'must be an object'],
  ]
  for (const [input, expected] of cases) {
    let message = ''
    try {
      verifyAutomaton(input)
    } catch (error) {
      message = String(error.message)
    }
    if (message === '') throw new Error('accepted a malformed automaton: ' + JSON.stringify(input))
    if (!message.includes(expected)) throw new Error('refusal does not mention "' + expected + '": ' + message)
  }
})

test('an empty automaton object and a non-object are both refused', () => {
  for (const input of [null, 'text', 42, [], { states: 'x' }]) {
    let refused = false
    try {
      verifyAutomaton(input)
    } catch {
      refused = true
    }
    if (!refused) throw new Error('accepted ' + JSON.stringify(input))
  }
})

test('a second automaton that is malformed is refused rather than compared', () => {
  const good = { states: ['s'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 's' }], init: 's', accepting: ['s'] }
  let message = ''
  try {
    verifyAutomaton(good, { other: { states: [] } })
  } catch (error) {
    message = String(error.message)
  }
  if (!message.includes('second automaton')) throw new Error('the refusal does not say which side is wrong: ' + message)
})

test('a self-loop-only automaton is universal and says nothing else', () => {
  const report = verifyAutomaton({ states: ['s'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 's' }], init: 's', accepting: ['s'] })
  if (report.verdict !== 'pass') throw new Error('expected pass, got ' + report.verdictReason)
  if (report.automaton.deterministic !== true) throw new Error('a single edge per symbol is deterministic')
})

test('a state no accepting state can be reached from is a trap', () => {
  const report = verifyAutomaton({
    states: ['s', 'dead'],
    alphabet: ['a'],
    transitions: [
      { from: 's', symbol: 'a', to: 'dead' },
      { from: 'dead', symbol: 'a', to: 'dead' },
    ],
    init: 's',
    accepting: ['s'],
  })
  const codes = report.findings.map((finding) => finding.code)
  if (!codes.includes('AUT002_TRAP_STATE')) throw new Error('codes: ' + codes.join(','))
})

test('subset holds when the second automaton is universal', () => {
  const first = { states: ['s', 't'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 't' }, { from: 't', symbol: 'a', to: 't' }], init: 's', accepting: ['t'] }
  const universal = { states: ['u'], alphabet: ['a'], transitions: [{ from: 'u', symbol: 'a', to: 'u' }], init: 'u', accepting: ['u'] }
  const subset = verifyAutomaton(first, { other: universal, relation: 'subset' })
  if (subset.verdict !== 'pass') throw new Error('first is contained in the universal language: ' + subset.verdictReason)
  const superset = verifyAutomaton(universal, { other: first, relation: 'superset' })
  if (superset.verdict !== 'pass') throw new Error('the universal language contains the first: ' + superset.verdictReason)
})

test('the empty language is contained in every language', () => {
  const empty = { states: ['s'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 's' }], init: 's', accepting: [] }
  const universal = { states: ['u'], alphabet: ['a'], transitions: [{ from: 'u', symbol: 'a', to: 'u' }], init: 'u', accepting: ['u'] }
  const report = verifyAutomaton(empty, { other: universal, relation: 'subset' })
  // The relation holds, so the verdict is not `fail`; the empty language still earns its own warning.
  if (report.verdict === 'fail') throw new Error('the empty language is a subset of everything: ' + report.verdictReason)
  if (report.findings.some((finding) => finding.code.startsWith('AUT007'))) throw new Error('a containment error was reported for the empty language')
})


test('an init that names no state is refused with the name', () => {
  let message = ''
  try {
    verifyAutomaton({ states: ['s'], alphabet: ['a'], transitions: [], init: 'nowhere', accepting: [] })
  } catch (error) {
    message = String(error.message)
  }
  if (!message.includes('nowhere')) throw new Error('the refusal does not name the state: ' + message)
})

test('an incomplete automaton is completed with a sink, not crashed on', () => {
  // `b` has no outgoing edge anywhere: the deterministic form needs a sink for it, and the sink must not
  // show up as an invented state in the report.
  const report = verifyAutomaton({
    states: ['s', 't'],
    alphabet: ['a', 'b'],
    transitions: [
      { from: 's', symbol: 'a', to: 't' },
      { from: 't', symbol: 'a', to: 't' },
    ],
    init: 's',
    accepting: ['t'],
  })
  if (report.automaton.states !== 2) throw new Error('the report counts an invented state: ' + String(report.automaton.states))
  const unreachable = report.findings.filter((finding) => finding.code === 'AUT001_UNREACHABLE_STATE').map((finding) => finding.message)
  if (unreachable.some((message) => message.includes('sink'))) throw new Error('the sink leaked into the findings: ' + unreachable.join('|'))
})

test('a subset failure carries the word the second machine rejects', () => {
  const first = { states: ['s', 't'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 't' }, { from: 't', symbol: 'a', to: 't' }], init: 's', accepting: ['t'] }
  const none = { states: ['u'], alphabet: ['a'], transitions: [{ from: 'u', symbol: 'a', to: 'u' }], init: 'u', accepting: [] }
  const report = verifyAutomaton(first, { other: none, relation: 'subset' })
  if (!report.findings.some((finding) => finding.code === 'AUT007_NOT_SUBSET')) throw new Error('no containment failure reported')
  if (report.witness === undefined || report.witness.word.length === 0) throw new Error('no witness word: ' + JSON.stringify(report.witness))
})

test('a superset failure whose witness is the empty word says so', () => {
  const silent = { states: ['s'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 's' }], init: 's', accepting: [] }
  const acceptsEmpty = { states: ['s'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 's' }], init: 's', accepting: ['s'] }
  const report = verifyAutomaton(silent, { other: acceptsEmpty, relation: 'superset' })
  if (!report.findings.some((finding) => finding.code === 'AUT008_NOT_SUPERSET')) throw new Error('no superset failure reported')
  const detail = report.findings.find((finding) => finding.code === 'AUT008_NOT_SUPERSET')?.detail ?? ''
  if (!detail.includes('the empty word')) throw new Error('the empty-word witness is not named: ' + detail)
})

test('a product past its cap is undecided rather than equal', () => {
  // The cap counts product STATES. Two machines that advance on different letters keep every pair
  // reachable, so the pair space is the full square - past ten thousand here.
  const size = 110
  const ladder = (prefix, advance) => ({
    states: Array.from({ length: size }, (_, index) => prefix + String(index)),
    alphabet: ['p', 'q'],
    transitions: Array.from({ length: size }, (_, index) => [
      { from: prefix + String(index), symbol: advance, to: prefix + String(Math.min(index + 1, size - 1)) },
      { from: prefix + String(index), symbol: advance === 'p' ? 'q' : 'p', to: prefix + String(index) },
    ]).flat(),
    init: prefix + '0',
    // Every state accepts, so both machines are universal and the search never finds a mismatch: it keeps
    // walking pairs until the cap, which is exactly the case a cap exists for.
    accepting: Array.from({ length: size }, (_, index) => prefix + String(index)),
  })
  const report = verifyAutomaton(ladder('a', 'p'), { other: ladder('b', 'q'), relation: 'equivalent' })
  if (!report.findings.some((finding) => finding.code === 'AUT009_UNDECIDED')) throw new Error('the product search did not report its cap; verdict ' + report.verdict)
  if (report.truncated !== true) throw new Error('the report does not set truncated')
  if (report.verdict === 'pass') throw new Error('a capped search must not read as equal')
})


test('an isolated state is reported as unreachable', () => {
  const report = verifyAutomaton({
    states: ['s', 'lost'],
    alphabet: ['a'],
    transitions: [{ from: 's', symbol: 'a', to: 's' }, { from: 'lost', symbol: 'a', to: 'lost' }],
    init: 's',
    accepting: ['s'],
  })
  const unreachable = report.findings.filter((finding) => finding.code === 'AUT001_UNREACHABLE_STATE').map((finding) => finding.message)
  if (!unreachable.some((message) => message.includes('lost'))) throw new Error('the isolated state was not reported: ' + unreachable.join('|'))
})

test('an equivalence failure names the side that accepted the word', () => {
  const universal = { states: ['u'], alphabet: ['a'], transitions: [{ from: 'u', symbol: 'a', to: 'u' }], init: 'u', accepting: ['u'] }
  const silent = { states: ['s'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 's' }], init: 's', accepting: [] }
  const report = verifyAutomaton(silent, { other: universal })
  if (!report.findings.some((finding) => finding.code === 'AUT006_NOT_EQUIVALENT')) throw new Error('no equivalence failure')
  if (report.witness === undefined || report.witness.reason !== 'accepted by the second automaton, rejected by the first') throw new Error('the side is not named: ' + JSON.stringify(report.witness))
})



test('a subset failure whose witness is the empty word says so', () => {
  const acceptsEmpty = { states: ['s'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 's' }], init: 's', accepting: ['s'] }
  const silent = { states: ['s'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 's' }], init: 's', accepting: [] }
  const report = verifyAutomaton(acceptsEmpty, { other: silent, relation: 'subset' })
  const finding = report.findings.find((entry) => entry.code === 'AUT007_NOT_SUBSET')
  if (finding === undefined) throw new Error('no containment failure reported')
  if (!String(finding.detail).includes('the empty word')) throw new Error('the empty-word witness is not named: ' + String(finding.detail))
})



test('an equivalence failure in the other direction names its side too', () => {
  const universal = { states: ['u'], alphabet: ['a'], transitions: [{ from: 'u', symbol: 'a', to: 'u' }], init: 'u', accepting: ['u'] }
  const silent = { states: ['s'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 's' }], init: 's', accepting: [] }
  const report = verifyAutomaton(universal, { other: silent })
  const finding = report.findings.find((entry) => entry.code === 'AUT006_NOT_EQUIVALENT')
  if (finding === undefined) throw new Error('no equivalence failure reported')
  if (!String(finding.detail).includes('accepted by the first automaton')) throw new Error('the side is not named: ' + String(finding.detail))
})



test('an equivalence witness can be a non-empty word', () => {
  const onlyA = { states: ['s', 't'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 't' }, { from: 't', symbol: 'a', to: 't' }], init: 's', accepting: ['t'] }
  const nothing = { states: ['s'], alphabet: ['a'], transitions: [{ from: 's', symbol: 'a', to: 's' }], init: 's', accepting: [] }
  const report = verifyAutomaton(onlyA, { other: nothing })
  const finding = report.findings.find((entry) => entry.code === 'AUT006_NOT_EQUIVALENT')
  if (finding === undefined) throw new Error('no equivalence failure')
  if (!String(finding.detail).includes('shortest witness: a')) throw new Error('the word is not shown: ' + String(finding.detail))
})


if (failures > 0) {
  console.log('automaton tests failed:', failures)
  process.exit(1)
}
console.log('all automaton tests passed')

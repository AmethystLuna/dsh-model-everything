// UML front-end tests: rendering (model → diagram source), parsing (diagram
// source → model) and the modelling review, whose fidelity half is the render →
// parse round trip. A diagram that does not read back as the model it was drawn
// from is the defect this suite exists to catch, so every supported notation is
// round-tripped rather than only asserted on its output text.
import { renderUml, parseUml, parseFindings, reviewUml, diffModels, explainLabels, guardText, parseGuardText, UmlError } from '../../lib/uml.js'
// White-box surface: the timing family's own contract, which the entry points reach only
// through a render or a review. Static, because the module has no dsh dependency.
import { validateTimingModel, reviewTimingModel, TIMING_FINDING_CODES } from '../../lib/uml.js'

let failures = 0
function test(name, fn) {
  try {
    fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

function assertNoUndefinedValues(value, path = 'root') {
  if (value === undefined) throw new Error(`undefined at ${path}`)
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoUndefinedValues(entry, `${path}[${index}]`))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) assertNoUndefinedValues(entry, `${path}.${key}`)
  }
}

function codes(report) {
  return report.findings.map((finding) => finding.code)
}

function findFinding(report, code) {
  return report.findings.filter((finding) => finding.code === code)
}

const model = {
  schemaVersion: 1,
  init: 'INIT',
  states: [{ id: 'INIT' }, { id: 'STARTING' }, { id: 'ACTIVE' }, { id: 'ERROR' }, { id: 'FATAL', terminal: true }],
  transitions: [
    { from: 'INIT', event: 'power_ready', to: 'STARTING' },
    { from: 'STARTING', event: 'ack', to: 'ACTIVE' },
    { from: 'ACTIVE', event: 'stop', to: 'FATAL' },
    { from: 'STARTING', event: 'timeout', guard: { variable: 'retry', op: '<', value: 3 }, to: 'ERROR', updates: [{ variable: 'retry', op: 'inc' }] },
    { from: 'STARTING', event: 'timeout', guard: { variable: 'retry', op: '>=', value: 3 }, to: 'FATAL' },
    { from: 'ERROR', event: 'cooldown', to: 'STARTING' },
  ],
  variables: [{ name: 'retry', kind: 'integer', init: 0, min: 0, max: 3 }],
}

const narrated = {
  ...model,
  narrative: {
    states: { INIT: 'power-on, not ready', STARTING: 'handshake in flight', ACTIVE: 'running', ERROR: 'retryable failure', FATAL: 'unrecoverable' },
    events: { power_ready: 'supply is up', ack: 'peer acknowledged', stop: 'operator stop', timeout: 'handshake timed out', cooldown: 'cooldown elapsed' },
    scenarios: [
      { from: 'INIT', event: 'power_ready', scenario: 'supply up, start handshake' },
      { from: 'STARTING', event: 'ack', scenario: 'peer acknowledged, run' },
      { from: 'ACTIVE', event: 'stop', scenario: 'operator stops the machine' },
      { from: 'STARTING', event: 'timeout', scenario: 'handshake times out, retry or fail' },
      { from: 'ERROR', event: 'cooldown', scenario: 'retry after cooldown' },
    ],
  },
}

// ---------------------------------------------------------------- rendering --

test('render: mermaid state diagram carries directives, guards and terminal marks', () => {
  const out = renderUml(model, 'mermaid', 'state')
  for (const needle of ['%%dsh-model-everything:uml v1 notation=mermaid diagram=state', '%%dsh-model-everything:init INIT', '%%dsh-model-everything:terminal FATAL', 'stateDiagram-v2', '[*] --> INIT', 'STARTING --> ERROR : timeout [retry < 3] / retry := retry + 1', 'FATAL --> [*]']) {
    if (!out.primary.includes(needle)) throw new Error('missing ' + needle + '\n' + out.primary)
  }
  if (out.warnings.length !== 0) throw new Error('unexpected warnings: ' + out.warnings.join(' | '))
})

test('render: plantuml state diagram is fenced and directive-commented', () => {
  const out = renderUml(model, 'plantuml', 'state')
  for (const needle of ['@startuml', '@enduml', "'dsh-model-everything:init INIT", '[*] --> INIT', 'STARTING --> FATAL : timeout [retry >= 3]', 'FATAL --> [*]']) {
    if (!out.primary.includes(needle)) throw new Error('missing ' + needle + '\n' + out.primary)
  }
})

test('render: mermaid activity flowchart labels every edge with event [guard] / actions', () => {
  const out = renderUml(model, 'mermaid', 'activity')
  for (const needle of ['flowchart TD', 'FATAL(["FATAL"])', 'INIT["INIT"]', 'STARTING -->|"timeout [retry < 3] / retry := retry + 1"| ERROR']) {
    if (!out.primary.includes(needle)) throw new Error('missing ' + needle + '\n' + out.primary)
  }
  if (out.diagram !== 'activity') throw new Error('diagram kind not reported')
})

test('render: sequence view is a capped trace and says so', () => {
  const out = renderUml(model, 'mermaid', 'sequence')
  for (const needle of ['sequenceDiagram', 'participant ENV as Environment', 'ENV->>M: power_ready', 'Note over M: INIT -> STARTING']) {
    if (!out.primary.includes(needle)) throw new Error('missing ' + needle + '\n' + out.primary)
  }
  if (!out.warnings.some((warning) => warning.includes('UML_RENDER_SEQUENCE_IS_TRACE'))) throw new Error('a trace must be labelled a trace')
  const capped = renderUml(model, 'mermaid', 'sequence', 2)
  if (!capped.warnings.some((warning) => warning.includes('UML_RENDER_SEQUENCE_TRUNCATED'))) throw new Error('expected truncation warning')
})

test('render: plantuml activity is refused instead of mislabelled', () => {
  let message = ''
  try { renderUml(model, 'plantuml', 'activity') } catch (error) { message = error instanceof Error ? error.message : String(error) }
  if (!message.includes('activity')) throw new Error('expected a refusal naming the missing view, got: ' + message)
})

// -------------------------------------------------- view x intent entry check --
// The view follows the question, not the machine, so no classifier picks it. What the
// front end can do is refuse a pairing that cannot serve the declared question, before
// the work — not as a finding about the wrong artifact afterwards. These tests pin both
// halves: the refusals, and that omitting `intent` changes nothing.

function refusalOf(fn) {
  try {
    fn()
  } catch (error) {
    return { code: error instanceof UmlError ? error.code : undefined, message: error instanceof Error ? error.message : String(error) }
  }
  throw new Error('expected a refusal, got a result')
}

test('entry: the cell that does not exist carries its own code', () => {
  const refusal = refusalOf(() => renderUml(model, 'plantuml', 'activity'))
  if (refusal.code !== 'UML_VIEW_UNREPRESENTABLE') throw new Error('code: ' + String(refusal.code))
})

test('entry: intent "present" keeps the trace, which is what a human reads', () => {
  const out = renderUml(model, 'mermaid', 'sequence', 60, 'present')
  if (!out.primary.includes('sequenceDiagram')) throw new Error('a trace for a reader must still render\n' + out.primary)
})

test('entry: a machine intent refuses a trace before drawing it', () => {
  // render can serve `verify`, so here the view is what is refused.
  const onRender = refusalOf(() => renderUml(model, 'mermaid', 'sequence', 60, 'verify'))
  if (onRender.code !== 'UML_INTENT_UNSERVABLE') throw new Error('render code: ' + String(onRender.code))
  if (!onRender.message.includes('one BFS trace')) throw new Error('render message: ' + onRender.message)
  // review can serve both machine intents, so each is refused on its own terms.
  const onReviewVerify = refusalOf(() => reviewUml({ model, diagramKind: 'sequence', intent: 'verify' }))
  if (onReviewVerify.code !== 'UML_INTENT_UNSERVABLE') throw new Error('review/verify code: ' + String(onReviewVerify.code))
  const onReviewFidelity = refusalOf(() => reviewUml({ model, diagramKind: 'sequence', intent: 'fidelity' }))
  if (onReviewFidelity.code !== 'UML_INTENT_UNSERVABLE') throw new Error('review/fidelity code: ' + String(onReviewFidelity.code))
  if (!onReviewFidelity.message.includes('fidelity check does not apply')) throw new Error('review/fidelity message: ' + onReviewFidelity.message)
})

test('entry: render cannot serve the fidelity intent, which is the review job', () => {
  const refusal = refusalOf(() => renderUml(model, 'mermaid', 'state', 60, 'fidelity'))
  if (refusal.code !== 'UML_INTENT_MISMATCH') throw new Error('code: ' + String(refusal.code))
  // The same machine and view are exactly what review needs to run that proof.
  const report = reviewUml({ model, intent: 'fidelity' })
  if (report.verdict === 'fail') throw new Error('a state view must serve intent fidelity: ' + report.verdictReason)
})

test('entry: a review asking for the proof cannot hide behind a view that does not render', () => {
  const refusal = refusalOf(() => reviewUml({ model, notation: 'plantuml', diagramKind: 'activity', intent: 'fidelity' }))
  if (refusal.code !== 'UML_VIEW_UNREPRESENTABLE') throw new Error('code: ' + String(refusal.code))
})

test('entry: a trace with intent "present" is reviewed, not refused', () => {
  const report = reviewUml({ model, diagramKind: 'sequence', intent: 'present' })
  if (!codes(report).includes('UML019_ROUND_TRIP_SKIPPED')) throw new Error('a presented trace still reports UML019: ' + codes(report).join(', '))
})

test('entry: without an intent the documented behaviour is unchanged', () => {
  const trace = reviewUml({ model, diagramKind: 'sequence' })
  if (!codes(trace).includes('UML019_ROUND_TRIP_SKIPPED')) throw new Error('UML019 must still be reported: ' + codes(trace).join(', '))
  if (trace.verdict === 'fail') throw new Error('a trace review is not a failure on its own')
  const unrendered = reviewUml({ model, notation: 'plantuml', diagramKind: 'activity' })
  if (unrendered.verdict === 'fail') throw new Error('an unrenderable view is a warning when no intent claims it')
})

test('entry: an unknown intent is refused by the library, not ignored', () => {
  const refusal = refusalOf(() => renderUml(model, 'mermaid', 'state', 60, 'prove'))
  if (!refusal.message.includes('unknown intent')) throw new Error('message: ' + refusal.message)
})

test('render: narrative meanings appear in the diagram labels', () => {
  const state = renderUml(narrated, 'mermaid', 'state')
  if (!state.primary.includes('state "INIT（power-on, not ready）" as INIT')) throw new Error('state label missing\n' + state.primary)
  const activity = renderUml(narrated, 'mermaid', 'activity')
  if (!activity.primary.includes('INIT["INIT（power-on, not ready）"]')) throw new Error('activity label missing\n' + activity.primary)
})

// ------------------------------------------------------------------ parsing --

test('round trip: mermaid/plantuml state and mermaid activity read back structure-for-structure', () => {
  for (const [notation, kind] of [['mermaid', 'state'], ['mermaid', 'activity'], ['plantuml', 'state']]) {
    const rendered = renderUml(model, notation, kind)
    const parsed = parseUml(rendered.primary)
    const diffs = diffModels(model, parsed.model)
    if (diffs.length > 0) throw new Error(`${notation}/${kind} round trip: ` + diffs.join(' | '))
    if (parsed.notation !== notation) throw new Error(`${notation}/${kind}: notation misdetected as ${parsed.notation}`)
  }
})

test('round trip: nested guards and several actions survive the notation', () => {
  const nested = {
    schemaVersion: 1,
    init: 'A',
    states: [{ id: 'A' }, { id: 'B', terminal: true }],
    transitions: [
      { from: 'A', event: 'go', guard: { any: [{ all: [{ variable: 'k', op: '<', value: 2 }, { variable: 'armed', op: '==', value: true }] }, { not: { variable: 'locked', op: '==', value: true } }] }, to: 'B', updates: [{ variable: 'k', op: 'inc', value: 2 }, { variable: 'armed', op: 'set', value: 0 }, { variable: 'n', op: 'dec' }] },
      { from: 'A', event: 'go', to: 'B' },
    ],
    variables: [{ name: 'k', kind: 'integer', init: 0, min: 0, max: 9 }, { name: 'armed', kind: 'boolean', init: false }, { name: 'locked', kind: 'boolean', init: false }, { name: 'n', kind: 'integer', init: 5, min: 0, max: 5 }],
  }
  for (const notation of ['mermaid', 'plantuml']) {
    const rendered = renderUml(nested, notation, 'state')
    const parsed = parseUml(rendered.primary)
    const diffs = diffModels(nested, parsed.model)
    if (diffs.length > 0) throw new Error(notation + ' nested round trip: ' + diffs.join(' | '))
  }
})

test('round trip: ids the notation cannot spell are restored through alias directives', () => {
  const odd = {
    schemaVersion: 1,
    init: '1st',
    states: [{ id: '1st' }, { id: 'has space' }, { id: 'A-B' }, { id: 'A_B' }, { id: 'done!', terminal: true }],
    transitions: [
      { from: '1st', event: 'go on', to: 'has space' },
      { from: 'has space', event: 'branch', to: 'A-B' },
      { from: 'has space', event: 'branch2', to: 'A_B' },
      { from: 'A-B', event: 'finish', to: 'done!' },
      { from: 'A_B', event: 'finish2', to: 'done!' },
    ],
  }
  const rendered = renderUml(odd, 'mermaid', 'state')
  if (!rendered.warnings.some((warning) => warning.includes('UML_RENDER_ID_SANITIZED'))) throw new Error('expected a sanitization warning')
  const parsed = parseUml(rendered.primary)
  const diffs = diffModels(odd, parsed.model)
  if (diffs.length > 0) throw new Error('sanitized-id round trip: ' + diffs.join(' | '))
})

test('round trip: states no transition touches survive (isolated start, isolated terminal)', () => {
  // The sweep over tests/engine/fixtures/ caught this: a terminal state with no
  // incoming edge is named only by `X --> [*]`, and a machine with no transitions
  // at all names its start state only by `[*] --> X`. Neither may be dropped.
  const sparse = {
    schemaVersion: 1,
    init: 'BOOT',
    states: [{ id: 'BOOT' }, { id: 'LONE' }, { id: 'HALT', terminal: true }],
    transitions: [{ from: 'BOOT', event: 'halt', to: 'HALT' }],
  }
  for (const [notation, kind] of [['mermaid', 'state'], ['plantuml', 'state'], ['mermaid', 'activity']]) {
    const parsed = parseUml(renderUml(sparse, notation, kind).primary)
    const diffs = diffModels(sparse, parsed.model)
    if (diffs.length > 0) throw new Error(`${notation}/${kind} lost an isolated state: ` + diffs.join(' | '))
  }
  const edgeless = { schemaVersion: 1, init: 'ONLY', states: [{ id: 'ONLY', terminal: true }], transitions: [] }
  const parsed = parseUml(renderUml(edgeless, 'mermaid', 'state').primary)
  const diffs = diffModels(edgeless, parsed.model)
  if (diffs.length > 0) throw new Error('an edgeless machine must still parse: ' + diffs.join(' | '))
})

test('parse: a hand-written mermaid diagram without directives infers init, terminals and names unlabelled arrows', () => {
  const text = [
    'stateDiagram-v2',
    '  [*] --> IDLE',
    '  IDLE --> BUSY : start',
    '  IDLE --> IDLE : tick',
    '  BUSY --> IDLE',
    '  BUSY --> [*]',
    '  IDLE : waiting for work',
  ].join('\n')
  const parsed = parseUml(text)
  if (parsed.model.init !== 'IDLE') throw new Error('init not read from the initial pseudostate')
  const busy = parsed.model.states.find((state) => state.id === 'BUSY')
  if (busy === undefined || busy.terminal !== true) throw new Error('terminal state not marked')
  const synthetic = parsed.model.transitions.find((transition) => transition.from === 'BUSY')
  if (synthetic === undefined || !synthetic.event.startsWith('t_BUSY_IDLE')) throw new Error('unlabelled arrow must get a synthetic event, got ' + JSON.stringify(synthetic))
  if (!parsed.warnings.some((warning) => warning.includes('UML_PARSE_SYNTHETIC_EVENT'))) throw new Error('synthetic events must be reported')
  if (parsed.labels.IDLE !== 'waiting for work') throw new Error('state description not captured as a label')
})

test('parse: a hand-written flowchart uses the init/terminal directives', () => {
  const text = [
    '%%dsh-model-everything:init START',
    '%%dsh-model-everything:terminal END',
    'flowchart TD',
    '  START["start"] --> WORK["work"]',
    '  WORK --> END["end"]',
    '  WORK --> WORK',
  ].join('\n')
  const parsed = parseUml(text)
  if (parsed.model.init !== 'START') throw new Error('init directive ignored')
  const end = parsed.model.states.find((state) => state.id === 'END')
  if (end === undefined || end.terminal !== true) throw new Error('terminal directive ignored')
  if (parsed.diagram !== 'activity') throw new Error('flowchart must parse as the activity view')
})

test('parse: several initial pseudostates are reported, not silently merged', () => {
  const text = ['stateDiagram-v2', '  [*] --> A', '  [*] --> B', '  A --> B : go', '  B --> [*]'].join('\n')
  const parsed = parseUml(text)
  if (parsed.model.init !== 'A') throw new Error('the first entry state must win')
  if (!parsed.warnings.some((warning) => warning.includes('UML_PARSE_MULTIPLE_INIT'))) throw new Error('multiple init states must be reported')
})

test('parse: a sequence diagram is refused, because a trace cannot reconstruct a machine', () => {
  let message = ''
  try { parseUml(renderUml(model, 'mermaid', 'sequence').primary) } catch (error) { message = error instanceof Error ? error.message : String(error) }
  if (!message.includes('trace')) throw new Error('expected the trace refusal, got: ' + message)
})

test('parse: an unreadable guard fails loudly instead of dropping the branch condition', () => {
  const text = ['stateDiagram-v2', '  [*] --> A', '  A --> B : go [retry ~~ 3]', '  B --> [*]'].join('\n')
  let message = ''
  try { parseUml(text) } catch (error) { message = error instanceof Error ? error.message : String(error) }
  if (!message.includes('guard')) throw new Error('expected a guard error, got: ' + message)
})

test('guard text: render and parse are inverse for nested guards', () => {
  const guard = { any: [{ all: [{ variable: 'k', op: '<', value: 2 }, { variable: 'armed', op: '==', value: true }] }, { not: { variable: 'locked', op: '!=', value: false } }] }
  const text = guardText(guard)
  const back = parseGuardText(text)
  if (guardText(back) !== text) throw new Error('guard round trip changed the expression: ' + text + ' -> ' + guardText(back))
})

// ------------------------------------------------------------------- review --

test('review: a well-formed model reports no errors and a passing round trip', () => {
  const report = reviewUml({ model: narrated })
  if (!report.ok) throw new Error('review refused a valid model')
  if (report.summary.errors !== 0) throw new Error('unexpected errors: ' + JSON.stringify(findFinding(report, 'UML002_UNREACHABLE_STATE')))
  if (report.roundTrip === null || !report.roundTrip.ok) throw new Error('round trip should pass: ' + JSON.stringify(report.roundTrip))
  if (report.summary.reachableStates !== 5) throw new Error('reachability summary wrong')
  if (report.summary.documentedStates !== 5) throw new Error('narrative should document every state, got ' + report.summary.documentedStates)
  if (report.primary === undefined || !report.primary.includes('stateDiagram-v2')) throw new Error('review must return the diagram it checked')
  assertNoUndefinedValues(report)
})

test('review: structural modelling defects are named, with the states that carry them', () => {
  const broken = {
    schemaVersion: 1,
    init: 'START',
    states: [{ id: 'START' }, { id: 'ORPHAN' }, { id: 'DEAD' }, { id: 'LOOP' }, { id: 'TWICE' }],
    transitions: [
      { from: 'START', event: 'go', to: 'TWICE' },
      { from: 'START', event: 'go', to: 'DEAD' },
      { from: 'TWICE', event: 'go', to: 'TWICE' },
      { from: 'TWICE', event: 'go', to: 'DEAD' },
      { from: 'LOOP', event: 'spin', to: 'LOOP' },
      { from: 'ORPHAN', event: 'never', to: 'DEAD' },
    ],
    variables: [{ name: 'unused_counter', kind: 'integer', init: 0 }],
  }
  const report = reviewUml({ model: broken })
  const expected = [
    'UML002_UNREACHABLE_STATE',
    'UML003_DEAD_END_STATE',
    'UML004_AMBIGUOUS_BRANCH',
    'UML007_UNUSED_EVENT',
    'UML008_SELF_LOOP_NO_EXIT',
    'UML010_UNUSED_VARIABLE',
    'UML011_UNBOUNDED_VARIABLE',
    'UML012_NO_TERMINAL',
    'UML013_NO_NARRATIVE',
  ]
  for (const code of expected) {
    if (findFinding(report, code).length === 0) throw new Error('missing ' + code + ' in ' + JSON.stringify(codes(report)))
  }
  const unreachable = findFinding(report, 'UML002_UNREACHABLE_STATE')[0]
  if (!unreachable.states.includes('ORPHAN') || !unreachable.states.includes('LOOP')) throw new Error('unreachable findings must name the states: ' + JSON.stringify(unreachable.states))
  if (report.roundTrip === null || !report.roundTrip.ok) throw new Error('the diagram still carries this model; the findings are about the model')
})

test('review: duplicate transitions and unbounded variables are separate findings', () => {
  const duplicated = {
    schemaVersion: 1,
    init: 'A',
    states: [{ id: 'A' }, { id: 'B', terminal: true }],
    transitions: [
      { from: 'A', event: 'go', to: 'B' },
      { from: 'A', event: 'go', to: 'B' },
    ],
    variables: [{ name: 'k', kind: 'integer', init: 0, min: 0, max: 4 }],
  }
  const report = reviewUml({ model: duplicated })
  if (findFinding(report, 'UML009_DUPLICATE_TRANSITION').length === 0) throw new Error('duplicate transition not reported')
  if (findFinding(report, 'UML004_AMBIGUOUS_BRANCH').length === 0) throw new Error('two unguarded branches of one event are ambiguous')
  if (findFinding(report, 'UML011_UNBOUNDED_VARIABLE').length !== 0) throw new Error('a bounded variable must not be flagged')
})

test('review: complementary guards downgrade the missing-else warning, plain guards keep it', () => {
  const complementary = {
    schemaVersion: 1,
    init: 'A',
    states: [{ id: 'A' }, { id: 'B', terminal: true }, { id: 'C', terminal: true }],
    transitions: [
      { from: 'A', event: 'go', guard: { variable: 'k', op: '<', value: 3 }, to: 'B' },
      { from: 'A', event: 'go', guard: { variable: 'k', op: '>=', value: 3 }, to: 'C' },
    ],
    variables: [{ name: 'k', kind: 'integer', init: 0, min: 0, max: 9 }],
  }
  const report = reviewUml({ model: complementary })
  const finding = findFinding(report, 'UML006_INEXHAUSTIVE_BRANCH')[0]
  if (finding === undefined) throw new Error('expected a branch-coverage finding')
  if (finding.severity !== 'info') throw new Error('a complementary pair is probably exhaustive; expected info, got ' + finding.severity)

  const partial = {
    ...complementary,
    transitions: [
      { from: 'A', event: 'go', guard: { variable: 'k', op: '<', value: 3 }, to: 'B' },
      { from: 'A', event: 'go', guard: { variable: 'k', op: '>', value: 5 }, to: 'C' },
    ],
  }
  const partialReport = reviewUml({ model: partial })
  const warning = findFinding(partialReport, 'UML006_INEXHAUSTIVE_BRANCH')[0]
  if (warning === undefined || warning.severity !== 'warning') throw new Error('a guard gap must stay a warning')
})

test('review: a diagram that carries a different machine fails the fidelity check', () => {
  const other = { ...model, transitions: model.transitions.slice(0, 4) }
  const diagram = renderUml(other, 'mermaid', 'state').primary
  const report = reviewUml({ model, diagram })
  if (report.source !== 'model+diagram') throw new Error('source not reported')
  if (report.roundTrip === null || report.roundTrip.ok) throw new Error('a mismatched diagram must fail the round trip')
  const finding = findFinding(report, 'UML017_ROUND_TRIP_MISMATCH')[0]
  if (finding === undefined || finding.severity !== 'error') throw new Error('expected a round-trip error finding')
  if (report.summary.errors === 0) throw new Error('the summary must count the mismatch as an error')
})

test('review: a diagram label that disagrees with the model narrative is drift', () => {
  const drifted = renderUml(narrated, 'mermaid', 'state').primary.replace('state "INIT（power-on, not ready）" as INIT', 'state "INIT（supply is down）" as INIT')
  const report = reviewUml({ model: narrated, diagram: drifted })
  if (report.roundTrip === null || !report.roundTrip.ok) throw new Error('relabelling is not a structural change; the round trip must still pass')
  const finding = findFinding(report, 'UML015_LABEL_DRIFT')[0]
  if (finding === undefined) throw new Error('expected label drift, got ' + JSON.stringify(codes(report)))
  if (!finding.detail.includes('supply is down')) throw new Error('drift must quote both labels: ' + finding.detail)
})

test('review: a diagram-only review reads the diagram as the model and says fidelity is unchecked', () => {
  const diagram = ['%%dsh-model-everything:init A', '%%dsh-model-everything:terminal B', 'flowchart TD', '  A --> B : go'].join('\n')
  const report = reviewUml({ diagram })
  if (report.source !== 'diagram') throw new Error('source not reported')
  if (report.model === undefined || report.model.init !== 'A') throw new Error('the parsed model must be echoed')
  if (findFinding(report, 'UML018_FIDELITY_UNCHECKED').length === 0) throw new Error('fidelity must be declared unchecked')
  if (findFinding(report, 'UML014_UNDOCUMENTED_STATE').length === 0) throw new Error('unlabelled states must be reported as undocumented')
  if (report.summary.documentedStates !== 0) throw new Error('no state carries a meaning here')
})

test('review: an unreadable diagram is an error report, not a crash', () => {
  const report = reviewUml({ diagram: 'this is not a diagram' })
  if (report.ok) throw new Error('an unreadable diagram must not report ok')
  if (findFinding(report, 'UML001_DIAGRAM_UNREADABLE').length === 0) throw new Error('expected UML001, got ' + JSON.stringify(codes(report)))
  assertNoUndefinedValues(report)
})

test('review: asking for nothing is refused', () => {
  let thrown = false
  try { reviewUml({}) } catch (error) { thrown = error instanceof UmlError }
  if (!thrown) throw new Error('expected a UmlError')
})

test('review: maxSteps reaches the fidelity check when the view is a trace', () => {
  // A dead option is worse than a missing one: the caller sets a cap, the report
  // says nothing about it, and the truncated trace is presented as the whole flow.
  const report = reviewUml({ model: narrated, diagramKind: 'sequence', maxSteps: 1 })
  if (!report.warnings.some((warning) => warning.includes('UML_RENDER_SEQUENCE_TRUNCATED'))) {
    throw new Error('maxSteps must reach the rendered trace: ' + JSON.stringify(report.warnings))
  }
  if (report.primary === undefined || !report.primary.includes('sequenceDiagram')) throw new Error('the sequence view must be rendered')
  if (report.roundTrip !== null) throw new Error('a trace view cannot be fidelity-checked; roundTrip must stay null')
  const skipped = findFinding(report, 'UML019_ROUND_TRIP_SKIPPED')[0]
  if (skipped === undefined || !skipped.message.includes('trace')) throw new Error('the report must say why the check does not apply')
})

test('review: next steps route to the engine checks that settle what the review cannot', () => {
  const report = reviewUml({ model })
  if (!report.nextSteps.some((step) => step.includes('model_verify'))) throw new Error('the review must route to model_verify')
  if (!report.nextSteps.some((step) => step.includes('narrative'))) throw new Error('a model without narrative must be told to add one')
})

// ------------------------------------------- structure diagrams are not models --

// The worst failure this front end can have: a component / package / class diagram
// declares no diagram kind, so a state parser meets its keywords line by line and
// returns a plausible-looking machine. It parsed cleanly before this contract existed —
// `ok: true`, two states, one transition — and "the structure diagram was reviewed"
// was pure fabrication. A parse of such a file must now be loud and must not pass.
const componentDiagram = [
  '@startuml',
  'component [Order Service] as SVC',
  'component [Payment Adapter] as PAY',
  'package "HAL" {',
  '  component [Storage Driver] as DRV',
  '}',
  'SVC --> PAY : request',
  'PAY --> DRV : read',
  '@enduml',
].join('\n')

test('parse: a structure diagram is a structure model of its own family', () => {
  // The by-product machine is gone. The text is read as what it is: a graph of nodes
  // and dependency edges, in the family the header or the declaration named.
  const parsed = parseUml(componentDiagram)
  if (parsed.family !== 'component' || parsed.diagram !== 'component') throw new Error('family: ' + parsed.family)
  if ('states' in parsed.model || 'transitions' in parsed.model) throw new Error('a component diagram must not produce a machine')
  const ids = parsed.model.nodes.map((node) => node.id).sort()
  if (JSON.stringify(ids) !== JSON.stringify(['DRV', 'HAL', 'PAY', 'SVC'])) throw new Error('nodes: ' + JSON.stringify(ids))
  const edges = parsed.model.edges.map((edge) => edge.from + '->' + edge.to).sort()
  if (JSON.stringify(edges) !== JSON.stringify(['PAY->DRV', 'SVC->PAY'])) throw new Error('edges: ' + JSON.stringify(edges))
  const kinds = parsed.model.nodes.map((node) => node.id + ':' + node.kind).sort()
  if (!kinds.includes('SVC:component')) throw new Error('declared kinds must survive: ' + JSON.stringify(kinds))
})

test('review: a structure diagram is reviewed as its own family', () => {
  const report = reviewUml({ diagram: componentDiagram })
  if (report.ok !== true || report.ran !== true) throw new Error('the review ran')
  if (report.family !== 'component') throw new Error('family: ' + String(report.family))
  // A clean component diagram has no structural defect: the review says so and routes
  // the dependency question to the tool that audits the graph against a matrix.
  const reported = codes(report)
  if (reported.some((code) => code.startsWith('UML02'))) throw new Error('this diagram is clean: ' + JSON.stringify(reported))
  const isolated = reviewUml({ diagram: ['@startuml', 'component A', 'component B', 'component C', 'A --> B', '@enduml'].join('\n') })
  if (!codes(isolated).includes('UML020_ISOLATED_NODE')) throw new Error('an isolated component must be reported: ' + JSON.stringify(codes(isolated)))
  if (!report.nextSteps.some((step) => step.includes('uml_structure_verify'))) {
    throw new Error('the next steps must route dependency questions to the structure tool')
  }
  assertNoUndefinedValues(report)
})

test('review: a machine presented against a structure diagram is a family mismatch', () => {
  const report = reviewUml({ model, diagram: componentDiagram })
  if (report.source !== 'model+diagram') throw new Error('source not reported')
  if (report.verdict !== 'fail') throw new Error('a machine is not a component diagram: ' + report.verdict)
  if (findFinding(report, 'UML041_MODEL_FAMILY_MISMATCH').length !== 1) {
    throw new Error('expected UML041_MODEL_FAMILY_MISMATCH, got ' + JSON.stringify(codes(report)))
  }
  if (report.roundTrip !== null) throw new Error('a model of another family cannot have a fidelity report')
})

test('parse: a Mermaid class diagram is the class family, and a foreign header is refused', () => {
  const parsed = parseUml(['classDiagram', '  class OrderService', '  OrderService --> PaymentAdapter'].join('\n'))
  if (parsed.family !== 'class') throw new Error('family: ' + parsed.family)
  const edges = parsed.model.edges.map((edge) => edge.from + '->' + edge.to)
  if (!edges.includes('OrderService->PaymentAdapter')) throw new Error('edges: ' + JSON.stringify(edges))
  let refusal
  try { parseUml(['erDiagram', '  USER ||--o{ ORDER : places'].join('\n')) } catch (error) { refusal = error }
  if (!(refusal instanceof UmlError)) throw new Error('expected a UmlError refusal for erDiagram')
  if (refusal.code !== 'UML_NOT_A_STATE_DIAGRAM') throw new Error('refusal code: ' + refusal.code)
  if (!refusal.message.includes('erDiagram')) throw new Error('the refusal must name the family: ' + refusal.message)
})

test('review: an unreadable family is an error report with a failing verdict', () => {
  const report = reviewUml({ diagram: ['erDiagram', '  USER ||--o{ ORDER : places'].join('\n') })
  if (report.ok !== false || report.verdict !== 'fail') throw new Error('expected ok:false and verdict fail')
  if (findFinding(report, 'UML001_DIAGRAM_UNREADABLE').length !== 1) throw new Error('expected UML001')
  if (!report.findings[0].message.includes('erDiagram')) throw new Error('the message must name the family: ' + report.findings[0].message)
})

test('parse: a multi-line note is not mistaken for an unsupported construct', () => {
  // The construct keywords are ordinary English words. A note block that mentions one
  // must not turn a legitimately parsed state diagram into a failed review — and it must
  // not be read as the construct its body happens to name. R7: the block itself is reported
  // once as `note`, at its start line.
  const text = [
    'stateDiagram-v2',
    '  [*] --> IDLE',
    '  IDLE --> BUSY : start',
    '  BUSY --> IDLE : done',
    '  note left of IDLE',
    '    the component layer owns this state',
    '    package boundaries do not apply here',
    '  end note',
  ].join('\n')
  const parsed = parseUml(text)
  const foreign = parsed.discardedConstructs.filter((entry) => entry.construct !== 'note')
  if (foreign.length !== 0) throw new Error('a note body must not be read as a construct: ' + JSON.stringify(foreign))
  if (parsed.discardedConstructs.length !== 1 || parsed.discardedConstructs[0].line !== 5) {
    throw new Error('the note block itself must be reported once, at its start line: ' + JSON.stringify(parsed.discardedConstructs))
  }
  const report = reviewUml({ diagram: text })
  if (report.verdict === 'fail') throw new Error('a note mentioning a construct keyword must not fail the review: ' + report.verdictReason)
})

test('review: a well-modelled machine still passes (the contract did not overreach)', () => {
  const report = reviewUml({ model })
  if (report.ran !== true) throw new Error('ran must be reported')
  if (report.verdict === 'fail') throw new Error('no error finding here: ' + report.verdictReason)
  if (report.summary.errors !== 0) throw new Error('expected no error findings')
})

test('review: names its contract, carries its hashes and reports narrative coverage', () => {
  const full = reviewUml({ model: narrated })
  if (full.schema !== 'model-everything/uml/review/v1') throw new Error('schema: ' + full.schema)
  if (full.hashes.hashSpec !== 'v1') throw new Error('hashSpec: ' + JSON.stringify(full.hashes))
  if (full.roundTrip !== null && (full.hashes.modelHash === undefined || full.hashes.parsedHash === undefined)) {
    throw new Error('a round-tripped review must carry both hashes: ' + JSON.stringify(full.hashes))
  }
  if (full.narrativeCoverage === undefined || full.narrativeCoverage.states !== '5/5' || full.narrativeCoverage.events !== '5/5' || full.narrativeCoverage.scenarios !== '5/5') {
    throw new Error('a present narrative always reports its coverage: ' + JSON.stringify(full.narrativeCoverage))
  }
  if (full.nextSteps.length === 0) throw new Error('nextSteps must not be empty')
  assertNoUndefinedValues(full)

  // P1-9: a partial narrative is valid, its gap is reported as coverage and as UML027.
  const partial = { ...model, narrative: { states: { INIT: 'power-on, not ready' } } }
  const report = reviewUml({ model: partial })
  if (report.ok !== true || report.summary.errors !== 0) throw new Error('a partial narrative must not fail the review')
  if (JSON.stringify(report.narrativeCoverage) !== JSON.stringify({ states: '1/5', events: '0/5', scenarios: '0/5' })) {
    throw new Error('coverage: ' + JSON.stringify(report.narrativeCoverage))
  }
  const finding = findFinding(report, 'UML027_NARRATIVE_PARTIAL')[0]
  if (finding === undefined || finding.severity !== 'info') throw new Error('expected an info-level UML027, got ' + JSON.stringify(codes(report)))
  if (finding.evidence.narrativeCoverage.states !== '1/5') throw new Error('the finding must carry the coverage')
  if (findFinding(report, 'UML013_NO_NARRATIVE').length !== 0) throw new Error('a partial narrative is not "no narrative"')
  assertNoUndefinedValues(report)
})

test('review: full narrative coverage silences UML027, and absence keeps UML013', () => {
  const complete = reviewUml({ model: { ...narrated, narrative: {
    states: { INIT: 'a', STARTING: 'b', ACTIVE: 'c', ERROR: 'd', FATAL: 'e' },
    events: { power_ready: 'a', ack: 'b', stop: 'c', timeout: 'd', cooldown: 'e' },
    scenarios: [
      { from: 'INIT', event: 'power_ready', scenario: 'a' },
      { from: 'STARTING', event: 'ack', scenario: 'b' },
      { from: 'ACTIVE', event: 'stop', scenario: 'c' },
      { from: 'STARTING', event: 'timeout', scenario: 'd' },
      { from: 'ERROR', event: 'cooldown', scenario: 'e' },
    ],
  } } })
  if (findFinding(complete, 'UML027_NARRATIVE_PARTIAL').length !== 0) throw new Error('full coverage must not be partial')
  if (complete.narrativeCoverage.states !== '5/5' || complete.narrativeCoverage.scenarios !== '5/5') {
    throw new Error('coverage: ' + JSON.stringify(complete.narrativeCoverage))
  }
  const absent = reviewUml({ model })
  if (findFinding(absent, 'UML013_NO_NARRATIVE').length !== 1) throw new Error('an absent narrative keeps UML013')
  if ('narrativeCoverage' in absent) throw new Error('an absent narrative has no coverage to report')
})

test('explain-labels: every documented claim is true of the parser', () => {
  const explanation = explainLabels('mermaid')
  const narrative = { ...model, narrative: { states: { INIT: 'power-on, not ready', STARTING: 'handshake in flight', ACTIVE: 'running', ERROR: 'retryable failure', FATAL: 'unrecoverable' }, events: { power_ready: 'a', ack: 'b', stop: 'c', timeout: 'd', cooldown: 'e' }, scenarios: [
    { from: 'INIT', event: 'power_ready', scenario: 's1' }, { from: 'STARTING', event: 'ack', scenario: 's2' },
    { from: 'ACTIVE', event: 'stop', scenario: 's3' }, { from: 'STARTING', event: 'timeout', scenario: 's4' },
    { from: 'ERROR', event: 'cooldown', scenario: 's5' },
  ] } }
  const rendered = renderUml(narrative, 'mermaid', 'state').primary
  if (!rendered.includes(explanation.renderedForm.replace('ID（meaning）', 'INIT（power-on, not ready）').replace(' as ID', ' as INIT'))) {
    throw new Error('the documented rendered form is not what the renderer writes:\n' + rendered)
  }

  // Each accepted label form must be read as the same meaning (no UML015 drift).
  const withLabel = (line) => ['%%dsh-model-everything:init INIT', '%%dsh-model-everything:terminal FATAL', 'stateDiagram-v2', '  [*] --> INIT', '  ' + line, '  INIT --> STARTING : power_ready', '  STARTING --> ACTIVE : ack', '  ACTIVE --> FATAL : stop', '  STARTING --> ERROR : timeout', '  ERROR --> STARTING : cooldown', '  FATAL --> [*]'].join('\n')
  const accepted = explanation.acceptedLabelForms.filter((form) => form.form !== 'bare id' && form.form !== 'a description line' && form.form !== 'a single-line note')
  for (const form of accepted) {
    const report = reviewUml({ model: narrative, diagram: withLabel(form.example.replace('IDLE', 'INIT').replace('waiting for power', 'power-on, not ready')) })
    if (findFinding(report, 'UML015_LABEL_DRIFT').length !== 0) {
      throw new Error('the documented form "' + form.form + '" must not be drift: ' + JSON.stringify(findFinding(report, 'UML015_LABEL_DRIFT')[0]?.detail))
    }
  }
  // The bare id is documented as "no meaning", i.e. undocumented rather than drift.
  const bare = reviewUml({ model: narrative, diagram: withLabel('state "INIT" as INIT') })
  if (findFinding(bare, 'UML014_UNDOCUMENTED_STATE').length === 0) throw new Error('a bare id must count as undocumented')
  if (findFinding(bare, 'UML015_LABEL_DRIFT').length !== 0) throw new Error('a bare id is not drift')

  // A description line and a single-line note are the same meaning in another spelling.
  for (const line of ['INIT : power-on, not ready', 'note right of INIT : power-on, not ready']) {
    const report = reviewUml({ model: narrative, diagram: withLabel(line) })
    if (findFinding(report, 'UML014_UNDOCUMENTED_STATE').length !== 0 && findFinding(report, 'UML015_LABEL_DRIFT').length !== 0) {
      throw new Error('"' + line + '" must be read as a meaning')
    }
  }

  // Ignored lines: a plain comment warns, a multi-line note block does not — but R7 makes it
  // reported rather than invisible, so the two channels stay distinguishable.
  const commented = reviewUml({ model: narrative, diagram: withLabel('%% this comment carries nothing') })
  if (!commented.warnings.some((warning) => warning.includes('UML_PARSE_IGNORED_LINE'))) {
    throw new Error('a non-directive comment must be reported: ' + JSON.stringify(commented.warnings))
  }
  const noted = reviewUml({ model: narrative, diagram: withLabel(['note left of INIT', '  several lines', 'end note'].join('\n')) })
  if (noted.warnings.some((warning) => warning.includes('UML_PARSE_IGNORED_LINE'))) {
    throw new Error('a multi-line note block must not warn line by line: ' + JSON.stringify(noted.warnings))
  }
  if (!(noted.discardedConstructs ?? []).some((entry) => entry.construct === 'note')) {
    throw new Error('a multi-line note block must be reported in discardedConstructs: ' + JSON.stringify(noted.discardedConstructs))
  }
  // The claim and the behaviour are asserted together: R7 changed the behaviour, and a
  // self-description that still said "skipped silently" would be exactly the drift this
  // test exists to prevent.
  const noteClaim = explanation.ignoredLines.find((entry) => entry.pattern.includes('note'))
  if (noteClaim === undefined) throw new Error('the note block must be described in ignoredLines')
  if (!noteClaim.behaviour.includes('discardedConstructs')) {
    throw new Error('the documented behaviour of a note block disagrees with the parser: ' + noteClaim.behaviour)
  }

  // The directive prefix is the one the parser consumes, in both notations.
  if (explainLabels('mermaid').directivePrefix !== '%%dsh-model-everything:') throw new Error('mermaid directive prefix')
  if (explainLabels('plantuml').directivePrefix !== "'dsh-model-everything:") throw new Error('plantuml directive prefix')
  const plantuml = parseUml(["'dsh-model-everything:uml v1 notation=plantuml diagram=state", "'dsh-model-everything:init INIT", '@startuml', 'state "INIT" as INIT', 'state "DONE" as DONE', "[*] --> INIT", 'INIT --> DONE : go', 'DONE --> [*]', '@enduml'].join('\n'))
  if (plantuml.model.init !== 'INIT') throw new Error('the documented directive form must be consumed')
  assertNoUndefinedValues(explanation)
})

// ------------------------------------------------------ the dsh tool surface --
// The library check above is not the surface a session calls: `uml` is, and
// a parameter that never reaches the library from there is a parameter that does not
// exist. This module loads @deepseek-ai/dsh-tools (a devDependency), so the import is
// dynamic: a checkout without dev dependencies still runs the library half of the suite.

let uml
try {
  uml = await import('../../lib/uml-tool.js')
} catch (error) {
  uml = undefined
  console.log('SKIP tool entry check: the dsh tool module did not load (' + (error instanceof Error ? error.message : String(error)) + ')')
}

if (uml !== undefined) {
  // One tool per job: the entry check runs each of them, because a parameter that only
  // exists in the schema is a parameter that does not exist.
  const entryCases = [
    ['uml_render sequence + verify', uml.umlRenderTool, { model, kind: 'sequence', intent: 'verify' }, 'UML_INTENT_UNSERVABLE'],
    ['uml_render + fidelity', uml.umlRenderTool, { model, intent: 'fidelity' }, 'UML_INTENT_MISMATCH'],
    ['uml_render plantuml/activity', uml.umlRenderTool, { model, notation: 'plantuml', kind: 'activity' }, 'UML_VIEW_UNREPRESENTABLE'],
    ['uml_parse + present', uml.umlParseTool, { diagram: 'stateDiagram-v2\n  [*] --> A\n  A --> [*]\n', intent: 'present' }, 'UML_INTENT_MISMATCH'],
    ['uml_review sequence + fidelity', uml.umlReviewTool, { model, kind: 'sequence', intent: 'fidelity' }, 'UML_INTENT_UNSERVABLE'],
  ]
  try {
    for (const [label, tool, args, code] of entryCases) {
      const out = await tool.execute(args)
      if (out.ok !== false || out.errorCode !== code) {
        throw new Error(label + ': expected a refusal ' + code + ', got ok=' + String(out.ok) + ' errorCode=' + String(out.errorCode))
      }
    }
    // The opt-in half: the same calls without an intent still run.
    for (const [label, tool, args] of [
      ['uml_render sequence without intent', uml.umlRenderTool, { model, kind: 'sequence' }],
      ['uml_review sequence without intent', uml.umlReviewTool, { model, kind: 'sequence' }],
    ]) {
      const out = await tool.execute(args)
      if (out.ok === false) throw new Error(label + ' must still run, got ' + String(out.errorCode))
    }
    // The fourth tool has one job and no intent to serve: it must answer without one.
    const labels = await uml.umlExplainLabelsTool.execute({ notation: 'mermaid' })
    if (labels.ok !== true || labels.action !== 'explain-labels') throw new Error('uml_explain_labels must print the label contract')
    if (labels.directivePrefix !== '%%dsh-model-everything:') {
      throw new Error('the label contract must carry the directive prefix: ' + String(labels.directivePrefix))
    }
    console.log('PASS tool entry: the four UML tools carry their own jobs, and intent reaches the entry check')
  } catch (error) {
    failures += 1
    console.log('FAIL tool entry:', error instanceof Error ? error.message : String(error))
  }
}





// ------------------------------------------------------- the use case family --

// The defect this family closes: ':User: --> (Login)' used to come back as a state
// machine, with no finding, from the everyday PlantUML use case syntax.
const useCaseDiagram = [
  '@startuml',
  'actor Customer',
  'rectangle Shop {',
  '  (Check out)',
  '  (Pay)',
  '}',
  'Customer --> (Check out)',
  '(Check out) .> (Pay) : <<include>>',
  '@enduml',
].join('\n')

test('use case: the colon form is a use case diagram, not a state machine', () => {
  const parsed = parseUml(['@startuml', ':User: --> (Login)', '(Login) .> (Validate) : include', '@enduml'].join('\n'))
  if (parsed.family !== 'use-case' || parsed.diagram !== 'use-case') throw new Error('family: ' + parsed.family)
  if ('states' in parsed.model || 'transitions' in parsed.model) throw new Error('a use case diagram must not produce a machine')
  if (JSON.stringify(parsed.model.actors) !== JSON.stringify([{ id: 'User' }])) throw new Error('actors: ' + JSON.stringify(parsed.model.actors))
  const kinds = parsed.model.relations.map((relation) => relation.from + '->' + relation.to + ':' + relation.kind).sort()
  if (JSON.stringify(kinds) !== JSON.stringify(['Login->Validate:include', 'User->Login:association'])) throw new Error('relations: ' + JSON.stringify(kinds))
})

test('use case: the keyword form parses actors, a boundary, include and generalization', () => {
  const parsed = parseUml(useCaseDiagram)
  if (parsed.family !== 'use-case') throw new Error('family: ' + parsed.family)
  if (parsed.model.subject !== 'Shop') throw new Error('subject: ' + String(parsed.model.subject))
  const ids = parsed.model.useCases.map((useCase) => useCase.id).sort()
  if (JSON.stringify(ids) !== JSON.stringify(['Check out', 'Pay'])) throw new Error('use cases: ' + JSON.stringify(ids))
  const kinds = parsed.model.relations.map((relation) => relation.kind).sort()
  if (JSON.stringify(kinds) !== JSON.stringify(['association', 'include'])) throw new Error('kinds: ' + JSON.stringify(kinds))
})

test('use case: the renderer and the parser agree, in both notations', () => {
  const model = {
    schemaVersion: 1,
    subject: 'Shop',
    actors: [{ id: 'CUST', label: 'Customer' }],
    useCases: [{ id: 'CHECKOUT', label: 'Check out' }, { id: 'PAY', label: 'Pay' }],
    relations: [
      { from: 'CUST', to: 'CHECKOUT', kind: 'association' },
      { from: 'CHECKOUT', to: 'PAY', kind: 'include' },
    ],
  }
  const plantuml = renderUml(model, 'plantuml', 'use-case')
  const backPlantuml = parseUml(plantuml.primary, 'plantuml')
  if (JSON.stringify(backPlantuml.model) !== JSON.stringify(model)) throw new Error('plantuml round trip: ' + JSON.stringify(backPlantuml.model))
  const mermaid = renderUml(model, 'mermaid', 'use-case')
  if (!mermaid.primary.startsWith('usecase-beta')) throw new Error('the mermaid view is usecase-beta: ' + mermaid.primary.split('\n')[0])
  if (!mermaid.warnings.some((warning) => warning.includes('UML_RENDER_APPROXIMATE_VIEW'))) throw new Error('an approximate view must say so')
  // Mermaid draws it; reading it back is a later slice, and the refusal says which.
  let refusal
  try { parseUml(mermaid.primary, 'mermaid') } catch (error) { refusal = error }
  if (!(refusal instanceof UmlError) || refusal.code !== 'UML_VIEW_UNREPRESENTABLE') throw new Error('mermaid parse refusal: ' + String(refusal))
})

test('use case: the review reports what a reader would get wrong', () => {
  const findings = codes(reviewUml({ diagram: useCaseDiagram }))
  if (!findings.includes('UML039_USE_CASE_UNDOCUMENTED')) throw new Error('an unlabelled use case must be reported: ' + JSON.stringify(findings))
  const broken = codes(reviewUml({
    diagramKind: 'use-case',
    model: {
      schemaVersion: 1,
      actors: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      useCases: [{ id: 'U', label: 'Do it' }],
      relations: [
        { from: 'A', to: 'B', kind: 'association' },
        { from: 'A', to: 'U', kind: 'include' },
        { from: 'U', to: 'U', kind: 'extend' },
      ],
    },
  }))
  for (const expected of ['UML032_ISOLATED_ACTOR', 'UML036_ACTOR_TO_ACTOR_ASSOCIATION', 'UML037_ACTOR_INCLUDE_EXTEND', 'UML038_SELF_RELATION']) {
    if (!broken.includes(expected)) throw new Error(expected + ' missing from ' + JSON.stringify(broken))
  }
})

test('use case: a model the diagram does not carry fails the fidelity check', () => {
  const report = reviewUml({
    diagram: useCaseDiagram,
    model: { schemaVersion: 1, actors: [{ id: 'Customer' }], useCases: [{ id: 'Check out' }, { id: 'Refund' }], relations: [{ from: 'Customer', to: 'Check out', kind: 'association' }] },
  })
  if (report.verdict !== 'fail') throw new Error('verdict: ' + report.verdict)
  if (!codes(report).includes('UML017_ROUND_TRIP_MISMATCH')) throw new Error('codes: ' + JSON.stringify(codes(report)))
  if (report.roundTrip === null || report.roundTrip.ok) throw new Error('the round trip must report the difference')
})

test('use case: the engine refuses a cell no notation has', () => {
  let refusal
  try { renderUml({ schemaVersion: 1, actors: [{ id: 'A' }], useCases: [], relations: [] }, 'plantuml', 'communication') } catch (error) { refusal = error }
  if (!(refusal instanceof UmlError) || refusal.code !== 'UML_VIEW_UNREPRESENTABLE') throw new Error('communication render refusal: ' + String(refusal))
  if (!refusal.message.includes('numbered message labels')) throw new Error('the refusal must say why: ' + refusal.message)
})

// ------------------------------------------------------- the timing family --

// A timing diagram is an interaction against a clock. The model deliberately carries no
// end time on a segment: the notation has no way to say "this state ends here", and a
// field the diagram cannot express is a field the round trip loses - which is what it did
// before the field was removed.
const timingModel = {
  schemaVersion: 1,
  unit: 'ms',
  lifelines: [
    { id: 'WB', label: 'Browser', kind: 'robust' },
    { id: 'WU', label: 'User', kind: 'concise' },
    { id: 'CLK', label: 'Clock', kind: 'clock', period: 10 },
  ],
  states: [{ id: 'Idle' }, { id: 'Waiting', label: 'waiting for a URL' }],
  segments: [
    { lifeline: 'WB', state: 'Idle', from: 0, atStart: true },
    { lifeline: 'WU', state: 'Idle', from: 0, atStart: true },
    { lifeline: 'WU', state: 'Waiting', from: 100 },
  ],
  messages: [{ from: 'WU', to: 'WB', time: 100, label: 'URL' }],
  constraints: [{ fromTime: 100, toTime: 250, label: '{150 ms}' }],
}

function timingModelOf(text) {
  const parsed = parseUml(text)
  if (parsed.family !== 'timing') throw new Error('family: ' + String(parsed.family))
  return parsed
}

test('timing: a model renders, reads back structure-for-structure and re-renders verbatim', () => {
  const rendered = renderUml(timingModel, 'plantuml', 'timing')
  for (const needle of ['@startuml', "'dsh-model-everything:uml v1 notation=plantuml family=timing", 'robust "Browser" as WB', 'clock "Clock" as CLK with period 10', 'WB at 0 is Idle', 'WU at 0 is Idle', 'WU is "waiting for a URL"', 'WU -> WB @100 : URL', '@100 <-> @250 : {150 ms}', '@enduml']) {
    if (!rendered.primary.includes(needle)) throw new Error('missing ' + needle + '\n' + rendered.primary)
  }
  // The segment model has no `to`, so the round trip is an equality of the whole model.
  const back = parseUml(rendered.primary)
  if (JSON.stringify(back.model) !== JSON.stringify(timingModel)) {
    throw new Error('round trip changed the model:\n' + JSON.stringify(back.model))
  }
  if (renderUml(back.model, 'plantuml', 'timing').primary !== rendered.primary) {
    throw new Error('rendering the parsed model is not the same diagram')
  }
})

test('timing: a state change the diagram cannot name is carried by a directive, not invented', () => {
  // The label is what the diagram draws; the id is what the model means. Only the
  // directive says which is which, and with it the parse must return the id.
  const rendered = renderUml(timingModel, 'plantuml', 'timing')
  if (!rendered.primary.includes("'dsh-model-everything:timingState Waiting = \"waiting for a URL\"")) {
    throw new Error('the label directive is missing\n' + rendered.primary)
  }
  const back = parseUml(rendered.primary)
  const waiting = back.model.states.find((state) => state.id === 'Waiting')
  if (waiting === undefined || waiting.label !== 'waiting for a URL') throw new Error('states: ' + JSON.stringify(back.model.states))
  // Hand-written text with no directive: the drawn name is the id.
  const hand = timingModelOf(['@startuml', 'concise "User" as WU', '@0', 'WU is Idle', '@100', 'WU is Waiting', '@enduml'].join('\n'))
  if (JSON.stringify(hand.model.states) !== JSON.stringify([{ id: 'Idle' }, { id: 'Waiting' }])) {
    throw new Error('hand-written states: ' + JSON.stringify(hand.model.states))
  }
  if (hand.model.segments[0].to !== undefined) throw new Error('a segment must not carry an end time')
})

test('timing: what the notation can say, the parser carries', () => {
  const kinds = timingModelOf([
    '@startuml',
    'clock   "Clock_0"   as C0 with period 50',
    'clock   "Clock_1"   as C1 with period 50 pulse 15 offset 10',
    'binary  "Binary"  as B',
    'concise "Concise" as C',
    'rectangle "Rectangle" as Re',
    'robust  "Robust"  as R',
    'analog  "Analog"  as A',
    '@0',
    'C is Idle',
    'R is Idle',
    'Re is Idle',
    'A is 0',
    '@100',
    'B is high',
    'C is Waiting',
    'Re is Waiting',
    'R is Processing',
    'A is 3',
    '@300',
    'R is Waiting',
    'A is 1',
    '@enduml',
  ].join('\n'))
  const kindsById = kinds.model.lifelines.map((lifeline) => lifeline.id + ':' + String(lifeline.kind) + (lifeline.period === undefined ? '' : '@' + String(lifeline.period)))
  for (const expected of ['C0:clock@50', 'C1:clock@50', 'B:binary', 'C:concise', 'Re:rectangle', 'R:robust', 'A:analog']) {
    if (!kindsById.includes(expected)) throw new Error('missing ' + expected + ' in ' + JSON.stringify(kindsById))
  }
  // `pulse` and `offset` are drawing details: named as discarded, not silently dropped.
  if (!kinds.discardedConstructs.some((entry) => entry.text.includes('pulse 15'))) {
    throw new Error('the pulse/offset declaration must be reported: ' + JSON.stringify(kinds.discardedConstructs))
  }
})

test('timing: relative times resolve against the marker before them', () => {
  const parsed = timingModelOf([
    '@startuml',
    'robust "DNS Resolver" as DNS',
    'robust "Web Browser" as WB',
    'concise "Web User" as WU',
    '@0',
    'WU is Idle',
    'WB is Idle',
    'DNS is Idle',
    '@+100',
    'WU -> WB : URL',
    'WU is Waiting',
    'WB is Processing',
    '@+200',
    'WB is Waiting',
    '@+100',
    'DNS is Processing',
    '@enduml',
  ].join('\n'))
  const times = parsed.model.segments.map((segment) => segment.lifeline + '@' + String(segment.from))
  for (const expected of ['WU@0', 'WU@100', 'WB@100', 'WB@300', 'DNS@400']) {
    if (!times.includes(expected)) throw new Error('missing ' + expected + ' in ' + JSON.stringify(times))
  }
  const message = parsed.model.messages[0]
  if (message.time !== 100) throw new Error('the message time: ' + JSON.stringify(message))
})

test('timing: a clock-relative message keeps its own moment', () => {
  // The state change lands at 100; the message is sent at 150. Reading the first number
  // on the line would put both at 100 - and on `WB -> DNS@+50` it would read the `B`.
  const parsed = timingModelOf([
    '@startuml',
    'robust "DNS" as DNS',
    'concise "Web User" as WU',
    '@0',
    'WU is Idle',
    '@100',
    'WU is Waiting',
    'WU -> DNS@+50 : Resolve',
    '@enduml',
  ].join('\n'))
  const message = parsed.model.messages[0]
  if (message.time !== 150) throw new Error('message time: ' + JSON.stringify(message))
})

test('timing: quoted state names survive, including one that contains a hash', () => {
  // `S1 is {0,1} #SlateGrey` is an indeterminate value with a colour, and `is "{1}#Gold"`
  // is a state whose name contains the colour separator. Stripping at the hash would
  // rename the state and truncate the time axis.
  const parsed = timingModelOf([
    '@startuml',
    'robust "Signal1" as S1',
    'robust "Signal2" as S2',
    'S1 has 0,1,2,hello',
    'S2 has 0,1,2',
    '@0',
    'S1 is 0',
    'S2 is 0',
    '@100',
    'S1 is {0,1} #SlateGrey',
    'S2 is {0,1}',
    '@300',
    'S1 is hello',
    'S2 is {0,2}',
    '@enduml',
  ].join('\n'))
  const stateIds = parsed.model.states.map((state) => state.id)
  for (const expected of ['0', '{0,1}', 'hello', '{0,2}']) {
    if (!stateIds.includes(expected)) throw new Error('missing state ' + expected + ' in ' + JSON.stringify(stateIds))
  }
  const colours = parsed.model.segments.map((segment) => String(segment.from))
  if (!colours.includes('100') || !colours.includes('300')) throw new Error('times: ' + JSON.stringify(colours))
  // `has` is a drawing order for one lifeline: named as discarded, never read as a change.
  const hasLines = parsed.discardedConstructs.filter((entry) => entry.construct === 'has')
  if (hasLines.length !== 2) throw new Error('the has declarations must be reported: ' + JSON.stringify(parsed.discardedConstructs))
  const back = parseUml(renderUml(parsed.model, 'plantuml', 'timing').primary)
  if (JSON.stringify(back.model) !== JSON.stringify(parsed.model)) throw new Error('the re-render changed the model')
})

test('timing: negative times are legal, and a state note is not part of the name', () => {
  const parsed = timingModelOf([
    '@startuml',
    'binary "Binary Serial Data" as D',
    'robust "Robust" as R',
    '@-3',
    'D is low: idle',
    'R is lo: idle',
    '@-1',
    'D is high: start',
    'R is hi: start',
    '@0',
    'D is low: 1 lsb',
    'R is lo: 1 lsb',
    '@0 <-> @8 : Serial data bits',
    '@enduml',
  ].join('\n'))
  const lows = parsed.model.segments.filter((segment) => segment.lifeline === 'D').map((segment) => segment.from)
  if (!lows.includes(-3) || !lows.includes(-1) || !lows.includes(0)) {
    throw new Error('a negative time must survive: ' + JSON.stringify(lows))
  }
  const stateIds = parsed.model.states.map((state) => state.id)
  if (!stateIds.includes('low') || stateIds.some((id) => id.includes(':'))) {
    throw new Error('the comment must not join the state name: ' + JSON.stringify(stateIds))
  }
  if (parsed.model.constraints[0].toTime !== 8) throw new Error('constraint: ' + JSON.stringify(parsed.model.constraints))
})

test('timing: constructs the model does not carry are named, never invented', () => {
  const parsed = timingModelOf([
    '@startuml',
    'clock clk with period 1',
    'binary "enable" as EN',
    'concise "dataBus" as db',
    '@0 as :start',
    '@5 as :en_high',
    '@:start',
    'EN is low',
    'db is "0x0000"',
    '@:en_high',
    'EN is high',
    'highlight 0 to 5 : window',
    'note top of EN : a note',
    '@enduml',
  ].join('\n'))
  const constructs = parsed.discardedConstructs.map((entry) => entry.construct)
  for (const expected of ['highlight', 'note']) {
    if (!constructs.includes(expected)) throw new Error('missing the ' + expected + ' declaration in ' + JSON.stringify(constructs))
  }
  // The anchor lines are not states: an unread line is still reported, never dropped.
  if (!constructs.includes('unread line')) throw new Error('anchor lines must be reported: ' + JSON.stringify(constructs))
  // `@WB` opens a participant block: nobody addresses it, so it is an unread line, and
  // the block's per-lifeline times do not become the diagram's axis.
  const blocked = timingModelOf(['@startuml', 'concise "Web User" as WU', '@WU', '0 is Waiting', '+500 is ok', '@enduml'].join('\n'))
  const blockedConstructs = blocked.discardedConstructs.map((entry) => entry.construct)
  if (!blockedConstructs.includes('unread line')) throw new Error('a participant block must be reported: ' + JSON.stringify(blocked.discardedConstructs))
  // A quoted numeric state is the state's name, not a time.
  const bus = parsed.model.segments.find((segment) => segment.state === '0x0000')
  if (bus === undefined) throw new Error('quoted state lost: ' + JSON.stringify(parsed.model.states))
})

test('timing: mermaid has no timing diagram, in both directions', () => {
  let onRender
  try { renderUml(timingModel, 'mermaid', 'timing') } catch (error) { onRender = error }
  if (!(onRender instanceof UmlError) || onRender.code !== 'UML_VIEW_UNREPRESENTABLE') throw new Error('render: ' + String(onRender))
  if (!onRender.message.includes('plantuml')) throw new Error('the refusal must name the notation that works: ' + onRender.message)
  let onParse
  try { parseUml('timingDiagram\n  A is Idle', 'mermaid') } catch (error) { onParse = error }
  if (!(onParse instanceof UmlError)) throw new Error('mermaid timing text must not parse: ' + String(onParse))
})

test('timing: the review reports what the diagram cannot say about itself', () => {
  const report = reviewUml({ model: timingModel, diagramKind: 'timing' })
  if (report.roundTrip === null || !report.roundTrip.ok) throw new Error('the diagram must carry its model: ' + JSON.stringify(report.roundTrip))
  if (report.verdict === 'fail') throw new Error('a well-formed timing model must not fail: ' + report.verdictReason)

  const broken = reviewUml({
    diagramKind: 'timing',
    model: {
      schemaVersion: 1,
      lifelines: [{ id: 'A' }, { id: 'B' }],
      states: [{ id: 'Idle' }, { id: 'Never' }],
      segments: [
        { lifeline: 'A', state: 'Idle', from: 100 },
        { lifeline: 'A', state: 'Never', from: 50 },
        { lifeline: 'A', state: 'Idle', from: 50 },
      ],
      messages: [],
      constraints: [{ fromTime: 20, toTime: 5 }],
    },
  })
  const codes = broken.findings.map((finding) => finding.code)
  for (const expected of ['UML043_TIMING_EMPTY_LIFELINE', 'UML044_TIMING_TIME_ORDER', 'UML045_TIMING_SIMULTANEOUS_STATES', 'UML047_TIMING_CONSTRAINT_RANGE']) {
    if (!codes.includes(expected)) throw new Error(expected + ' missing from ' + JSON.stringify(codes))
  }
  if (broken.verdict !== 'fail') throw new Error('a diagram that contradicts itself must fail')
})

test('timing: an undeclared target is carried as undeclared and reported', () => {
  const text = ['@startuml', 'concise "User" as WU', '@0', 'WU is Idle', '@100', 'WU -> GHOST : ping', '@enduml'].join('\n')
  const parsed = timingModelOf(text)
  if (parsed.model.undeclared === undefined || !parsed.model.undeclared.includes('GHOST')) {
    throw new Error('undeclared: ' + JSON.stringify(parsed.model.undeclared))
  }
  if (!codes(reviewUml({ diagram: text })).includes('UML046_TIMING_UNDECLARED_REFERENCE')) {
    throw new Error('the review must report the undeclared target')
  }
})

test('timing: a model the notation cannot draw is refused, not drawn wrong', () => {
  let refusal
  try {
    renderUml({ ...timingModel, lifelines: [], states: [], segments: [], messages: [], constraints: [], schemaVersion: 2 }, 'plantuml', 'timing')
  } catch (error) { refusal = error }
  if (!(refusal instanceof UmlError) || refusal.code !== 'UML_INPUT') throw new Error('schemaVersion 2: ' + String(refusal))
  let badKind
  try {
    renderUml({ ...timingModel, lifelines: [{ id: 'X', kind: 'wobbly' }] }, 'plantuml', 'timing')
  } catch (error) { badKind = error }
  if (!(badKind instanceof UmlError) || badKind.code !== 'UML_INPUT') throw new Error('unknown kind: ' + String(badKind))
  // A segment that names a state the model does not declare would render a state the
  // reader never agreed to.
  let dangling
  try {
    renderUml({ ...timingModel, segments: [{ lifeline: 'WU', state: 'Ghost', from: 0 }] }, 'plantuml', 'timing')
  } catch (error) { dangling = error }
  if (!(dangling instanceof UmlError) || dangling.code !== 'UML_INPUT') throw new Error('dangling state: ' + String(dangling))
})

// ------------------------------------------------ timing: white box, in the small --

// The checks above drive the public entry points. These drive the module's own contract:
// every finding code the family can emit has one case here that produces it and nothing
// else, and every refusal the validator makes is asserted where it is made rather than
// through a render that happens to fail.
const timingFindingCases = [
  ['UML042_TIMING_NO_LIFELINES', { lifelines: [], states: [], segments: [], messages: [], constraints: [] }],
  ['UML043_TIMING_EMPTY_LIFELINE', { lifelines: [{ id: 'A' }, { id: 'B' }], states: [{ id: 'Idle' }], segments: [{ lifeline: 'A', state: 'Idle', from: 0 }], messages: [], constraints: [] }],
  ['UML044_TIMING_TIME_ORDER', { lifelines: [{ id: 'A' }], states: [{ id: 'Idle' }], segments: [{ lifeline: 'A', state: 'Idle', from: 100 }, { lifeline: 'A', state: 'Idle', from: 50 }], messages: [], constraints: [] }],
  ['UML045_TIMING_SIMULTANEOUS_STATES', { lifelines: [{ id: 'A' }], states: [{ id: 'Idle' }, { id: 'Busy' }], segments: [{ lifeline: 'A', state: 'Idle', from: 0 }, { lifeline: 'A', state: 'Busy', from: 0 }], messages: [], constraints: [] }],
  ['UML046_TIMING_UNDECLARED_REFERENCE', { lifelines: [{ id: 'A' }], states: [{ id: 'Idle' }], segments: [{ lifeline: 'A', state: 'Idle', from: 0 }], messages: [], constraints: [], undeclared: ['GHOST'] }],
  ['UML047_TIMING_CONSTRAINT_RANGE', { lifelines: [{ id: 'A' }], states: [{ id: 'Idle' }], segments: [{ lifeline: 'A', state: 'Idle', from: 0 }], messages: [], constraints: [{ fromTime: 20, toTime: 5 }] }],
  ['UML048_TIMING_STATE_UNUSED', { lifelines: [{ id: 'A' }], states: [{ id: 'Idle' }, { id: 'Never' }], segments: [{ lifeline: 'A', state: 'Idle', from: 0 }], messages: [], constraints: [] }],
  ['UML049_TIMING_UNDOCUMENTED', { lifelines: [{ id: 'A' }], states: [{ id: 'Idle' }], segments: [{ lifeline: 'A', state: 'Idle', from: 0 }], messages: [], constraints: [] }],
]

for (const [code, model] of timingFindingCases) {
  test('timing white box: ' + code + ' is produced by its own case', () => {
    const findings = reviewTimingModel({ schemaVersion: 1, ...model }, {})
    const produced = findings.map((finding) => finding.code)
    if (!produced.includes(code)) throw new Error('missing ' + code + ' in ' + JSON.stringify(produced))
    // The case is about one defect. UML049 sits beside anything (an id with no label is
    // not a defect of the diagram), so it is allowed; nothing else may appear, or the
    // case does not show which input produces which code.
    const others = findings
      .filter((finding) => finding.code !== code && finding.code !== 'UML049_TIMING_UNDOCUMENTED')
      .map((finding) => finding.code)
    if (others.length > 0) throw new Error(code + ' also reported ' + JSON.stringify(others))
  })
}

test('timing white box: every code the family declares is covered by a case', () => {
  const covered = new Set(timingFindingCases.map(([code]) => code))
  const missing = TIMING_FINDING_CODES.filter((code) => !covered.has(code))
  if (missing.length > 0) throw new Error('codes with no case: ' + missing.join(', '))
  const unknown = [...covered].filter((code) => !TIMING_FINDING_CODES.includes(code))
  if (unknown.length > 0) throw new Error('cases for codes the family does not declare: ' + unknown.join(', '))
})

test('timing white box: the validator normalizes, and refuses by field', () => {
  // Normalization keeps only the declared shape: an unknown key never travels on.
  const normalized = validateTimingModel({ schemaVersion: 1, lifelines: [{ id: 'A', label: 'A' }], states: [{ id: 'Idle' }], segments: [{ lifeline: 'A', state: 'Idle', from: 0, to: 99 }], messages: [], constraints: [] })
  if ('to' in normalized.segments[0]) throw new Error('a segment end must not survive normalization: ' + JSON.stringify(normalized.segments[0]))
  if (!normalized.segments[0].atStart === undefined) throw new Error('atStart must be absent when it was absent')

  const refusals = [
    ['must be an object with schemaVersion 1', 'x'],
    ['must declare schemaVersion 1', { schemaVersion: 2, lifelines: [], states: [], segments: [], messages: [], constraints: [] }],
    ['every lifeline needs a non-empty string id', { schemaVersion: 1, lifelines: [{ id: '' }], states: [], segments: [], messages: [], constraints: [] }],
    ['duplicate lifeline id', { schemaVersion: 1, lifelines: [{ id: 'A' }, { id: 'A' }], states: [], segments: [], messages: [], constraints: [] }],
    ['period must be a positive number', { schemaVersion: 1, lifelines: [{ id: 'A', period: 0 }], states: [], segments: [], messages: [], constraints: [] }],
    ['duplicate state id', { schemaVersion: 1, lifelines: [], states: [{ id: 'S' }, { id: 'S' }], segments: [], messages: [], constraints: [] }],
    ['every segment needs the lifeline it belongs to', { schemaVersion: 1, lifelines: [{ id: 'A' }], states: [{ id: 'S' }], segments: [{ lifeline: '', state: 'S', from: 0 }], messages: [], constraints: [] }],
    ['`from` must be a number', { schemaVersion: 1, lifelines: [{ id: 'A' }], states: [{ id: 'S' }], segments: [{ lifeline: 'A', state: 'S', from: 'x' }], messages: [], constraints: [] }],
    ['names a lifeline the model does not declare', { schemaVersion: 1, lifelines: [{ id: 'A' }], states: [{ id: 'S' }], segments: [{ lifeline: 'B', state: 'S', from: 0 }], messages: [], constraints: [] }],
    ['which the model does not declare', { schemaVersion: 1, lifelines: [{ id: 'A' }], states: [{ id: 'S' }], segments: [{ lifeline: 'A', state: 'T', from: 0 }], messages: [], constraints: [] }],
    ['`time` must be a number', { schemaVersion: 1, lifelines: [{ id: 'A' }], states: [], segments: [], messages: [{ from: 'A', to: 'A', time: 'x' }], constraints: [] }],
    ['numeric `fromTime` and `toTime`', { schemaVersion: 1, lifelines: [{ id: 'A' }], states: [], segments: [], messages: [], constraints: [{ fromTime: 1 }] }],
    ['`unit` must be a non-empty string', { schemaVersion: 1, unit: '', lifelines: [], states: [], segments: [], messages: [], constraints: [] }],
  ]
  for (const [needle, input] of refusals) {
    let refusal
    try { validateTimingModel(input) } catch (error) { refusal = error }
    if (!(refusal instanceof UmlError) || refusal.code !== 'UML_INPUT') throw new Error(needle + ': not an UML_INPUT refusal: ' + String(refusal))
    if (!refusal.message.includes(needle)) throw new Error('refusal for "' + needle + '" said: ' + refusal.message)
  }
})

test('timing white box: the renderer sorts the axis and says that it did', () => {
  // Out of order in time: the renderer must still write a non-decreasing axis, because
  // that is the only order PlantUML reads, and it must say that it sorted.
  const sorted = renderUml({
    schemaVersion: 1,
    lifelines: [{ id: 'A' }, { id: 'B' }],
    states: [{ id: 'One' }, { id: 'Two' }, { id: 'Three' }],
    segments: [
      { lifeline: 'B', state: 'Two', from: 200 },
      { lifeline: 'A', state: 'One', from: 0, atStart: true },
      { lifeline: 'A', state: 'Three', from: 300 },
    ],
    messages: [],
    constraints: [],
  }, 'plantuml', 'timing')
  const markers = sorted.primary.split('\n').filter((line) => /(?:^|\s)@\d+$/.test(line))
  if (markers.length === 0) throw new Error('no time markers:\n' + sorted.primary)
  if (!sorted.warnings.some((warning) => warning.includes('UML_RENDER_TIME_ORDER'))) {
    throw new Error('a reordered model must be reported: ' + JSON.stringify(sorted.warnings))
  }
  // Rendering the same model twice is the same text.
  const again = renderUml({
    schemaVersion: 1,
    lifelines: [{ id: 'A' }, { id: 'B' }],
    states: [{ id: 'One' }, { id: 'Two' }, { id: 'Three' }],
    segments: [
      { lifeline: 'B', state: 'Two', from: 200 },
      { lifeline: 'A', state: 'One', from: 0, atStart: true },
      { lifeline: 'A', state: 'Three', from: 300 },
    ],
    messages: [],
    constraints: [],
  }, 'plantuml', 'timing')
  if (again.primary !== sorted.primary) throw new Error('rendering is not deterministic')
})

test('timing white box: a lifeline whose first change is late is drawn, and said so', () => {
  // The axis origin is the earliest moment in the model (here 0, from lifeline A). A
  // lifeline that only appears at 100 is drawn from the origin whatever the model says,
  // so the renderer reports the stretch nobody declared.
  const rendered = renderUml({
    schemaVersion: 1,
    lifelines: [{ id: 'A' }, { id: 'Late' }],
    states: [{ id: 'Idle' }],
    segments: [
      { lifeline: 'A', state: 'Idle', from: 0, atStart: true },
      { lifeline: 'Late', state: 'Idle', from: 100 },
    ],
    messages: [],
    constraints: [],
  }, 'plantuml', 'timing')
  if (!rendered.warnings.some((warning) => warning.includes('UML_RENDER_IMPLICIT_START'))) {
    throw new Error('the implicit start must be reported: ' + JSON.stringify(rendered.warnings))
  }
  const back = parseUml(rendered.primary)
  const late = back.model.segments.find((segment) => segment.lifeline === 'Late')
  if (late === undefined || late.atStart !== true) throw new Error('the parser and the renderer must agree: ' + JSON.stringify(late))
  // A model that says it on purpose is not warned about.
  const declared = renderUml({
    schemaVersion: 1,
    lifelines: [{ id: 'A' }, { id: 'Late' }],
    states: [{ id: 'Idle' }],
    segments: [
      { lifeline: 'A', state: 'Idle', from: 0, atStart: true },
      { lifeline: 'Late', state: 'Idle', from: 100, atStart: true },
    ],
    messages: [],
    constraints: [],
  }, 'plantuml', 'timing')
  if (declared.warnings.some((warning) => warning.includes('UML_RENDER_IMPLICIT_START'))) {
    throw new Error('atStart is the declaration: ' + JSON.stringify(declared.warnings))
  }
})

test('timing white box: a parse names a state it cannot resolve, and names the marker it lacks', () => {
  // A state change before any marker: it lands at 0, and the report says why.
  const parsed = parseUml(['@startuml', 'concise "User" as WU', 'WU is Idle', '@enduml'].join('\n'))
  if (!parsed.warnings.some((warning) => warning.includes('UML_PARSE_STATE_WITHOUT_TIME'))) {
    throw new Error('a state before any marker must be reported: ' + JSON.stringify(parsed.warnings))
  }
  if (parsed.model.segments[0].from !== 0 || parsed.model.segments[0].atStart !== true) {
    throw new Error('it lands at the origin: ' + JSON.stringify(parsed.model.segments[0]))
  }
  // A message before any marker gets the same treatment rather than an invented time.
  const early = parseUml(['@startuml', 'concise "User" as WU', 'concise "Web" as WB', 'WU -> WB : ping', '@enduml'].join('\n'))
  if (!early.warnings.some((warning) => warning.includes('UML_PARSE_MESSAGE_WITHOUT_TIME'))) {
    throw new Error('a message before any marker must be reported: ' + JSON.stringify(early.warnings))
  }
  // A decreasing marker is a warning, not silence: the axis is what it is.
  const backwards = parseUml(['@startuml', 'concise "User" as WU', '@100', 'WU is Waiting', '@50', 'WU is Idle', '@enduml'].join('\n'))
  if (!backwards.warnings.some((warning) => warning.includes('UML_PARSE_TIME_ORDER'))) {
    throw new Error('a backwards marker must be reported: ' + JSON.stringify(backwards.warnings))
  }
  // A lifeline declared twice keeps the first declaration and says so.
  const twice = parseUml(['@startuml', 'concise "User" as WU', 'robust "Other" as WU', '@0', 'WU is Idle', '@enduml'].join('\n'))
  if (!twice.warnings.some((warning) => warning.includes('UML_PARSE_DUPLICATE_LIFELINE'))) {
    throw new Error('a duplicate lifeline must be reported: ' + JSON.stringify(twice.warnings))
  }
  if (twice.model.lifelines[0].kind !== 'concise') throw new Error('the first declaration wins: ' + JSON.stringify(twice.model.lifelines))
})

if (failures > 0) { console.log('uml tests failed:', failures); process.exit(1) }
console.log('all uml tests passed')

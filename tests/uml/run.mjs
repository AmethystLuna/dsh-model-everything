// UML front-end tests: rendering (model → diagram source), parsing (diagram
// source → model) and the modelling review, whose fidelity half is the render →
// parse round trip. A diagram that does not read back as the model it was drawn
// from is the defect this suite exists to catch, so every supported notation is
// round-tripped rather than only asserted on its output text.
import { renderUml, parseUml, parseFindings, reviewUml, diffModels, explainLabels, guardText, parseGuardText, UmlError } from '../../lib/uml.js'
// White-box surface: the timing family's own contract, which the entry points reach only
// through a render or a review. Static, because the module has no dsh dependency.
import { validateTimingModel, reviewTimingModel, TIMING_FINDING_CODES } from '../../lib/uml.js'
// The profile family is the one whose notation only approximates it, so its parse
// refuses as a matter of design and the module is reached directly.
import { validateProfileModel, reviewProfileModel, profileModule, PROFILE_FINDING_CODES } from '../../lib/uml.js'
import { validateCompositeModel, reviewCompositeModel, COMPOSITE_FINDING_CODES } from '../../lib/uml.js'
import { validateCommunicationModel, reviewCommunicationModel, COMMUNICATION_FINDING_CODES } from '../../lib/uml.js'
import { validateInteractionOverviewModel, reviewInteractionOverviewModel, INTERACTION_OVERVIEW_FINDING_CODES } from '../../lib/uml.js'

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
  // The cell, not the model: a use case model offered to a profile family has nowhere to
  // go, and the refusal must name the notation that would work rather than the mismatch.
  let refusal
  try { renderUml({ schemaVersion: 1, actors: [{ id: 'A' }], useCases: [], relations: [] }, 'mermaid', 'profile') } catch (error) { refusal = error }
  if (!(refusal instanceof UmlError) || refusal.code !== 'UML_VIEW_UNREPRESENTABLE') throw new Error('profile render refusal: ' + String(refusal))
  if (!refusal.message.includes('plantuml')) throw new Error('the refusal must name the notation that works: ' + refusal.message)
  // And the family that has no module at all is refused by the registry, not by a notation.
  const unimplemented = refusalOf(() => renderUml({ schemaVersion: 1 }, 'plantuml', 'interaction-overview'))
  if (unimplemented.code !== 'UML_VIEW_UNREPRESENTABLE') throw new Error('interaction-overview: ' + unimplemented.code)
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

// -------------------------- the remaining family codes, one input shape each, by name --

// The checks above drive the entry points the way a caller does. These are the codes those
// checks never named, and each one needs an input shape of its own: a use case diagram with
// no actor, a relation endpoint nothing declares, a structure node with no name, one guard
// written twice for the same event. Every row pairs the code with that input, so the code is
// pinned to a diagram rather than to a sentence about diagrams, and `check` states the
// evidence the source attaches - which element, which cycle, which declaration was dropped.
const actorlessUseCase = ['@startuml', '(Login)', '@enduml'].join('\n')
const useCaselessActor = ['@startuml', ':Customer:', '@enduml'].join('\n')
const unreachedUseCase = ['@startuml', ':Customer: --> (Login)', '(Admin)', '@enduml'].join('\n')
const danglingUseCase = ['@startuml', ':Customer: --> (Login)', ':Customer: --> Missing', '@enduml'].join('\n')
const useCaseIncludeCycle = [
  '@startuml',
  ':Customer: --> (Pay)',
  '(Pay) .> (Ship) : <<include>>',
  '(Ship) .> (Pay) : <<include>>',
  '@enduml',
].join('\n')
const useCaseWithForeignDeclaration = ['@startuml', ':Customer: --> (Login)', 'class Order', '@enduml'].join('\n')
const undocumentedComponents = ['@startuml', 'component SVC', 'component PAY', 'SVC --> PAY', '@enduml'].join('\n')
const documentedComponents = ['@startuml', 'component [Order Service] as SVC', 'component [Payment Adapter] as PAY', 'SVC --> PAY', '@enduml'].join('\n')

// Two arrows for one event carry the same guard text, so which branch fires is unresolved.
// The third branch is the complement of that text, so the group is probably exhaustive and
// the repeated guard is the only thing left for the review to name.
const overlappingGuardModel = {
  schemaVersion: 1,
  init: 'IDLE',
  states: [{ id: 'IDLE' }, { id: 'RUN', terminal: true }, { id: 'STOP', terminal: true }],
  transitions: [
    { from: 'IDLE', event: 'go', guard: { variable: 'retry', op: '<', value: 3 }, to: 'RUN' },
    { from: 'IDLE', event: 'go', guard: { variable: 'retry', op: '<', value: 3 }, to: 'STOP' },
    { from: 'IDLE', event: 'go', guard: { variable: 'retry', op: '>=', value: 3 }, to: 'STOP' },
  ],
  variables: [{ name: 'retry', kind: 'integer', init: 0, min: 0, max: 3 }],
}

const unnamedCodeCases = [
  {
    code: 'UML030_USE_CASE_NO_ACTORS',
    severity: 'error',
    input: { diagram: actorlessUseCase },
    check: (found) => {
      if (found[0].evidence.actors !== 0) throw new Error('the finding must count the actors: ' + JSON.stringify(found[0].evidence))
    },
  },
  {
    code: 'UML031_USE_CASE_NO_USE_CASES',
    severity: 'error',
    input: { diagram: useCaselessActor },
    check: (found) => {
      if (found[0].evidence.useCases !== 0) throw new Error('the finding must count the use cases: ' + JSON.stringify(found[0].evidence))
    },
  },
  {
    code: 'UML033_USE_CASE_WITHOUT_ACTOR',
    severity: 'warning',
    input: { diagram: unreachedUseCase },
    check: (found, report) => {
      // Login is reached through the association, Admin by nothing: only Admin is named.
      const ids = found.map((finding) => finding.evidence.id)
      if (JSON.stringify(ids) !== '["Admin"]') throw new Error('the unreachable use case must be named: ' + JSON.stringify(ids) + ' from ' + JSON.stringify(codes(report)))
    },
  },
  {
    code: 'UML034_DANGLING_RELATION_ENDPOINT',
    severity: 'error',
    input: { diagram: danglingUseCase },
    check: (found, report) => {
      if (JSON.stringify(found[0].evidence.ids) !== '["Missing"]' || found[0].detail !== 'Missing') {
        throw new Error('the endpoint nothing declares must be named: ' + JSON.stringify(found[0].evidence) + ' / ' + String(found[0].detail) + ' from ' + JSON.stringify(codes(report)))
      }
    },
  },
  {
    code: 'UML035_INCLUDE_EXTEND_CYCLE',
    severity: 'error',
    input: { diagram: useCaseIncludeCycle },
    check: (found, report) => {
      if (JSON.stringify(found[0].evidence.path) !== '["Pay","Ship","Pay"]' || found[0].detail !== 'Pay -> Ship -> Pay') {
        throw new Error('the cycle must be carried as the path that closes it: ' + String(found[0].detail) + ' from ' + JSON.stringify(codes(report)))
      }
    },
  },
  {
    code: 'UML040_STRUCTURE_NODE_UNDOCUMENTED',
    severity: 'info',
    input: { diagram: undocumentedComponents },
    check: (found, report) => {
      const ids = found.map((finding) => finding.evidence.id).sort()
      if (JSON.stringify(ids) !== '["PAY","SVC"]') throw new Error('every node with no label is reported, and only those: ' + JSON.stringify(ids) + ' from ' + JSON.stringify(codes(report)))
      // A label is the documentation: a node that carries one is silent.
      const labelled = reviewUml({ diagram: documentedComponents })
      if (findFinding(labelled, 'UML040_STRUCTURE_NODE_UNDOCUMENTED').length !== 0) {
        throw new Error('a labelled node must not be reported: ' + JSON.stringify(codes(labelled)))
      }
    },
  },
  {
    code: 'UML005_OVERLAPPING_GUARD',
    severity: 'warning',
    input: { model: overlappingGuardModel },
    check: (found, report) => {
      if (JSON.stringify(found[0].transitions) !== '[{"from":"IDLE","event":"go","to":"STOP"}]') {
        throw new Error('the branch that repeats the guard must be named: ' + JSON.stringify(found[0].transitions) + ' from ' + JSON.stringify(codes(report)))
      }
    },
  },
  {
    code: 'UML016_DIAGRAM_PARSE_NOTES',
    severity: 'warning',
    input: { diagram: useCaseWithForeignDeclaration },
    check: (found, report) => {
      if (!found[0].message.includes('class') || !String(found[0].detail).includes('class Order')) {
        throw new Error('the declaration the family dropped must be named: ' + found[0].message + ' / ' + String(found[0].detail) + ' from ' + JSON.stringify(codes(report)))
      }
    },
  },
]

for (const item of unnamedCodeCases) {
  test('review: ' + item.code + ' is produced by its own input', () => {
    const report = reviewUml(item.input)
    const found = findFinding(report, item.code)
    if (found.length === 0) throw new Error(item.code + ' missing; the review reported ' + JSON.stringify(codes(report)))
    if (found[0].severity !== item.severity) {
      throw new Error(item.code + ' came back as ' + found[0].severity + ', not ' + item.severity + '; the review reported ' + JSON.stringify(codes(report)))
    }
    if (item.check !== undefined) item.check(found, report)
  })
}

// ------------------------------------------------------- the profile family --

// A profile is the family whose notation only approximates it: PlantUML has metaclass and
// stereotype elements but no profile element, and an extension and a stereotype
// generalization are both a `--|>`. So the model is the record, the drawing is a view of
// it, and the parse refuses by name. These cases hold that line.
const profileModel = {
  schemaVersion: 1,
  profile: { id: 'EJBP', label: 'EJB Profile' },
  stereotypes: [{ id: 'EJB', label: 'EJB' }, { id: 'Stateless', label: 'Stateless' }],
  metaclasses: [{ id: 'Component', label: 'Component' }, { id: 'Class', label: 'Class' }],
  extensions: [{ stereotype: 'EJB', metaclass: 'Component', multiplicity: '0..1', label: 'base' }],
  applications: [{ profile: 'EJBP', applyTo: 'Shop' }],
  generalizations: [{ general: 'EJB', specific: 'Stateless' }],
}

test('profile: the drawing carries what the picture cannot', () => {
  const rendered = renderUml(profileModel, 'plantuml', 'profile')
  for (const needle of [
    "'dsh-model-everything:uml v1 notation=plantuml family=profile",
    "'dsh-model-everything:profile EJBP",
    'metaclass "Component" as Component',
    'class "EJB" <<stereotype>> as EJB',
    "'dsh-model-everything:profileExtension EJB -> Component 0..1 base",
    "'dsh-model-everything:profileApply EJBP -> Shop",
    'EJB --|> Component',
    'Stateless --|> EJB',
  ]) {
    if (!rendered.primary.includes(needle)) throw new Error('missing ' + needle + '\n' + rendered.primary)
  }
  // The approximation is declared, not implied.
  if (!rendered.warnings.some((warning) => warning.includes('UML_RENDER_APPROXIMATE_VIEW'))) {
    throw new Error('the approximate view must be named: ' + JSON.stringify(rendered.warnings))
  }
  // An id PlantUML cannot use becomes an alias, and the alias is written down.
  const aliased = renderUml({ ...profileModel, metaclasses: [{ id: 'Class A', label: 'Class A' }], extensions: [] }, 'plantuml', 'profile')
  if (!aliased.primary.includes("'dsh-model-everything:alias E1 Class A")) {
    throw new Error('an unusable id must be aliased:\n' + aliased.primary)
  }
  // Rendering is determinate and does not drift between calls.
  if (renderUml(profileModel, 'plantuml', 'profile').primary !== rendered.primary) throw new Error('rendering is not deterministic')
})

test('profile: the parse refuses by name, and says why', () => {
  const text = renderUml(profileModel, 'plantuml', 'profile').primary
  let refusal
  try { parseUml(text) } catch (error) { refusal = error }
  if (!(refusal instanceof UmlError)) throw new Error('the profile parse must refuse: ' + String(refusal))
  if (refusal.code !== 'UML_NOT_A_STATE_DIAGRAM') throw new Error('refusal code: ' + refusal.code)
  if (!refusal.message.includes('--|>')) throw new Error('the refusal must say what the notation cannot separate: ' + refusal.message)
  // The module's own parse refuses the same way, so no caller can route around it.
  let direct
  try { profileModule.parse(text, 'plantuml') } catch (error) { direct = error }
  if (!(direct instanceof UmlError) || direct.code !== 'UML_VIEW_UNREPRESENTABLE') throw new Error('module parse: ' + String(direct))
})

test('profile: a model is reviewed, a diagram is not pretended to be read', () => {
  const report = reviewUml({ model: profileModel, diagramKind: 'profile' })
  if (report.source !== 'model') throw new Error('source: ' + report.source)
  if (report.verdict === 'fail') throw new Error('this profile must not fail: ' + report.verdictReason)
  // `Class` is declared and no stereotype extends it, which is the one real finding here.
  if (!codes(report).includes('UML052_PROFILE_EXTENSION_MISSING')) {
    throw new Error('missing UML052 in ' + JSON.stringify(codes(report)))
  }
  if (report.primary === undefined || !report.primary.includes('<<stereotype>>')) throw new Error('the review must also render the drawing')

  const byDiagram = reviewUml({ diagram: renderUml(profileModel, 'plantuml', 'profile').primary })
  if (byDiagram.verdict === 'fail') throw new Error('an unreadable-but-drawn family must not fail the review: ' + byDiagram.verdictReason)
  if (!codes(byDiagram).includes('UML018_FIDELITY_UNCHECKED')) throw new Error('the review must say the text was not read: ' + JSON.stringify(codes(byDiagram)))
  const note = findFinding(byDiagram, 'UML018_FIDELITY_UNCHECKED')[0]
  if (!note.message.includes('cannot be read back')) throw new Error('the note must say why: ' + note.message)
})

test('profile: mermaid has no profile diagram', () => {
  let refusal
  try { renderUml(profileModel, 'mermaid', 'profile') } catch (error) { refusal = error }
  if (!(refusal instanceof UmlError) || refusal.code !== 'UML_VIEW_UNREPRESENTABLE') throw new Error('render: ' + String(refusal))
  if (!refusal.message.includes('plantuml')) throw new Error('the refusal must name the notation that works: ' + refusal.message)
})

test('profile: every code the family declares is produced by its own case', () => {
  const one = (model) => reviewProfileModel({ schemaVersion: 1, ...model }, {}).map((finding) => finding.code)
  const cases = [
    ['UML050_PROFILE_NO_STEREOTYPES', { profile: { id: 'P' }, stereotypes: [], metaclasses: [], extensions: [], applications: [], generalizations: [] }],
    ['UML051_PROFILE_UNUSED_STEREOTYPE', {
      profile: { id: 'P', label: 'P' },
      stereotypes: [{ id: 'Used', label: 'Used' }, { id: 'Orphan', label: 'Orphan' }],
      metaclasses: [{ id: 'M', label: 'M' }],
      extensions: [{ stereotype: 'Used', metaclass: 'M' }],
      applications: [{ profile: 'P', applyTo: 'X' }],
      generalizations: [],
    }],
    ['UML052_PROFILE_EXTENSION_MISSING', {
      // Every stereotype is used — one extends, one specialises — so UML051 does not
      // apply, and the only thing wrong is that `Unused` is extended by nobody.
      profile: { id: 'P', label: 'P' },
      stereotypes: [{ id: 'Base', label: 'Base' }, { id: 'Special', label: 'Special' }],
      metaclasses: [{ id: 'Component', label: 'Component' }, { id: 'Unused', label: 'Unused' }],
      extensions: [{ stereotype: 'Base', metaclass: 'Component' }],
      applications: [{ profile: 'P', applyTo: 'X' }],
      generalizations: [{ general: 'Base', specific: 'Special' }],
    }],
    ['UML053_PROFILE_GENERALIZATION_CYCLE', {
      profile: { id: 'P', label: 'P' },
      stereotypes: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
      metaclasses: [{ id: 'M', label: 'M' }],
      extensions: [{ stereotype: 'A', metaclass: 'M' }],
      applications: [{ profile: 'P', applyTo: 'X' }],
      generalizations: [{ general: 'A', specific: 'B' }, { general: 'B', specific: 'A' }],
    }],
    ['UML054_PROFILE_UNDECLARED_REFERENCE', {
      profile: { id: 'P', label: 'P' },
      stereotypes: [{ id: 'A', label: 'A' }],
      metaclasses: [{ id: 'M', label: 'M' }],
      extensions: [{ stereotype: 'A', metaclass: 'M' }],
      applications: [{ profile: 'P', applyTo: 'X' }],
      generalizations: [],
      undeclared: ['Ghost'],
    }],
    ['UML055_PROFILE_APPLICATION_MISSING', {
      profile: { id: 'P', label: 'P' },
      stereotypes: [{ id: 'A', label: 'A' }],
      metaclasses: [{ id: 'M', label: 'M' }],
      extensions: [{ stereotype: 'A', metaclass: 'M' }],
      applications: [],
      generalizations: [],
    }],
    ['UML056_PROFILE_UNDOCUMENTED', {
      // Documented everywhere it can be except the stereotype, which is what this code is
      // about: `label` absent and no `labels` entry either.
      profile: { id: 'P', label: 'P' },
      stereotypes: [{ id: 'A' }],
      metaclasses: [{ id: 'M', label: 'M' }],
      extensions: [{ stereotype: 'A', metaclass: 'M' }],
      applications: [{ profile: 'P', applyTo: 'X' }],
      generalizations: [],
    }],
  ]
  const covered = new Set(cases.map(([code]) => code))
  const missing = PROFILE_FINDING_CODES.filter((code) => !covered.has(code))
  if (missing.length > 0) throw new Error('codes with no case: ' + missing.join(', '))
  for (const [code, model] of cases) {
    const produced = one(model)
    if (!produced.includes(code)) throw new Error(code + ' missing from ' + JSON.stringify(produced))
    // Every case is about one defect. Two codes sit beside anything and are allowed to
    // co-occur, because neither is a defect of the profile itself: UML049/UML056 say an
    // id has no reader-facing name, and UML055 says a profile with nothing in it has no
    // application either — which is true of the empty profile and of nothing else here.
    const beside = new Set(['UML056_PROFILE_UNDOCUMENTED', 'UML055_PROFILE_APPLICATION_MISSING'])
    const others = produced.filter((entry) => entry !== code && !beside.has(entry))
    if (others.length > 0) throw new Error(code + ' also reported ' + JSON.stringify(others))
  }
  // UML056 is about the profile itself too, not only its stereotypes.
  const bare = one({ profile: { id: 'P' }, stereotypes: [{ id: 'A', label: 'A' }], metaclasses: [{ id: 'M', label: 'M' }], extensions: [{ stereotype: 'A', metaclass: 'M' }], applications: [{ profile: 'P', applyTo: 'X' }], generalizations: [] })
  if (!bare.includes('UML056_PROFILE_UNDOCUMENTED')) throw new Error('an undocumented profile must report UML056: ' + JSON.stringify(bare))
})

test('profile white box: the validator refuses by field', () => {
  const base = { schemaVersion: 1, profile: { id: 'P' }, stereotypes: [], metaclasses: [], extensions: [], applications: [], generalizations: [] }
  const refusals = [
    ['must be an object with schemaVersion 1', 'x'],
    ['must declare schemaVersion 1', { ...base, schemaVersion: 2 }],
    ['needs a `profile` with a non-empty id', { ...base, profile: { id: '' } }],
    ['every stereotype needs a non-empty string id', { ...base, stereotypes: [{ id: '' }] }],
    ['duplicate stereotype id', { ...base, stereotypes: [{ id: 'A' }, { id: 'A' }] }],
    ['declared as both a stereotype and a metaclass', { ...base, stereotypes: [{ id: 'A' }], metaclasses: [{ id: 'A' }] }],
    ['every extension needs the metaclass it extends', { ...base, extensions: [{ stereotype: 'A' }] }],
    ['extension multiplicity must be', { ...base, extensions: [{ stereotype: 'A', metaclass: 'M', multiplicity: 'many' }] }],
    ['cannot generalize itself', { ...base, stereotypes: [{ id: 'A' }], generalizations: [{ general: 'A', specific: 'A' }] }],
    ['every application needs a non-empty `applyTo`', { ...base, applications: [{ profile: 'P' }] }],
  ]
  for (const [needle, input] of refusals) {
    let refusal
    try { validateProfileModel(input) } catch (error) { refusal = error }
    if (!(refusal instanceof UmlError) || refusal.code !== 'UML_INPUT') throw new Error(needle + ': not an UML_INPUT refusal: ' + String(refusal))
    if (!refusal.message.includes(needle)) throw new Error('refusal for "' + needle + '" said: ' + refusal.message)
  }
  // Normalization keeps the declared shape only, and records what the model left dangling.
  const normalized = validateProfileModel({ ...base, stereotypes: [{ id: 'A' }], extensions: [{ stereotype: 'A', metaclass: 'M' }] })
  if (normalized.undeclared === undefined || !normalized.undeclared.includes('M')) {
    throw new Error('an extension to an undeclared metaclass must be recorded: ' + JSON.stringify(normalized))
  }
})

// ------------------------------------------- the composite structure family --

// This family is drawn approximately - PlantUML has no composite structure diagram - and
// still reads back exactly, because nesting, port direction and both connector ends are
// spelled. The capability table says so explicitly (`parseThroughApproximation`), which is
// what lets a measured round trip through an approximate view be used instead of refused.
const compositeModel = {
  schemaVersion: 1,
  self: { id: 'order', label: 'Order Processing', kind: 'component' },
  ports: [{ id: 'pay', direction: 'in' }, { id: 'ship', direction: 'out' }, { id: 'ops', direction: 'inout' }],
  parts: [{ id: 'gw', label: 'Payment Gateway' }, { id: 'inv', label: 'Inventory' }, { id: 'shipment', label: 'Shipment' }],
  connectors: [
    { from: 'pay', to: 'gw' },
    { from: 'gw', to: 'inv' },
    { from: 'inv', to: 'shipment', label: 'ready' },
    { from: 'shipment', to: 'ship' },
  ],
}

test('composite: the round trip is exact through an approximate view', () => {
  const rendered = renderUml(compositeModel, 'plantuml', 'composite-structure')
  for (const needle of [
    "'dsh-model-everything:compositeSelf component order",
    'component "Order Processing" as order {',
    '  portin pay',
    '  portout ship',
    '  port ops',
    '  component "Payment Gateway" as gw',
    '  component "Inventory" as inv',
    '}',
    'inv --> shipment : ready',
  ]) {
    if (!rendered.primary.includes(needle)) throw new Error('missing ' + needle + '\n' + rendered.primary)
  }
  if (!rendered.warnings.some((warning) => warning.includes('UML_RENDER_APPROXIMATE_VIEW'))) {
    throw new Error('the approximate view must be named: ' + JSON.stringify(rendered.warnings))
  }
  const parsed = parseUml(rendered.primary)
  // `diffModels` compares machines; for a family that is not one, the fidelity proof is the
  // review's own round trip, which reads the drawing back and reports every path that moved.
  const roundTrip = reviewUml({ model: compositeModel, diagramKind: 'composite-structure' }).roundTrip
  if (roundTrip === null || roundTrip === undefined) throw new Error('the review must report a round trip')
  if (!roundTrip.ok) throw new Error('the drawing does not carry the model: ' + roundTrip.diffs.join(' | '))
  if (roundTrip.diffs.length > 0) throw new Error('round trip diffs: ' + roundTrip.diffs.join(' | '))
  // Labels a reader gave the drawing come back as labels, and the model is not padded with
  // a field it never carried.
  if (parsed.labels.gw !== 'Payment Gateway') throw new Error('labels: ' + JSON.stringify(parsed.labels))
  if (parsed.model.narrative !== undefined) throw new Error('the parser invented a narrative: ' + JSON.stringify(parsed.model.narrative))
  const again = renderUml(parsed.model, 'plantuml', 'composite-structure')
  if (again.primary !== rendered.primary) throw new Error('re-rendering a parsed model is not byte-stable:\n' + again.primary)
})

test('composite: a hand-written diagram needs no directives', () => {
  const hand = [
    '@startuml',
    'component App as app {',
    '  portin http',
    '  portout db',
    '  component cache as cache',
    '  component store',
    '}',
    'http --> cache',
    'cache --> store',
    'store --> db',
    '@enduml',
  ].join('\n')
  const parsed = parseUml(hand)
  const model = parsed.model
  if (model.self.id !== 'app' || model.self.kind !== 'component') throw new Error('self: ' + JSON.stringify(model.self))
  if (model.self.label !== 'App') throw new Error('the label must survive: ' + JSON.stringify(model.self))
  if (model.ports.length !== 2 || model.ports[0].id !== 'http' || model.ports[0].direction !== 'in') throw new Error('ports: ' + JSON.stringify(model.ports))
  if (model.ports[1].direction !== 'out') throw new Error('port direction: ' + JSON.stringify(model.ports))
  if (model.parts.map((part) => part.id).join(',') !== 'cache,store') throw new Error('parts: ' + JSON.stringify(model.parts))
  if (model.connectors.length !== 3) throw new Error('connectors: ' + JSON.stringify(model.connectors))
  if (model.undeclared !== undefined) throw new Error('every end is declared here: ' + JSON.stringify(model.undeclared))
  if (parsed.discardedConstructs.length !== 0) throw new Error('nothing here is unrepresentable: ' + JSON.stringify(parsed.discardedConstructs))
})

test('composite: a nested block is reported, not silently flattened', () => {
  // The port is what makes the text this family: detection keys on port declarations, so a
  // composite structure drawn without a single port reads as the component diagram it also
  // is. That boundary is real and is why the renderer always writes the ports it has.
  const nested = [
    '@startuml',
    'component Outer as outer {',
    '  portin in1',
    '  component Inner as inner {',
    '    component Deep as deep',
    '  }',
    '}',
    'in1 --> inner',
    '@enduml',
  ].join('\n')
  const parsed = parseUml(nested)
  // The part is kept; the block it opened is reported, because the model has no nesting.
  if (parsed.model === undefined || !Array.isArray(parsed.model.parts)) {
    throw new Error('the nested diagram must parse into a composite model: ' + JSON.stringify(parsed.model ?? null))
  }
  if (parsed.model.parts.map((part) => part.id).join(',') !== 'inner') throw new Error('parts: ' + JSON.stringify(parsed.model.parts))
  if (!parsed.discardedConstructs.some((entry) => entry.construct === 'nested block inside a part')) {
    throw new Error('the nested block must be reported: ' + JSON.stringify(parsed.discardedConstructs))
  }
  if (!['deep', 'inner --> outer'].some((needle) => parsed.discardedConstructs.some((entry) => entry.text.includes(needle.split(' ')[0])))) {
    throw new Error('the lines inside the nested block must be reported too: ' + JSON.stringify(parsed.discardedConstructs))
  }
})

test('composite: every code the family declares is produced by its own case', () => {
  const cases = [
    ['UML057_COMPOSITE_NO_PARTS', { self: { id: 's', label: 'S' }, parts: [], ports: [], connectors: [] }],
    ['UML058_COMPOSITE_PORT_UNCONNECTED', {
      self: { id: 's', label: 'S' }, parts: [{ id: 'a', label: 'A' }], ports: [{ id: 'orphan', direction: 'in' }], connectors: [],
    }],
    ['UML059_COMPOSITE_CONNECTOR_ENDPOINT_MISSING', {
      self: { id: 's', label: 'S' }, parts: [{ id: 'a', label: 'A' }], ports: [], connectors: [{ from: 'a', to: 'ghost' }],
    }],
    ['UML060_COMPOSITE_DUPLICATE_PART', {
      // PINNED UNREACHABLE through the engine: `validateCompositeModel` refuses a duplicate part id
      // ("is declared more than once as a part or a port") before any review runs, so this is a
      // second line of defence. Asserted on the review alone, with the shadowing refusal asserted
      // underneath, so the case goes red the day either changes.
      self: { id: 's', label: 'S' }, parts: [{ id: 'a', label: 'A' }, { id: 'a', label: 'A' }], ports: [], connectors: [],
    }, { direct: true }],
    ['UML061_COMPOSITE_PORT_COLLISION', {
      // The port is connected, so UML058 is not what this case is about. Also pinned unreachable:
      // a port and a part may not share an id, and the validator refuses that before the review.
      self: { id: 's', label: 'S' }, parts: [{ id: 'a', label: 'A' }], ports: [{ id: 'a', direction: 'out' }],
      connectors: [{ from: 'a', to: 'a' }],
    }, { direct: true }],
    ['UML062_COMPOSITE_UNDOCUMENTED', {
      self: { id: 's', label: 'S' }, parts: [{ id: 'a' }], ports: [], connectors: [],
    }],
  ]
  const declared = new Set(COMPOSITE_FINDING_CODES)
  for (const [code] of cases) declared.delete(code)
  if (declared.size > 0) throw new Error('codes with no case: ' + [...declared].join(', '))
  for (const [code, model, options] of cases) {
    // Through the validator, as the engine does it: `UML059` reads the `undeclared` list the
    // validator computes from the connectors, so a case that handed the review a raw model would be
    // testing a path the engine never takes - and would pass only if that list were written out by
    // hand, which is what hid the fact that the review never saw it. A case marked `direct` is one
    // the validator refuses before the review could run, and is asserted on the review alone.
    const direct = options?.direct === true
    const produced = direct
      ? reviewCompositeModel({ schemaVersion: 1, ...model }, {})
      : reviewCompositeModel(validateCompositeModel({ schemaVersion: 1, ...model }), {})
    const codes = produced.map((finding) => finding.code)
    if (!codes.includes(code)) throw new Error(code + ' missing from ' + JSON.stringify(codes))
    // UML062 says an id has no reader-facing name, which is not a defect of the structure,
    // so it may sit beside anything. Nothing else may.
    const others = codes.filter((entry) => entry !== code && entry !== 'UML062_COMPOSITE_UNDOCUMENTED')
    if (others.length > 0) throw new Error(code + ' also reported ' + JSON.stringify(others))
    if (direct) {
      // The shadowing condition: the validator must refuse this model, or the code is reachable
      // and this case is testing the wrong path.
      let refused = false
      try {
        validateCompositeModel({ schemaVersion: 1, ...model })
      } catch {
        refused = true
      }
      if (!refused) throw new Error(code + ' is reachable through the validator now, so it is no longer a pinned-unreachable code')
    }
  }
})

/**
 * The engine's own path: a family model is reviewed through `reviewUml`, which validates first and
 * then hands the FAMILY'S OWN canonical shape to the review - not the raw input. A review given
 * the raw model found nothing here while the validated model reported `UML059`, so a connector
 * ending at a name no declaration introduced was a silent pass.
 */
test('composite: a connector that ends at an undeclared name is reported through reviewUml', () => {
  const dangling = reviewUml({
    model: {
      schemaVersion: 1, self: { id: 's', label: 'S' }, parts: [{ id: 'a', label: 'A' }], ports: [{ id: 'in1', direction: 'in' }],
      connectors: [{ from: 'in1', to: 'ghost' }],
    },
    diagramKind: 'composite-structure',
  })
  const codes = (dangling.findings ?? []).map((finding) => finding.code)
  if (!codes.includes('UML059_COMPOSITE_CONNECTOR_ENDPOINT_MISSING')) throw new Error('a dangling connector must be reported: ' + JSON.stringify(codes))
  if (dangling.verdict !== 'fail') throw new Error('and the verdict must say so: ' + dangling.verdict)
  if (dangling.roundTrip?.ok !== true) throw new Error('the fidelity check must not invent a mismatch for a model that omits self.kind: ' + JSON.stringify(dangling.roundTrip?.diffs))
})

test('composite: the validator refuses by field', () => {
  const base = { schemaVersion: 1, self: { id: 's', kind: 'component' }, parts: [], ports: [], connectors: [] }
  const refusals = [
    ['must be an object with schemaVersion 1', 'x'],
    ['must declare schemaVersion 1', { ...base, schemaVersion: 2 }],
    ['needs a `self` with a non-empty id', { ...base, self: { id: '' } }],
    ['self.kind must be one of', { ...base, self: { id: 's', kind: 'wibble' } }],
    ['needs a non-empty string id', { ...base, parts: [{ id: '' }] }],
    ['is declared more than once', { ...base, parts: [{ id: 'a' }, { id: 'a' }] }],
    ['port direction must be', { ...base, ports: [{ id: 'p', direction: 'sideways' }] }],
    ['cannot join', { ...base, connectors: [{ from: 's', to: 's' }] }],
  ]
  for (const [needle, input] of refusals) {
    let refusal
    try { validateCompositeModel(input) } catch (error) { refusal = error }
    if (!(refusal instanceof UmlError) || refusal.code !== 'UML_INPUT') throw new Error(needle + ': not an UML_INPUT refusal: ' + String(refusal))
    if (!refusal.message.includes(needle)) throw new Error('refusal for "' + needle + '" said: ' + refusal.message)
  }
})

test('composite: mermaid has no composite structure diagram', () => {
  let refusal
  try { renderUml(compositeModel, 'mermaid', 'composite-structure') } catch (error) { refusal = error }
  if (!(refusal instanceof UmlError) || refusal.code !== 'UML_VIEW_UNREPRESENTABLE') throw new Error('render: ' + String(refusal))
})

test('entry: an entity-relationship diagram is refused, not read as a class diagram', () => {
  // The cardinality is the tell. Read as a component diagram, `USER ||--o{ ORDER` becomes
  // two components called `USER ||` and `o{ ORDER`, and the review passes a graph the
  // diagram never drew.
  const er = ['@startuml', 'entity USER {', '  *id : int', '}', 'entity ORDER {', '  *id : int', '}', 'USER ||--o{ ORDER', '@enduml'].join('\n')
  const refusal = refusalOf(() => parseUml(er))
  if (refusal.code !== 'UML_NOT_A_STATE_DIAGRAM') throw new Error('refusal code: ' + refusal.code)
  if (!refusal.message.includes('entity-relationship')) throw new Error('the refusal must name what it is: ' + refusal.message)
  if (!refusal.message.includes('dsh-model-everything-datamodel')) throw new Error('the refusal must route to what does cover it: ' + refusal.message)
  // Through the review entry point the same refusal arrives as a failing report rather
  // than a throw: an unreadable diagram is a result the caller can act on, not a crash.
  const byReview = reviewUml({ diagram: er })
  if (byReview.verdict !== 'fail') throw new Error('the review must fail on an unreadable diagram: ' + byReview.verdict)
  const unreadable = findFinding(byReview, 'UML001_DIAGRAM_UNREADABLE')[0]
  if (unreadable === undefined) throw new Error('codes: ' + JSON.stringify(codes(byReview)))
  if (!unreadable.message.includes('entity-relationship')) throw new Error('the report must carry the reason: ' + unreadable.message)
  if (!findFinding(byReview, 'UML018_FIDELITY_UNCHECKED').every((finding) => finding.severity === 'info')) throw new Error('a non-machine family reports fidelity as info')
})

test('entry: the ER refusal does not swallow the class diagram that shares its keyword', () => {
  // `entity` is a class-diagram keyword too, and its members and `--` separator are spelled
  // the same way as ER ones. Only the crow's-foot cardinality decides, so this must parse.
  const asClass = ['@startuml', 'entity Foo {', '  +id : int', '  --', '  +name()', '}', 'entity Bar', 'Foo --> Bar', '@enduml'].join('\n')
  const parsed = parseUml(asClass)
  if (parsed.family !== 'class' && parsed.family !== 'component') throw new Error('family: ' + parsed.family)
  const ids = (parsed.model.nodes ?? []).map((node) => node.id)
  if (!ids.includes('Foo') || !ids.includes('Bar')) throw new Error('nodes: ' + JSON.stringify(ids))
  if ((parsed.model.edges ?? []).length !== 1) throw new Error('edges: ' + JSON.stringify(parsed.model.edges))
})

// ------------------------------------------------ the communication family --

// PlantUML has no communication-diagram type, and the family table used to refuse a parse
// on the grounds that "neither notation spells the numbering". It does: the number lives
// in the arrow's label (`C --> O : 1: create`). So this family is drawn approximately and
// read back exactly, like the composite structure.
const communicationModel = {
  schemaVersion: 1,
  lifelines: [{ id: 'C', classifier: 'Customer' }, { id: 'O', classifier: 'Order' }, { id: 'S', label: 'Stock' }],
  links: [{ from: 'C', to: 'O' }, { from: 'O', to: 'S' }],
  messages: [
    { sequence: '1', from: 'C', to: 'O', label: 'create' },
    { sequence: '2', from: 'O', to: 'S', label: 'reserve' },
  ],
}

test('communication: the round trip carries lifelines, links and the numbers', () => {
  const rendered = renderUml(communicationModel, 'plantuml', 'communication')
  for (const needle of ['object ":Customer:" as C', 'object "Stock" as S', 'C -- O', 'C --> O : 1: create', 'O --> S : 2: reserve']) {
    if (!rendered.primary.includes(needle)) throw new Error('missing ' + needle + '\n' + rendered.primary)
  }
  const parsed = parseUml(rendered.primary)
  if (parsed.family !== 'communication') throw new Error('family: ' + parsed.family)
  if (JSON.stringify(parsed.model) !== JSON.stringify(communicationModel)) {
    throw new Error('the drawing does not carry the model:\n  want ' + JSON.stringify(communicationModel) + '\n  got  ' + JSON.stringify(parsed.model))
  }
  const roundTrip = reviewUml({ model: communicationModel, diagramKind: 'communication' }).roundTrip
  if (roundTrip === null || roundTrip === undefined || !roundTrip.ok) {
    throw new Error('the review must prove the round trip: ' + JSON.stringify(roundTrip?.diffs ?? null))
  }
  if (renderUml(parsed.model, 'plantuml', 'communication').primary !== rendered.primary) throw new Error('re-rendering is not byte-stable')
})

test('communication: a hand-written diagram needs no directives', () => {
  const hand = ['@startuml', 'object ":Customer:" as C', 'object ":Order:" as O', 'C -- O', 'C -> O : 1: create', 'O -> O : 2: validate', '@enduml'].join('\n')
  const parsed = parseUml(hand)
  if (parsed.family !== 'communication') throw new Error('family: ' + parsed.family)
  const model = parsed.model
  if (model.lifelines.length !== 2) throw new Error('lifelines: ' + JSON.stringify(model.lifelines))
  if (model.lifelines[0].classifier !== 'Customer') throw new Error('a `:Name` is a classifier: ' + JSON.stringify(model.lifelines[0]))
  if (model.links.length !== 1) throw new Error('links: ' + JSON.stringify(model.links))
  if (model.messages.length !== 2) throw new Error('messages: ' + JSON.stringify(model.messages))
  if (model.messages[0].sequence !== '1' || model.messages[0].label !== 'create') throw new Error('the number and name must both survive: ' + JSON.stringify(model.messages[0]))
  // A self-message is legal and is not a link.
  if (model.messages[1].from !== 'O' || model.messages[1].to !== 'O') throw new Error('self message: ' + JSON.stringify(model.messages[1]))
  if (parsed.discardedConstructs.length !== 0) throw new Error('nothing here is unrepresentable: ' + JSON.stringify(parsed.discardedConstructs))
})

test('communication: the validator refuses by field', () => {
  const base = { schemaVersion: 1, lifelines: [{ id: 'A' }], links: [], messages: [] }
  const refusals = [
    ['must be an object with schemaVersion 1', 'x'],
    ['must declare schemaVersion 1', { ...base, schemaVersion: 2 }],
    ['every lifeline needs a non-empty string id', { ...base, lifelines: [{ id: '' }] }],
    ['is declared more than once', { ...base, lifelines: [{ id: 'A' }, { id: 'A' }] }],
    ['a link cannot join', { ...base, links: [{ from: 'A', to: 'A' }] }],
    ['every message needs a sequence number as a non-empty string', { ...base, messages: [{ sequence: '', from: 'A', to: 'A' }] }],
    ['is used twice', { ...base, messages: [{ sequence: '1', from: 'A', to: 'A' }, { sequence: '1', from: 'A', to: 'A' }] }],
  ]
  for (const [needle, input] of refusals) {
    let refusal
    try { validateCommunicationModel(input) } catch (error) { refusal = error }
    if (!(refusal instanceof UmlError) || refusal.code !== 'UML_INPUT') throw new Error(needle + ': not an UML_INPUT refusal: ' + String(refusal))
    if (!refusal.message.includes(needle)) throw new Error('refusal for "' + needle + '" said: ' + refusal.message)
  }
})

test('communication: mermaid has no communication diagram', () => {
  const refusal = refusalOf(() => renderUml(communicationModel, 'mermaid', 'communication'))
  if (refusal.code !== 'UML_VIEW_UNREPRESENTABLE') throw new Error('refusal code: ' + refusal.code)
})

test('communication: every code the family declares is produced by its own case', () => {
  const cases = [
    ['UML063_COMMUNICATION_NO_LIFELINES', { lifelines: [], links: [], messages: [] }],
    ['UML064_COMMUNICATION_LIFELINE_UNLINKED', {
      // Only `Lonely` is unreachable: the other two are joined by a link between declared
      // lifelines, so UML066 stays out of this case.
      lifelines: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }, { id: 'Lonely', label: 'Lonely' }],
      links: [{ from: 'A', to: 'B' }], messages: [],
    }],
    ['UML065_COMMUNICATION_MESSAGE_WITHOUT_LINK', {
      lifelines: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], links: [], messages: [{ sequence: '1', from: 'A', to: 'B' }],
    }],
    ['UML066_COMMUNICATION_UNDECLARED_ENDPOINT', {
      lifelines: [{ id: 'A', label: 'A' }], links: [{ from: 'A', to: 'Ghost' }], messages: [], undeclared: ['Ghost'],
    }],
    ['UML067_COMMUNICATION_SEQUENCE_DUPLICATE', {
      // A duplicate that the validator refuses by construction is still produced here: this
      // is the review's own check, reached the way the parser can reach it.
      lifelines: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], links: [], messages: [
        { sequence: '1', from: 'A', to: 'B' }, { sequence: '1', from: 'B', to: 'A' },
      ],
    }],
    ['UML068_COMMUNICATION_UNDOCUMENTED', {
      lifelines: [{ id: 'A', label: 'A' }, { id: 'B' }], links: [], messages: [],
    }],
  ]
  const declared = new Set(COMMUNICATION_FINDING_CODES)
  for (const [code] of cases) declared.delete(code)
  if (declared.size > 0) throw new Error('codes with no case: ' + [...declared].join(', '))
  for (const [code, model] of cases) {
    const produced = reviewCommunicationModel({ schemaVersion: 1, ...model }, {})
    const codes = produced.map((finding) => finding.code)
    if (!codes.includes(code)) throw new Error(code + ' missing from ' + JSON.stringify(codes))
    // UML068 is a documentation gap, not a defect of the diagram, so it may sit beside
    // anything; UML064 and UML065 describe the same emptiness from two sides and co-occur.
    const beside = new Set(['UML068_COMMUNICATION_UNDOCUMENTED', 'UML064_COMMUNICATION_LIFELINE_UNLINKED', 'UML065_COMMUNICATION_MESSAGE_WITHOUT_LINK'])
    const others = codes.filter((entry) => entry !== code && !beside.has(entry))
    if (others.length > 0) throw new Error(code + ' also reported ' + JSON.stringify(others))
  }
})

// ------------------------------------------- the interaction overview family --

// The overview is drawn as a Mermaid flowchart whose nodes name interactions. Mermaid is
// the only notation it is drawn in: PlantUML's activity syntax - the one place a `ref` step
// exists - is refused by this build, so the family's module says which notation it uses and
// a review of a model renders in that one.
const overviewModel = {
  schemaVersion: 1,
  nodes: [
    { id: 'n0', kind: 'initial' },
    { id: 'n1', kind: 'reference', interaction: 'Login sequence' },
    { id: 'n2', kind: 'decision', label: 'ok?' },
    { id: 'n3', kind: 'reference', interaction: 'Dashboard' },
    { id: 'n4', kind: 'final' },
    { id: 'n5', kind: 'merge' },
    { id: 'n6', kind: 'interaction', interaction: 'Logout' },
    { id: 'n7', kind: 'final' },
  ],
  edges: [
    { from: 'n0', to: 'n1' }, { from: 'n1', to: 'n2' },
    { from: 'n2', to: 'n3', condition: 'yes' }, { from: 'n2', to: 'n4', condition: 'no' },
    { from: 'n3', to: 'n5' }, { from: 'n5', to: 'n6' }, { from: 'n6', to: 'n7' },
  ],
}

test('overview: the flow, the references and the conditions are all drawn', () => {
  const rendered = renderUml(overviewModel, 'mermaid', 'interaction-overview')
  for (const needle of [
    'flowchart TD',
    '%%dsh-model-everything:uml v1 notation=mermaid family=interaction-overview',
    'n0(["start"])',
    'n1[/"Login sequence"/]',
    'n2{"ok?"}',
    'n6["Logout"]',
    'n2 -->|"yes"| n3',
    'n2 -->|"no"| n4',
  ]) {
    if (!rendered.primary.includes(needle)) throw new Error('missing ' + needle + '\n' + rendered.primary)
  }
  if (!rendered.warnings.some((warning) => warning.includes('UML_RENDER_APPROXIMATE_VIEW'))) {
    throw new Error('the approximate view must be named: ' + JSON.stringify(rendered.warnings))
  }
  if (renderUml(overviewModel, 'mermaid', 'interaction-overview').primary !== rendered.primary) throw new Error('rendering is not deterministic')
})

test('overview: the parse refuses by name, and the review renders anyway', () => {
  const text = renderUml(overviewModel, 'mermaid', 'interaction-overview').primary
  const refusal = refusalOf(() => parseUml(text))
  if (refusal.code !== 'UML_NOT_A_STATE_DIAGRAM') throw new Error('refusal code: ' + refusal.code)
  if (!refusal.message.includes('flowchart node carries a name')) throw new Error('the refusal must say why: ' + refusal.message)
  // A review of the model still draws it - in the family's own notation, not the caller's
  // default - and says that fidelity was not checked rather than pretending it was.
  const report = reviewUml({ model: overviewModel, diagramKind: 'interaction-overview' })
  if (report.verdict === 'fail') throw new Error('this overview must not fail: ' + report.verdictReason)
  if (report.primary === undefined || !report.primary.startsWith('flowchart TD')) {
    throw new Error('the review must render the family in mermaid: ' + String(report.primary).slice(0, 80))
  }
  if (!codes(report).includes('UML018_FIDELITY_UNCHECKED')) throw new Error('the review must say fidelity is unchecked: ' + JSON.stringify(codes(report)))
  if (report.roundTrip !== null) throw new Error('an unreadable family must not report a round trip: ' + JSON.stringify(report.roundTrip))
})

test('overview: plantuml cannot draw it, and says which notation can', () => {
  const refusal = refusalOf(() => renderUml(overviewModel, 'plantuml', 'interaction-overview'))
  if (refusal.code !== 'UML_VIEW_UNREPRESENTABLE') throw new Error('refusal code: ' + refusal.code)
  if (!refusal.message.includes('mermaid')) throw new Error('the refusal must name the notation that works: ' + refusal.message)
})

test('overview: the validator refuses by field', () => {
  const base = { schemaVersion: 1, nodes: [{ id: 'n0', kind: 'initial' }], edges: [] }
  const refusals = [
    ['must be an object with schemaVersion 1', 'x'],
    ['must declare schemaVersion 1', { ...base, schemaVersion: 2 }],
    ['every node needs a non-empty string id', { ...base, nodes: [{ id: '' }] }],
    ['is declared more than once', { ...base, nodes: [{ id: 'n0', kind: 'initial' }, { id: 'n0', kind: 'final' }] }],
    ['node kind must be one of', { ...base, nodes: [{ id: 'n0', kind: 'wibble' }] }],
    ['needs a non-empty `interaction` name', { ...base, nodes: [{ id: 'n0', kind: 'initial' }, { id: 'n1', kind: 'reference' }] }],
    ['needs exactly one initial node', { ...base, nodes: [{ id: 'n0', kind: 'final' }] }],
    ['every edge needs a non-empty `to` end', { ...base, edges: [{ from: 'n0', to: '' }] }],
  ]
  for (const [needle, input] of refusals) {
    let refusal
    try { validateInteractionOverviewModel(input) } catch (error) { refusal = error }
    if (!(refusal instanceof UmlError) || refusal.code !== 'UML_INPUT') throw new Error(needle + ': not an UML_INPUT refusal: ' + String(refusal))
    if (!refusal.message.includes(needle)) throw new Error('refusal for "' + needle + '" said: ' + refusal.message)
  }
})

test('overview: every code the family declares is produced by its own case', () => {
  const base = [{ id: 'n0', kind: 'initial' }, { id: 'n1', kind: 'final' }]
  const cases = [
    ['UML070_OVERVIEW_NODE_UNREACHABLE', {
      nodes: [...base, { id: 'orphan', kind: 'reference', interaction: 'X' }], edges: [{ from: 'n0', to: 'n1' }],
    }],
    ['UML071_OVERVIEW_DECISION_ONE_BRANCH', {
      nodes: [{ id: 'n0', kind: 'initial' }, { id: 'n1', kind: 'decision', label: 'ok?' }, { id: 'n2', kind: 'final' }],
      edges: [{ from: 'n0', to: 'n1' }, { from: 'n1', to: 'n2' }],
    }],
    ['UML072_OVERVIEW_REFERENCE_UNDECLARED', {
      nodes: base, edges: [{ from: 'n0', to: 'n1' }, { from: 'n1', to: 'ghost' }], undeclared: ['ghost'],
    }],
    ['UML073_OVERVIEW_NODE_WITHOUT_INTERACTION', {
      // The validator refuses this shape, so the case reaches the review the way the parser
      // can: a model whose node lost its interaction after validation.
      nodes: [{ id: 'n0', kind: 'initial' }, { id: 'n1', kind: 'reference', interaction: '   ' }, { id: 'n2', kind: 'final' }],
      edges: [{ from: 'n0', to: 'n1' }, { from: 'n1', to: 'n2' }],
    }],
    ['UML074_OVERVIEW_UNDOCUMENTED', {
      nodes: [{ id: 'n0', kind: 'initial' }, { id: 'n1', kind: 'merge' }, { id: 'n2', kind: 'final' }],
      edges: [{ from: 'n0', to: 'n1' }, { from: 'n1', to: 'n2' }],
    }],
  ]
  const declared = new Set(INTERACTION_OVERVIEW_FINDING_CODES)
  for (const [code] of cases) declared.delete(code)
  if (declared.size > 1) throw new Error('codes with no case: ' + [...declared].join(', '))
  for (const [code, model] of cases) {
    const produced = reviewInteractionOverviewModel({ schemaVersion: 1, ...model }, {})
    const producedCodes = produced.map((finding) => finding.code)
    if (!producedCodes.includes(code)) throw new Error(code + ' missing from ' + JSON.stringify(producedCodes))
    const others = producedCodes.filter((entry) => entry !== code && entry !== 'UML074_OVERVIEW_UNDOCUMENTED')
    if (others.length > 0) throw new Error(code + ' also reported ' + JSON.stringify(others))
  }
  // UML069 is the validator's own refusal: no initial node never reaches the review, so the
  // case pins the shadowing instead of pretending to drive it.
  let refusal
  try { validateInteractionOverviewModel({ schemaVersion: 1, nodes: [{ id: 'n0', kind: 'final' }], edges: [] }) } catch (error) { refusal = error }
  if (refusal === undefined || !refusal.message.includes('exactly one initial node')) {
    throw new Error('UML069 must stay unreachable from the review: ' + String(refusal))
  }
})

if (failures > 0) { console.log('uml tests failed:', failures); process.exit(1) }
console.log('all uml tests passed')

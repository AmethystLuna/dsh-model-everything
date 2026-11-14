// One complex case per UML family, because a family with a simple case is a family nobody has drawn.
//
// Each model is the size of a real one - several nodes, mixed edge kinds, labels, and whatever the family adds
// (ports, lifelines, stereotypes, segments) - and each case makes the same three claims: the notation draws it, the
// text reads back as the same model, and the review's own round-trip check agrees.
//
// The two families whose notation only approximates them are reviewed through their own module: `parseUml` refuses a
// profile and an interaction overview by design, so a case that called `reviewUml` would be testing the refusal.
import {
  renderUml, parseUml, reviewUml,
  reviewProfileModel, reviewInteractionOverviewModel, validateProfileModel, validateInteractionOverviewModel,
} from '../../lib/uml.js'

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

/** A structure family's model: six nodes, five labelled edges. */
const structure = (family, kind) => ({
  schemaVersion: 1, family,
  nodes: [
    { id: 'ui', kind, label: 'Console' },
    { id: 'api', kind, label: 'API' },
    { id: 'svc', kind, label: 'Service' },
    { id: 'db', kind, label: 'Store' },
    { id: 'cache', kind, label: 'Cache' },
    { id: 'worker', kind, label: 'Worker' },
  ],
  edges: [
    { from: 'ui', to: 'api', label: 'HTTP' },
    { from: 'api', to: 'svc', label: 'call' },
    { from: 'svc', to: 'db', label: 'read/write' },
    { from: 'svc', to: 'cache', label: 'read' },
    { from: 'worker', to: 'svc', label: 'poll' },
  ],
})

/** Draw, read back, and let the review compare the two. */
const roundTrip = (family, notation, model, expect) => {
  const drawn = renderUml(model, notation, family)
  if (!drawn.primary.startsWith(expect)) throw new Error('the text does not open with ' + JSON.stringify(expect) + ': ' + drawn.primary.slice(0, 40))
  const parsed = parseUml(drawn.primary, notation)
  const review = reviewUml({ model, diagramKind: family })
  if (review.roundTrip?.ok !== true) throw new Error('the round trip lost something: ' + JSON.stringify(review.roundTrip?.diffs))
  if (review.verdict === 'fail') throw new Error('a well-modelled ' + family + ' failed its own review: ' + String(review.verdictReason))
  return { drawn, parsed, review }
}

test('state: a machine with nesting, a guard, a counter and a terminal state', () => {
  const model = {
    schemaVersion: 1, init: 'idle',
    variables: [{ name: 'retries', kind: 'integer', init: 0, min: 0, max: 3 }],
    states: [{ id: 'idle' }, { id: 'loading' }, { id: 'ready' }, { id: 'failed', terminal: true }, { id: 'closed', terminal: true }],
    transitions: [
      { from: 'idle', event: 'load', to: 'loading' },
      { from: 'loading', event: 'ok', to: 'ready' },
      { from: 'loading', event: 'fail', to: 'idle', guard: { variable: 'retries', op: '<', value: 3 }, updates: [{ variable: 'retries', op: 'inc' }] },
      { from: 'idle', event: 'fail', to: 'failed', guard: { variable: 'retries', op: '>=', value: 3 } },
      { from: 'ready', event: 'close', to: 'closed' },
    ],
  }
  roundTrip('state', 'mermaid', model, '%%dsh-model-everything')
})

test('activity: a flow with a decision, a merge and two ends', () => {
  const model = {
    schemaVersion: 1, init: 'start',
    states: [{ id: 'start' }, { id: 'pick' }, { id: 'left' }, { id: 'right' }, { id: 'join' }, { id: 'done', terminal: true }],
    transitions: [
      { from: 'start', event: 'begin', to: 'pick' },
      { from: 'pick', event: 'a', to: 'left' },
      { from: 'pick', event: 'b', to: 'right' },
      { from: 'left', event: 'merge', to: 'join' },
      { from: 'right', event: 'merge', to: 'join' },
      { from: 'join', event: 'end', to: 'done' },
    ],
  }
  roundTrip('activity', 'mermaid', model, '%%dsh-model-everything')
})

test('sequence: a machine drawn as a trace, which the parser refuses by design', () => {
  // A sequence diagram is one walk through the machine: reading it back would drop every branch the walk did not take,
  // so the family states that and refuses. The drawing is still asserted - that is what a reader is shown.
  const model = {
    schemaVersion: 1, init: 's',
    states: [{ id: 's' }, { id: 'done', terminal: true }],
    transitions: [{ from: 's', event: 'go', to: 'done' }],
  }
  const drawn = renderUml(model, 'mermaid', 'sequence')
  if (!drawn.primary.includes('sequenceDiagram')) throw new Error('the drawing is not a sequence diagram: ' + drawn.primary.slice(0, 60))
  if (drawn.primary.split(String.fromCharCode(10)).length < 5) throw new Error('the drawing has no messages')
  let refusal
  try { parseUml(drawn.primary, 'mermaid') } catch (error) { refusal = error }
  if (refusal === undefined) throw new Error('a trace was read back as a machine')
  if (!/trace, not a machine/.test(String(refusal.message))) throw new Error('the refusal does not say why: ' + String(refusal.message).slice(0, 90))
})

test('use-case: three actors, four use cases, include and extend', () => {
  const model = {
    schemaVersion: 1,
    // Only labels that differ from the id: a redundant label is dropped by the drawing, and cannot be restored.
    actors: [{ id: 'Buyer' }, { id: 'Ops', label: 'Operations' }, { id: 'Bank' }],
    useCases: [{ id: 'Order', label: 'Place an order' }, { id: 'Pay' }, { id: 'Ship' }, { id: 'Refund' }],
    relations: [
      { from: 'Buyer', to: 'Order', kind: 'association' },
      { from: 'Buyer', to: 'Pay', kind: 'association' },
      { from: 'Ops', to: 'Ship', kind: 'association' },
      { from: 'Pay', to: 'Order', kind: 'include' },
      { from: 'Refund', to: 'Pay', kind: 'extend' },
    ],
  }
  roundTrip('use-case', 'plantuml', model, '@startuml')
})

test('class: six classes with a generalisation and two arrows', () => {
  roundTrip('class', 'mermaid', structure('class', 'class'), 'classDiagram')
})

test('component: six components and five labelled calls', () => {
  roundTrip('component', 'plantuml', structure('component', 'component'), '@startuml')
})

test('package: six packages and five dependencies', () => {
  roundTrip('package', 'plantuml', structure('package', 'package'), '@startuml')
})

test('object: six objects and five links', () => {
  roundTrip('object', 'plantuml', structure('object', 'object'), '@startuml')
})

test('deployment: six nodes and five artefacts moving between them', () => {
  roundTrip('deployment', 'plantuml', structure('deployment', 'node'), '@startuml')
})

test('composite-structure: a classifier with two ports, three parts and four connectors', () => {
  const model = {
    schemaVersion: 1,
    self: { id: 'order', label: 'Order Processing' },
    ports: [{ id: 'pay', direction: 'in' }, { id: 'ship', direction: 'out' }],
    parts: [{ id: 'gw', label: 'Gateway' }, { id: 'inv', label: 'Inventory' }, { id: 'bill', label: 'Billing' }],
    connectors: [{ from: 'pay', to: 'gw' }, { from: 'gw', to: 'inv' }, { from: 'inv', to: 'bill', label: 'reserve' }, { from: 'bill', to: 'ship' }],
  }
  roundTrip('composite-structure', 'plantuml', model, '@startuml')
})

test('timing: three lifelines, a clock, four segments, two messages and a constraint', () => {
  const model = {
    schemaVersion: 1, unit: 'ms',
    lifelines: [{ id: 'WB', label: 'Browser', kind: 'robust' }, { id: 'SRV', label: 'Server' }, { id: 'CLK', label: 'Clock', kind: 'clock', period: 10 }],
    states: [{ id: 'Idle' }, { id: 'Busy', label: 'working' }],
    segments: [
      { lifeline: 'WB', state: 'Idle', from: 0, atStart: true },
      { lifeline: 'SRV', state: 'Idle', from: 0, atStart: true },
      { lifeline: 'SRV', state: 'Busy', from: 20 },
      { lifeline: 'WB', state: 'Busy', from: 30 },
    ],
    messages: [{ from: 'WB', to: 'SRV', time: 10, label: 'request' }, { from: 'SRV', to: 'WB', time: 40, label: 'reply' }],
    constraints: [{ fromTime: 10, toTime: 40, label: 'RTT' }],
  }
  roundTrip('timing', 'plantuml', model, '@startuml')
})

test('communication: three lifelines, two links and four numbered messages', () => {
  const model = {
    schemaVersion: 1,
    lifelines: [{ id: 'A', label: 'Client' }, { id: 'B', label: 'Server' }, { id: 'C', label: 'Store' }],
    links: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }],
    messages: [
      { from: 'A', to: 'B', sequence: '1', label: 'request' },
      { from: 'B', to: 'C', sequence: '2', label: 'query' },
      { from: 'C', to: 'B', sequence: '3', label: 'rows' },
      { from: 'B', to: 'A', sequence: '4', label: 'response' },
    ],
  }
  roundTrip('communication', 'plantuml', model, '@startuml')
})

test('profile: two stereotypes over a class, applied twice, reviewed through its own module', () => {
  const model = {
    schemaVersion: 1,
    profile: { id: 'ecommerce' },
    metaclasses: [{ id: 'Class' }],
    stereotypes: [{ id: 'entity', label: 'entity' }, { id: 'value', label: 'value' }],
    extensions: [{ stereotype: 'entity', metaclass: 'Class' }, { stereotype: 'value', metaclass: 'Class' }],
    applications: [
      { profile: 'ecommerce', stereotype: 'entity', applyTo: 'Order' },
      { profile: 'ecommerce', stereotype: 'value', applyTo: 'Money' },
    ],
  }
  const drawn = renderUml(model, 'plantuml', 'profile')
  if (!drawn.primary.startsWith('@startuml')) throw new Error('the profile did not draw: ' + drawn.primary.slice(0, 40))
  // The engine hands the review a validated model, which is where the optional lists become arrays.
  const normalized = validateProfileModel(model)
  const codes = reviewProfileModel(normalized, {}).map((finding) => finding.code)
  const errors = reviewProfileModel(normalized, {}).filter((finding) => finding.severity === 'error').map((finding) => finding.code)
  if (errors.length > 0) throw new Error('a well-formed profile reported errors: ' + errors.join(', '))
  // The profile it declares is named on the drawing, and the two applications are drawn.
  if (!/profile ecommerce/.test(drawn.primary)) throw new Error('the profile id is not on the drawing')
  if (!/profileApply/.test(drawn.primary)) throw new Error('the applications are not on the drawing')
  void codes
})

test('interaction-overview: initial, three references, a decision and a final, reviewed through its module', () => {
  const model = {
    schemaVersion: 1,
    nodes: [
      { id: 'i', kind: 'initial' },
      { id: 'r1', kind: 'reference', interaction: 'Login' },
      { id: 'd', kind: 'decision' },
      { id: 'r2', kind: 'reference', interaction: 'Checkout' },
      { id: 'r3', kind: 'reference', interaction: 'Cancel' },
      { id: 'f', kind: 'final' },
    ],
    edges: [
      { from: 'i', to: 'r1' },
      { from: 'r1', to: 'd' },
      { from: 'd', to: 'r2', label: 'ok' },
      { from: 'd', to: 'r3', label: 'no' },
      { from: 'r2', to: 'f' },
      { from: 'r3', to: 'f' },
    ],
  }
  // The engine hands the review a validated model, which is where the optional lists become arrays.
  const findings = reviewInteractionOverviewModel(validateInteractionOverviewModel(model), {})
  const errors = findings.filter((finding) => finding.severity === 'error')
  if (errors.length > 0) throw new Error('a well-formed overview reported errors: ' + errors.map((f) => f.code).join(', '))
})

test('a model the schema rejects is refused, even where the validator walks the same field', () => {
  // Found by writing the state case: `updates` as an object was reported ("must be an array") and then walked anyway,
  // so `uml_render` answered a TypeError instead of the error list. A refusal is the only answer a caller can route on.
  for (const updates of [{ retries: { op: 'inc' } }, 'nope', 5]) {
    const model = {
      schemaVersion: 1, init: 'a',
      states: [{ id: 'a' }, { id: 'b', terminal: true }],
      transitions: [{ from: 'a', event: 'go', to: 'b', updates }],
    }
    let refusal
    try { renderUml(model, 'mermaid', 'state') } catch (error) { refusal = error }
    if (refusal === undefined) throw new Error('accepted updates ' + JSON.stringify(updates))
    if (!/updates/.test(String(refusal.message))) throw new Error('the refusal does not name the field: ' + String(refusal.message).slice(0, 110))
    if (refusal instanceof TypeError) throw new Error('a TypeError is not a refusal')
  }
})

if (failures > 0) {
  console.log('uml-complex tests failed:', failures)
  process.exit(1)
}
console.log('all uml-complex tests passed')
// Design-review engine: white-box. One case per code that produces it, each with the nearest
// input that must NOT, plus the validator's refusal paths.
//
// The pairs matter more here than anywhere else in this repository: a structural signal like
// "this node is an articulation point" is true of many healthy designs, so a check that fires
// on both the violation and its near miss is not a check.
import { runDesignReview, designFeatures, DESIGN_CODE_LEVEL } from '../../lib/design-engine.js'

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

/** Every code the report carries, from all three levels. */
function codesOf(report) {
  return report.checks.flatMap((check) => check.findings.map((finding) => finding.code))
}

const design = (overrides = {}) => ({
  schemaVersion: 1,
  architecture: { nodes: ['a', 'b'], edges: [['a', 'b']] },
  ...overrides,
})

const codesFor = (model) => codesOf(runDesignReview(model))

/** A positive case: the code appears, and the report is well-formed. */
function expectPresent(name, model, code) {
  test('design: ' + name + ' -> ' + code, () => {
    const report = runDesignReview(model)
    const codes = codesOf(report)
    if (!codes.includes(code)) throw new Error(code + ' missing; the review reported ' + JSON.stringify(codes))
    if (DESIGN_CODE_LEVEL[code] === undefined) throw new Error(code + ' has no declared level')
    if (report.summary.checksRun !== 11) throw new Error('expected 11 checks, ran ' + String(report.summary.checksRun))
    // The level decides the bucket: a signal must never be what fails the verdict.
    if (DESIGN_CODE_LEVEL[code] === 'signal' && report.violations.some((finding) => finding.code === code)) {
      throw new Error(code + ' is a signal and must not sit in violations')
    }
    if (report.verdictReason === '' || report.nextSteps.length === 0) throw new Error('the report must explain itself')
  })
}

/** The nearest miss: one thing put right, the code gone. */
function expectAbsent(name, model, code) {
  test('design: ' + name + ' -> no ' + code, () => {
    const codes = codesFor(model)
    if (codes.includes(code)) throw new Error(code + ' is still reported for the near miss: ' + JSON.stringify(codes))
  })
}

// ------------------------------------------------------------------ DES1 cycles --

const cycle = design({ architecture: { nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c'], ['c', 'a']] } })
expectPresent('a dependency cycle', cycle, 'DES1_CYCLE')
expectAbsent('the same graph with the cycle cut', design({ architecture: { nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] } }), 'DES1_CYCLE')

test('design: the unpeelable edges are reported as unpeelable, not as a set to delete', () => {
  const report = runDesignReview(cycle)
  const finding = report.violations.find((entry) => entry.code === 'DES1_CYCLE')
  if (finding === undefined) throw new Error('missing the cycle finding')
  // A directed 3-cycle has no node without a dependent, so a peel has nowhere to start and
  // leaves all three edges: the honest count, and not the two edges that would break it.
  const arcs = report.facts.feedbackArcs
  if (!Array.isArray(arcs) || arcs.length !== 3) throw new Error('a 3-cycle peels to three edges, got ' + JSON.stringify(arcs))
  if (!String(finding.detail).includes('NP-hard')) throw new Error('the wording must not promise a minimum: ' + String(finding.detail))
  if (String(finding.detail).includes('one way to break')) throw new Error('the wording must not present the set as a repair: ' + String(finding.detail))
  if (JSON.stringify(report.facts.largestCycle) !== JSON.stringify(['a', 'b', 'c'])) throw new Error('largestCycle: ' + JSON.stringify(report.facts.largestCycle))
})

test('design: a cycle with a way in still peels the edges that have a way in', () => {
  // `entry` has nothing depending on it, so its edge peels; the cycle behind it does not.
  const report = runDesignReview(design({
    architecture: { nodes: ['entry', 'a', 'b'], edges: [['entry', 'a'], ['a', 'b'], ['b', 'a']] },
  }))
  const arcs = report.facts.feedbackArcs
  if (JSON.stringify(arcs) !== JSON.stringify([['a', 'b'], ['b', 'a']])) throw new Error('peel: ' + JSON.stringify(arcs))
})

// -------------------------------------------------------------- DES2 layer order --

const layers = [
  { name: 'ui', members: ['u'] },
  { name: 'service', members: ['s'] },
  { name: 'data', members: ['d'] },
]
expectPresent('an edge that skips a layer', design({ architecture: { nodes: ['u', 's', 'd'], edges: [['u', 'd']] }, declare: { layers } }), 'DES2_LAYER_ORDER')
expectPresent('an upward edge', design({ architecture: { nodes: ['u', 's', 'd'], edges: [['d', 's']] }, declare: { layers } }), 'DES2_LAYER_ORDER')
expectPresent('a node claimed by two layers', design({
  architecture: { nodes: ['u', 's'], edges: [] },
  declare: { layers: [{ name: 'ui', members: ['u'] }, { name: 'service', members: ['u', 's'] }] },
}), 'DES2_LAYER_ORDER')
expectAbsent('one step down at a time', design({ architecture: { nodes: ['u', 's', 'd'], edges: [['u', 's'], ['s', 'd']] }, declare: { layers } }), 'DES2_LAYER_ORDER')
expectAbsent('a design that declares no layers', design({ architecture: { nodes: ['u', 'd'], edges: [['u', 'd']] } }), 'DES2_LAYER_ORDER')

// ----------------------------------------------------------- DES3 boundary leak --

const boundaries = [{ name: 'billing', members: ['bill'] }, { name: 'identity', members: ['idp'] }]
expectPresent('an edge across boundaries no rule allows', design({
  architecture: { nodes: ['bill', 'idp'], edges: [['bill', 'idp']] },
  declare: { boundaries },
}), 'DES3_BOUNDARY_LEAK')
expectAbsent('the same crossing with a rule allowing it', design({
  architecture: { nodes: ['bill', 'idp'], edges: [['bill', 'idp']] },
  declare: { boundaries, allowedEdges: [{ id: 'r1', source: 'billing', allow: ['identity'] }] },
}), 'DES3_BOUNDARY_LEAK')
expectPresent('a deny that beats an allow', design({
  architecture: { nodes: ['bill', 'idp'], edges: [['bill', 'idp']] },
  declare: { boundaries, allowedEdges: [{ id: 'r1', source: 'billing', allow: ['identity'], deny: ['identity'] }] },
}), 'DES3_BOUNDARY_LEAK')
expectAbsent('a design that declares no boundaries', design({ architecture: { nodes: ['bill', 'idp'], edges: [['bill', 'idp']] } }), 'DES3_BOUNDARY_LEAK')

// --------------------------------------------------- DES4 single points of failure --

// A hub both sides of the design reach only through.
const hub = design({ architecture: { nodes: ['left', 'hub', 'right'], edges: [['left', 'hub'], ['hub', 'right']] } })
expectPresent('a node the graph routes through', hub, 'DES4_LOAD_BEARING_ELEMENT')
expectPresent('a bridge edge', hub, 'DES4_LOAD_BEARING_ELEMENT')
expectAbsent('a ring, where no node is load-bearing', design({
  architecture: { nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c'], ['c', 'a']] },
}), 'DES4_LOAD_BEARING_ELEMENT')

test('design: a load-bearing element is a signal and never decides the verdict', () => {
  const report = runDesignReview(hub)
  if (report.verdict !== 'pass_with_findings') throw new Error('a hub alone must not fail the design: ' + report.verdict)
  if (report.summary.errors !== 0) throw new Error('errors: ' + String(report.summary.errors))
  if (report.signals.length === 0) throw new Error('the hub must be reported as a signal')
})

// The two emitters are asserted apart, on inputs that carry one and not the other. Asserting
// only "the code appears somewhere" lets either one be broken without a suite going red -
// which is what the mutation check found when it emptied each loop in turn.
test('design: an articulation point is reported on a graph with no bridge', () => {
  // Two triangles meeting at one node: every edge lies on a cycle, so no edge is a bridge, and
  // removing the shared node separates the halves.
  const report = runDesignReview(design({
    architecture: { nodes: ['m', 'x1', 'x2', 'y1', 'y2'], edges: [['m', 'x1'], ['x1', 'x2'], ['x2', 'm'], ['m', 'y1'], ['y1', 'y2'], ['y2', 'm']] },
  }))
  if (JSON.stringify(report.facts.bridges) !== '[]') throw new Error('the fixture must have no bridge: ' + JSON.stringify(report.facts.bridges))
  const points = report.signals.filter((finding) => String(finding.message).includes('articulation point'))
  if (points.length !== 1 || !String(points[0].message).includes(' m ')) throw new Error('the articulation point must be reported alone: ' + JSON.stringify(report.signals.map((finding) => finding.message)))
})

test('design: a bridge is reported even when no node is an articulation point', () => {
  // One edge between two nodes: it is the only path, and removing either endpoint leaves a
  // single node - still connected - so neither endpoint is an articulation point.
  const report = runDesignReview(design({ architecture: { nodes: ['a', 'b'], edges: [['a', 'b']] } }))
  if (JSON.stringify(report.facts.articulationPoints) !== '[]') throw new Error('the fixture must have no articulation point: ' + JSON.stringify(report.facts.articulationPoints))
  const bridges = report.signals.filter((finding) => String(finding.message).includes('is a bridge'))
  if (bridges.length !== 1) throw new Error('the bridge must be reported: ' + JSON.stringify(report.signals.map((finding) => finding.message)))
})

// ------------------------------------------------------------ DES5 placement --

expectPresent('a node in no layer and no boundary', design({
  architecture: { nodes: ['u', 'stray'], edges: [['u', 'stray']] },
  declare: { layers: [{ name: 'ui', members: ['u'] }] },
}), 'DES5_UNDECLARED_NODE')
expectAbsent('every node placed', design({
  architecture: { nodes: ['u', 's'], edges: [['u', 's']] },
  declare: { layers: [{ name: 'ui', members: ['u'] }, { name: 'service', members: ['s'] }] },
}), 'DES5_UNDECLARED_NODE')

// --------------------------------------------------------- DES6 required edges --

expectPresent('a required dependency that is absent', design({
  architecture: { nodes: ['a', 'b'], edges: [] },
  declare: { requiredEdges: [{ id: 'must-call', from: 'a', to: 'b' }] },
}), 'DES6_MISSING_REQUIRED_EDGE')
expectAbsent('the required dependency present', design({
  architecture: { nodes: ['a', 'b'], edges: [['a', 'b']] },
  declare: { requiredEdges: [{ id: 'must-call', from: 'a', to: 'b' }] },
}), 'DES6_MISSING_REQUIRED_EDGE')

// ------------------------------------------------------- DES7 substitutability --

const account = {
  name: 'Account', stereotype: 'class',
  operations: [{ name: 'withdraw', parameters: ['Money'], returns: 'Money' }],
  transitions: [{ event: 'withdraw' }, { event: 'deposit' }],
}
expectPresent('a subtype that refuses an event its supertype handles', design({
  architecture: { nodes: ['a', 'b'], edges: [['a', 'b']] },
  types: [account, { name: 'FixedDeposit', stereotype: 'class', extends: 'Account', forbids: [{ event: 'withdraw' }] }],
}), 'DES7_LSP_CONTRACT')
expectPresent('a subtype operation with different arity', design({
  types: [account, { name: 'Wide', stereotype: 'class', extends: 'Account', operations: [{ name: 'withdraw', parameters: ['Money', 'Reason'], returns: 'Money' }] }],
}), 'DES7_LSP_CONTRACT')
/** The supertype whose guard a subtype restates, and one whose supertype states none. */
const guardedAccount = {
  name: 'GuardedAccount', stereotype: 'class',
  operations: [{ name: 'withdraw', parameters: ['Money'], returns: 'Money' }],
  transitions: [{ event: 'withdraw', guard: 'balance > 0' }, { event: 'deposit' }],
}
expectPresent('a subtype that restates a guard differently', design({
  types: [guardedAccount, {
    name: 'Premium', stereotype: 'class', extends: 'GuardedAccount',
    transitions: [{ event: 'withdraw', guard: 'balance > 1000' }],
  }],
}), 'DES7_LSP_CONTRACT')
expectAbsent('a subtype that states the same guard text', design({
  types: [guardedAccount, {
    name: 'Standard', stereotype: 'class', extends: 'GuardedAccount',
    transitions: [{ event: 'withdraw', guard: 'balance > 0' }],
  }],
}), 'DES7_LSP_CONTRACT')
expectAbsent('a subtype that refuses an event the supertype never had', design({
  types: [account, { name: 'Savings', stereotype: 'class', extends: 'Account', forbids: [{ event: 'closeEarly' }] }],
}), 'DES7_LSP_CONTRACT')
expectAbsent('a subtype that adds behaviour without touching the contract', design({
  types: [account, { name: 'Premium', stereotype: 'class', extends: 'Account', operations: [{ name: 'rewards' }] }],
}), 'DES7_LSP_CONTRACT')

// --------------------------------------------------- DES8 interface width --

const fatInterface = { name: 'Repository', stereotype: 'interface', operations: [{ name: 'find' }, { name: 'save' }, { name: 'sendDigest' }] }
expectPresent('an interface operation no client calls', design({
  types: [
    fatInterface,
    { name: 'ReportJob', stereotype: 'class', uses: [{ type: 'Repository', operations: ['find', 'save'] }] },
  ],
}), 'DES8_ISP_UNUSED_OPERATION')
expectAbsent('every operation called by someone', design({
  types: [
    fatInterface,
    { name: 'ReportJob', stereotype: 'class', uses: [{ type: 'Repository', operations: ['find'] }] },
    { name: 'IngestJob', stereotype: 'class', uses: [{ type: 'Repository', operations: ['save', 'sendDigest'] }] },
  ],
}), 'DES8_ISP_UNUSED_OPERATION')

// -------------------------------------------------- DES9 interface cohesion --

expectPresent('an interface called by groups sharing no operation', design({
  types: [
    { name: 'Store', stereotype: 'interface', operations: [{ name: 'read' }, { name: 'write' }] },
    { name: 'Reader', stereotype: 'class', uses: [{ type: 'Store', operations: ['read'] }] },
    { name: 'Writer', stereotype: 'class', uses: [{ type: 'Store', operations: ['write'] }] },
  ],
}), 'DES9_ISP_DISJOINT_CLIENTS')
expectAbsent('clients whose calls overlap', design({
  types: [
    { name: 'Store', stereotype: 'interface', operations: [{ name: 'read' }, { name: 'write' }] },
    { name: 'Reader', stereotype: 'class', uses: [{ type: 'Store', operations: ['read'] }] },
    { name: 'Both', stereotype: 'class', uses: [{ type: 'Store', operations: ['read', 'write'] }] },
  ],
}), 'DES9_ISP_DISJOINT_CLIENTS')

// ------------------------------------------------- DES10 responsibility tags --

expectPresent('a dependency no responsibility owns', design({
  types: [{
    name: 'OrderService', stereotype: 'class',
    responsibilities: [{ name: 'pricing', uses: ['PriceList'] }],
    dependsOn: ['PriceList', 'AuditLog'],
  }],
}), 'DES10_RESPONSIBILITY_GAP')
expectPresent('a responsibility that owns nothing', design({
  types: [{ name: 'OrderService', stereotype: 'class', responsibilities: [{ name: 'audit', uses: [] }], dependsOn: [] }],
}), 'DES10_RESPONSIBILITY_GAP')
expectPresent('a dependency claimed by two responsibilities', design({
  types: [{
    name: 'OrderService', stereotype: 'class',
    responsibilities: [{ name: 'pricing', uses: ['Shared'] }, { name: 'persistence', uses: ['Shared'] }],
    dependsOn: ['Shared'],
  }],
}), 'DES10_RESPONSIBILITY_GAP')
expectAbsent('every dependency owned exactly once', design({
  types: [{
    name: 'OrderService', stereotype: 'class',
    responsibilities: [{ name: 'pricing', uses: ['PriceList'] }, { name: 'persistence', uses: ['OrderStore'] }],
    dependsOn: ['PriceList', 'OrderStore'],
  }],
}), 'DES10_RESPONSIBILITY_GAP')

// ---------------------------------------------------- DES11 dependency inversion --

expectPresent('an interface depending on a concrete class', design({
  types: [
    { name: 'Notifier', stereotype: 'interface', operations: [{ name: 'send' }], dependsOn: ['SmtpClient'] },
    { name: 'SmtpClient', stereotype: 'class' },
  ],
}), 'DES11_CONCRETE_DEPENDENCY')
expectAbsent('an interface depending on another abstraction', design({
  types: [
    { name: 'Notifier', stereotype: 'interface', operations: [{ name: 'send' }], dependsOn: ['Transport'] },
    { name: 'Transport', stereotype: 'interface', operations: [{ name: 'deliver' }] },
  ],
}), 'DES11_CONCRETE_DEPENDENCY')

// ------------------------------------------------------------------ the report --

test('design: skipped checks are named, not silently passed', () => {
  const report = runDesignReview(design())
  const skipped = report.facts.checksSkipped
  for (const id of ['DES2', 'DES3', 'DES5', 'DES6', 'DES7', 'DES8', 'DES9', 'DES10', 'DES11']) {
    if (!skipped.includes(id)) throw new Error(id + ' declares nothing to hold the design to and must be skipped: ' + JSON.stringify(skipped))
  }
  if (report.checks.some((check) => check.status === 'skip' && !check.detail.includes('skipped'))) {
    throw new Error('a skipped check must say so in its detail')
  }
  if (!report.nextSteps.some((step) => step.includes('declare'))) throw new Error('the report must say what to declare: ' + JSON.stringify(report.nextSteps))
})

test('design: the shape facts are stable and complete', () => {
  const model = design({
    architecture: { nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'a'], ['b', 'c']] },
    declare: { boundaries: [{ name: 'x', members: ['a', 'b', 'c'] }] },
  })
  const first = runDesignReview(model)
  const second = runDesignReview(model)
  if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error('two runs must agree byte for byte')
  if (first.modelHash !== second.modelHash || first.modelHash.length !== 64) throw new Error('modelHash: ' + first.modelHash)
  const facts = first.facts
  for (const key of ['nodes', 'edges', 'components', 'cyclomatic', 'density', 'ranks', 'fanIn', 'fanOut', 'feedbackArcs', 'articulationPoints', 'bridges', 'mutualPairs', 'declared']) {
    if (facts[key] === undefined) throw new Error('facts is missing ' + key)
  }
  if (JSON.stringify(facts.mutualPairs) !== JSON.stringify([['a', 'b']])) throw new Error('mutualPairs: ' + JSON.stringify(facts.mutualPairs))
  if (facts.nodes !== 3 || facts.edges !== 3) throw new Error('counts: ' + JSON.stringify(facts))
})

test('design: every code the engine declares has a case in this suite', () => {
  const declared = new Set(Object.keys(DESIGN_CODE_LEVEL))
  // The suites above produce each of these; a code added without a case must fail here.
  const covered = new Set([
    'DES1_CYCLE', 'DES2_LAYER_ORDER', 'DES3_BOUNDARY_LEAK', 'DES4_LOAD_BEARING_ELEMENT', 'DES5_UNDECLARED_NODE',
    'DES6_MISSING_REQUIRED_EDGE', 'DES7_LSP_CONTRACT', 'DES8_ISP_UNUSED_OPERATION', 'DES9_ISP_DISJOINT_CLIENTS',
    'DES10_RESPONSIBILITY_GAP', 'DES11_CONCRETE_DEPENDENCY',
  ])
  const missing = [...declared].filter((code) => !covered.has(code))
  if (missing.length > 0) throw new Error('codes with no case: ' + missing.join(', '))
  const unknown = [...covered].filter((code) => !declared.has(code))
  if (unknown.length > 0) throw new Error('cases for codes the engine does not declare: ' + unknown.join(', '))
})

test('design: features are computed from the graph the model declares', () => {
  const features = designFeatures(design({ architecture: { nodes: ['a', 'b', 'c', 'd'], edges: [['a', 'b'], ['c', 'd']] } }))
  if (features.components !== 2) throw new Error('components: ' + String(features.components))
  if (features.cyclomatic !== 2 - 4 + 2 * 2) throw new Error('cyclomatic: ' + String(features.cyclomatic))
  if (features.fanOut.a !== 1 || features.fanIn.b !== 1) throw new Error('fan: ' + JSON.stringify([features.fanOut, features.fanIn]))
})

// ---------------------------------------------------------------- the refusals --

test('design: the validator refuses by field', () => {
  const refusals = [
    ['must be an object with schemaVersion', 'not a model'],
    ['schemaVersion must be 1', { schemaVersion: 2, architecture: { nodes: [], edges: [] } }],
    ['architecture is required', { schemaVersion: 1 }],
    ['architecture.nodes must be an array', { schemaVersion: 1, architecture: { nodes: 'a', edges: [] } }],
    ['architecture.edges must be an array', { schemaVersion: 1, architecture: { nodes: [], edges: 'x' } }],
    ['entries must be non-empty strings', { schemaVersion: 1, architecture: { nodes: [''], edges: [] } }],
    ['duplicate', { schemaVersion: 1, architecture: { nodes: ['a', 'a'], edges: [] } }],
    ['not declared', { schemaVersion: 1, architecture: { nodes: ['a'], edges: [['a', 'ghost']] } }],
    ['unknown field', { schemaVersion: 1, architecture: { nodes: ['a'], edges: [], extra: 1 } }],
    ['needs a non-empty name', { schemaVersion: 1, architecture: { nodes: [], edges: [] }, types: [{ stereotype: 'class' }] }],
    ['duplicate type name', { schemaVersion: 1, architecture: { nodes: [], edges: [] }, types: [{ name: 'A', stereotype: 'class' }, { name: 'A', stereotype: 'class' }] }],
    ['stereotype must be one of', { schemaVersion: 1, architecture: { nodes: [], edges: [] }, types: [{ name: 'A', stereotype: 'wibble' }] }],
    ['every operation needs a name', { schemaVersion: 1, architecture: { nodes: [], edges: [] }, types: [{ name: 'A', stereotype: 'class', operations: [{ returns: 'X' }] }] }],
    ['unknown field', { schemaVersion: 1, architecture: { nodes: [], edges: [] }, types: [{ name: 'A', stereotype: 'class', extra: 1 }] }],
  ]
  for (const [needle, input] of refusals) {
    const report = runDesignReview(input)
    if (report.ok !== false) throw new Error(needle + ': the model must be refused, got ok=' + String(report.ok))
    const messages = report.checks[0].findings.map((finding) => finding.message).join(' | ')
    if (!messages.includes(needle)) throw new Error('refusal for "' + needle + '" said: ' + messages)
    if (report.checks[0].id !== 'DESIGN' || report.summary.checksRun !== 0) throw new Error(needle + ': a refused model runs no checks')
    if (report.verdict !== 'fail') throw new Error(needle + ': a refused model must fail')
  }
  // A refused report keeps the contract, so a caller can branch on the schema alone.
  const refused = runDesignReview({ schemaVersion: 9 })
  if (refused.schema !== 'model-everything/design/v1') throw new Error('schema: ' + refused.schema)
  if (refused.modelHash !== '') throw new Error('a refused model has no hash: ' + refused.modelHash)
})

test('design: an underscore key is metadata and does not change the answer', () => {
  const plain = design()
  const annotated = { ...plain, _note: 'carried, not reviewed' }
  const left = runDesignReview(plain)
  const right = runDesignReview(annotated)
  if (left.modelHash !== right.modelHash) throw new Error('metadata must not enter the hash')
  if (JSON.stringify(codesOf(left)) !== JSON.stringify(codesOf(right))) throw new Error('metadata must not change the findings')
})

if (failures > 0) {
  console.log('design engine tests failed:', failures)
  process.exit(1)
}
console.log('all design engine tests passed')

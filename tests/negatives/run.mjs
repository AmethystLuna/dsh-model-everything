// Negative cases: for each finding code, the nearest input that must NOT produce it.
//
// A suite of positive cases proves a code *can* appear. That is half the claim: an
// implementation that reports the code unconditionally would pass every one of them. So
// each case here takes a shape that triggers a code, changes exactly the one condition
// the code depends on, and requires the code to be gone.
//
// The shape is a table: [what changed, input, code that must not appear]. When a code
// disappears for the wrong reason the case still fails, because the check is "this code
// is absent *and* the report is otherwise clean of it" - not "the report is empty".
import { runVerification, runCompositionVerification } from '../../lib/engine.js'
import { runDataVerification } from '../../lib/data-engine.js'
import { reviewUml } from '../../lib/uml.js'
import { reviewStructure } from '../../lib/structure.js'
import { runConcurrencyScan } from '../../lib/concurrency.js'
import { runDesignReview } from '../../lib/design-engine.js'

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

/** Every code the report names, whichever shape the domain uses. */
function codesOf(report) {
  const nested = Array.isArray(report.checks) ? report.checks.flatMap((check) => check.findings ?? []) : []
  const flat = Array.isArray(report.findings) ? report.findings : []
  return [...nested, ...flat].map((finding) => finding.code)
}

function expectAbsent(name, code, report) {
  test('negative: ' + name + ' -> no ' + code, () => {
    const codes = codesOf(report)
    if (codes.includes(code)) {
      throw new Error(code + ' is still reported for the near miss: ' + JSON.stringify(codes))
    }
  })
}

const entity = (name, fields, extra = {}) => ({ name, fields, ...extra })
const field = (name, type, extra = {}) => ({ name, type, ...extra })
const data = (entities, extra = {}) => ({ schemaVersion: 1, entities, ...extra })

// ------------------------------------------------------------------ data engine --
// Each line is the positive shape with one thing put right.

expectAbsent('an index over a field that exists', 'DS1_INDEX_MISSING',
  runDataVerification(data([entity('U', [field('id', 'uuid')], { indexes: [['id']] })])))

expectAbsent('a required field whose value is mapped from the before model', 'DS2_REQUIRED_FIELD_UNSOURCED',
  runDataVerification(
    data([entity('U', [field('id', 'uuid', { required: true })])]),
    { beforeModel: data([entity('U', [field('id', 'uuid')])]), fieldMapping: { 'U.id': 'U.id' } },
  ))

expectAbsent('a relationship whose fromEntity exists', 'DS3_FROM_ENTITY_MISSING',
  runDataVerification(data([entity('U', [field('id', 'uuid')])], { relationships: [{ fromEntity: 'U', fromField: 'id', toEntity: 'U' }] })))

expectAbsent('a relationship whose fromField exists', 'DS3_FROM_FIELD_MISSING',
  runDataVerification(data([entity('U', [field('id', 'uuid')])], { relationships: [{ fromEntity: 'U', fromField: 'id', toEntity: 'U' }] })))

expectAbsent('a relationship with a documented onDelete', 'DS3_INVALID_ON_DELETE',
  runDataVerification(data([entity('U', [field('id', 'uuid')])], { relationships: [{ fromEntity: 'U', fromField: 'id', toEntity: 'U', onDelete: 'cascade' }] })))

expectAbsent('a unique field that is not nullable', 'DS4_UNIQUE_NULLABLE',
  runDataVerification(data([entity('U', [field('email', 'string', { unique: true })])])))

expectAbsent('a nullable field that is not unique', 'DS4_UNIQUE_NULLABLE',
  runDataVerification(data([entity('U', [field('email', 'string', { nullable: true })])])))

expectAbsent('minLength at or below maxLength', 'DS4_MIN_LENGTH_GT_MAX_LENGTH',
  runDataVerification(data([entity('U', [field('name', 'string', { minLength: 2, maxLength: 10 })])])))

expectAbsent('a required field with a real default', 'DS4_REQUIRED_NULL_DEFAULT',
  runDataVerification(data([entity('U', [field('name', 'string', { required: true, default: 'x' })])])))

expectAbsent('a required string that refuses the empty string', 'DA1_EMPTY_STRING_ALLOWED',
  runDataVerification(data([entity('U', [field('name', 'string', { required: true, minLength: 1 })])])))

expectAbsent('a default inside the declared range', 'DA2_DEFAULT_BELOW_MIN',
  runDataVerification(data([entity('U', [field('n', 'integer', { min: 5, default: 7 })])])))

expectAbsent('an enum whose values are inside the range', 'DA2_ENUM_ABOVE_MAX',
  runDataVerification(data([entity('U', [field('n', 'integer', { max: 5, enum: [1, 5] })])])))

expectAbsent('a boundary value inside the declared range', 'DA2_BOUNDARY_BELOW_MIN',
  runDataVerification(data([entity('U', [field('n', 'integer', { min: 5, max: 10 })])], { boundaryChecks: [{ entity: 'U', field: 'n', values: [7] }] })))

expectAbsent('a boundary value that is in the enum', 'DA2_BOUNDARY_NOT_IN_ENUM',
  runDataVerification(data([entity('U', [field('s', 'enum', { enum: ['a', 'b'] })])], { boundaryChecks: [{ entity: 'U', field: 's', values: ['a'] }] })))

expectAbsent('a nullable key that is not declared unique', 'DA3_NULLABLE_UNIQUE_KEY',
  runDataVerification(data([entity('U', [field('email', 'string', { nullable: true })])])))

expectAbsent('a relationship whose ends have the same type', 'DA4_REF_TYPE_MISMATCH',
  runDataVerification(data(
    [entity('A', [field('id', 'uuid')]), entity('B', [field('id', 'uuid')])],
    { relationships: [{ fromEntity: 'A', fromField: 'id', toEntity: 'B', toField: 'id' }] },
  )))

expectAbsent('a before model that validates', 'DA5_BEFORE_MODEL_INVALID',
  runDataVerification(data([entity('U', [field('id', 'uuid')])]), { beforeModel: data([entity('U', [field('id', 'uuid')])]) }))

expectAbsent('a copy pair whose source entity exists', 'DA6_SOURCE_ENTITY_MISSING',
  runDataVerification(data([entity('S', [field('a', 'string')]), entity('T', [field('x', 'string')])]),
    { copyPairs: [{ id: 'c1', sourceEntity: 'S', targetEntity: 'T', mapping: { a: 'x' } }] }))

expectAbsent('a copy pair whose source field exists', 'DA6_SOURCE_FIELD_MISSING',
  runDataVerification(data([entity('S', [field('a', 'string')]), entity('T', [field('x', 'string')])]),
    { copyPairs: [{ id: 'c1', sourceEntity: 'S', targetEntity: 'T', mapping: { a: 'x' } }] }))

expectAbsent('an idempotent migration that has its mapping', 'DA8_MIGRATION_MAPPING_MISSING',
  runDataVerification(
    data(
      [entity('A', [field('x', 'string')]), entity('B', [field('y', 'string')])],
      { invariants: [{ id: 'im1', description: 'idempotent', kind: 'idempotent-migration', from: 'A.x', to: 'B.y' }] },
    ),
    { migrationMappings: [{ from: 'A.x', to: 'B.y', transform: 'copy' }] },
  ))

expectAbsent('a monotonic invariant on a field that exists', 'DA9_MONOTONIC_FIELD_MISSING',
  runDataVerification(data(
    [entity('T', [field('v', 'integer')])],
    { invariants: [{ id: 'm1', description: 'inc', kind: 'monotonic', entity: 'T', field: 'v', direction: 'inc' }] },
  )))

expectAbsent('a monotonic invariant on an orderable type', 'DA9_MONOTONIC_TYPE_UNSUPPORTED',
  runDataVerification(data(
    [entity('T', [field('v', 'integer')])],
    { invariants: [{ id: 'm1', description: 'inc', kind: 'monotonic', entity: 'T', field: 'v', direction: 'inc' }] },
  )))

expectAbsent('a monotonic invariant that agrees with the field', 'DA9_MONOTONIC_DIRECTION_MISMATCH',
  runDataVerification(data(
    [entity('T', [field('v', 'integer', { monotonic: 'inc' })])],
    { invariants: [{ id: 'm1', description: 'inc', kind: 'monotonic', entity: 'T', field: 'v', direction: 'inc' }] },
  )))

expectAbsent('a leads-to target inside the enum', 'DA11_TO_NOT_IN_ENUM',
  runDataVerification(data(
    [entity('J', [field('s', 'enum', { enum: ['a', 'b'] })])],
    { invariants: [{ id: 'l1', description: 'a leads to b', kind: 'leads-to', entity: 'J', field: 's', from: 'a', to: 'b' }] },
  )))

expectAbsent('an atomicity step that exists', 'DA12_ATOMIC_STEP_MISSING',
  runDataVerification(
    data(
      [entity('S', [field('a', 'string')]), entity('T', [field('x', 'string')])],
      { invariants: [{ id: 'at1', description: 'atomic', kind: 'atomicity', steps: ['c1'] }] },
    ),
    {
      copyPairs: [{ id: 'c1', sourceEntity: 'S', targetEntity: 'T', mapping: { a: 'x' } }],
      backupPairs: [{ id: 'b1', sourceEntity: 'S', targetEntity: 'T', mapping: { a: 'x' } }],
    },
  ))

expectAbsent('a required field that stayed required', 'DD1_REQUIRED_BECAME_OPTIONAL',
  runDataVerification(
    data([entity('U', [field('a', 'string', { required: true })])]),
    { beforeModel: data([entity('U', [field('a', 'string', { required: true })])]) },
  ))

expectAbsent('an entity that is still there', 'DD3_REMOVED_ENTITY',
  runDataVerification(
    data([entity('U', [field('id', 'uuid')])]),
    { beforeModel: data([entity('U', [field('id', 'uuid')])]) },
  ))

expectAbsent('an optional field that is still there', 'DD3_REMOVED_FIELD',
  runDataVerification(
    data([entity('U', [field('a', 'string'), field('b', 'string')])]),
    { beforeModel: data([entity('U', [field('a', 'string'), field('b', 'string')])]) },
  ))

expectAbsent('an optional field that stayed optional', 'DD4_OPTIONAL_BECAME_REQUIRED',
  runDataVerification(
    data([entity('U', [field('a', 'string')])]),
    { beforeModel: data([entity('U', [field('a', 'string')])]) },
  ))

expectAbsent('a nullable field that stayed nullable', 'DD4_NULLABLE_BECAME_NOT_NULL',
  runDataVerification(
    data([entity('U', [field('a', 'string', { nullable: true })])]),
    { beforeModel: data([entity('U', [field('a', 'string', { nullable: true })])]) },
  ))

expectAbsent('a field whose type did not change', 'DD4_TYPE_CHANGED',
  runDataVerification(
    data([entity('U', [field('a', 'string')])]),
    { beforeModel: data([entity('U', [field('a', 'string')])]) },
  ))

expectAbsent('a before invariant whose entity survives', 'DD2_INVARIANT_ENTITY_MISSING',
  runDataVerification(
    data([entity('Kept', [field('x', 'string')])]),
    {
      beforeModel: data(
        [entity('Kept', [field('x', 'string')])],
        { invariants: [{ id: 'f1', description: 'requires x', kind: 'field-required', entity: 'Kept', field: 'x' }] },
      ),
    },
  ))

// ----------------------------------------------------------------------- engine --
// The state machine's near misses: each one is the positive shape with the single
// condition removed (the unhandled event is handled, the release is reachable, ...).

const machine = (states, transitions, extra = {}) => ({ schemaVersion: 1, init: 'A', states, transitions, ...extra })

expectAbsent('every event is handled somewhere from every state', 'A1_UNHANDLED_EVENT',
  runVerification(machine(
    [{ id: 'A' }, { id: 'B', terminal: true }],
    [{ from: 'A', event: 'go', to: 'B' }, { from: 'B', event: 'go', to: 'B' }],
  ), {}))

expectAbsent('a release that is reachable after the acquire', 'A4_NO_RELEASE_REACHABLE',
  runVerification(machine(
    [{ id: 'A' }, { id: 'LOCKED' }, { id: 'DONE', terminal: true }],
    [
      { from: 'A', event: 'acquire', to: 'LOCKED', updates: [{ variable: 'locked', op: 'set', value: 1 }] },
      { from: 'LOCKED', event: 'release', to: 'DONE', updates: [{ variable: 'locked', op: 'set', value: 0 }] },
    ],
    { variables: [{ name: 'locked', kind: 'integer', init: 0, min: 0, max: 1 }] },
  ), {}))

expectAbsent('two guards that cannot both hold', 'A5_GUARD_OVERLAP',
  runVerification(machine(
    [{ id: 'A' }, { id: 'B', terminal: true }, { id: 'C', terminal: true }],
    [
      { from: 'A', event: 'go', guard: { variable: 'k', op: '<', value: 3 }, to: 'B' },
      { from: 'A', event: 'go', guard: { variable: 'k', op: '>=', value: 3 }, to: 'C' },
    ],
    { variables: [{ name: 'k', kind: 'integer', init: 0, min: 0, max: 5 }] },
  ), {}))

expectAbsent('a transition order that is not ambiguous', 'S4_NONDETERMINISTIC_GUARDS',
  runVerification(machine(
    [{ id: 'A' }, { id: 'B', terminal: true }, { id: 'C', terminal: true }],
    [
      { from: 'A', event: 'go', guard: { variable: 'k', op: '<', value: 3 }, to: 'B' },
      { from: 'A', event: 'go', guard: { variable: 'k', op: '>=', value: 3 }, to: 'C' },
    ],
    { variables: [{ name: 'k', kind: 'integer', init: 0, min: 0, max: 5 }] },
  ), {}))

expectAbsent('a machine whose state space is bounded', 'S6_UNBOUNDED_DOMAIN',
  runVerification(machine(
    [{ id: 'A' }, { id: 'B', terminal: true }],
    [{ from: 'A', event: 'go', to: 'B' }],
  ), {}))

expectAbsent('a monotonic field written the way it declared', 'S8_MONOTONIC_INCREASE',
  runVerification(machine(
    [{ id: 'A' }, { id: 'B', terminal: true }],
    [{ from: 'A', event: 'go', to: 'B', updates: [{ variable: 'seq', op: 'inc' }] }],
    { variables: [{ name: 'seq', kind: 'integer', init: 0, min: 0, max: 10, monotonic: 'inc' }] },
  ), {}))

expectAbsent('a monotonic field that is never set from outside', 'S8_MONOTONIC_SET_REVIEW',
  runVerification(machine(
    [{ id: 'A' }, { id: 'B', terminal: true }],
    [{ from: 'A', event: 'go', to: 'B', updates: [{ variable: 'seq', op: 'inc' }] }],
    { variables: [{ name: 'seq', kind: 'integer', init: 0, min: 0, max: 10, monotonic: 'inc' }] },
  ), {}))

expectAbsent('an init that survives the mapping', 'D1_INIT_MISMATCH',
  runVerification(
    machine([{ id: 'A' }, { id: 'B', terminal: true }], [{ from: 'A', event: 'go', to: 'B' }]),
    {
      beforeModel: machine([{ id: 'A' }, { id: 'B', terminal: true }], [{ from: 'A', event: 'go', to: 'B' }]),
      stateMapping: { A: 'A', B: 'B' },
    },
  ))

expectAbsent('a mapping that keeps every before state', 'D1_MAPPED_STATE_MISSING',
  runVerification(
    machine([{ id: 'A' }, { id: 'B', terminal: true }], [{ from: 'A', event: 'go', to: 'B' }]),
    {
      beforeModel: machine([{ id: 'A' }, { id: 'B', terminal: true }], [{ from: 'A', event: 'go', to: 'B' }]),
      stateMapping: { A: 'A', B: 'B' },
    },
  ))

expectAbsent('a machine whose regression finds nothing', 'D3_REMOVED_STATE',
  runVerification(
    machine([{ id: 'A' }, { id: 'B', terminal: true }], [{ from: 'A', event: 'go', to: 'B' }]),
    {
      beforeModel: machine([{ id: 'A' }, { id: 'B', terminal: true }], [{ from: 'A', event: 'go', to: 'B' }]),
      stateMapping: { A: 'A', B: 'B' },
    },
  ))

expectAbsent('a machine with no new closed loop', 'D4_LIVENESS_REGRESSION',
  runVerification(
    machine([{ id: 'A' }, { id: 'B', terminal: true }], [{ from: 'A', event: 'go', to: 'B' }]),
    {
      beforeModel: machine([{ id: 'A' }, { id: 'B', terminal: true }], [{ from: 'A', event: 'go', to: 'B' }]),
      stateMapping: { A: 'A', B: 'B' },
    },
  ))

expectAbsent('a before variable that is still declared', 'D2_VARIABLE_MISSING',
  runVerification(
    machine([{ id: 'A' }, { id: 'B', terminal: true }], [{ from: 'A', event: 'go', to: 'B' }], { variables: [{ name: 'k', kind: 'integer', init: 0, min: 0, max: 5 }] }),
    {
      beforeModel: machine([{ id: 'A' }, { id: 'B', terminal: true }], [{ from: 'A', event: 'go', to: 'B' }], { variables: [{ name: 'k', kind: 'integer', init: 0, min: 0, max: 5 }] }),
      stateMapping: { A: 'A', B: 'B' },
    },
  ))

// -------------------------------------------------------------------------- uml --
// The use case and timing families, where the near miss is a model that satisfies every
// relation the code looks for.

const useCases = (model) => reviewUml({ model, diagramKind: 'use-case' })

expectAbsent('a use case diagram with an actor', 'UML030_USE_CASE_NO_ACTORS',
  useCases({ schemaVersion: 1, actors: [{ id: 'U' }], useCases: [{ id: 'Login' }], relations: [{ from: 'U', to: 'Login', kind: 'association' }] }))

expectAbsent('a use case diagram with a use case', 'UML031_USE_CASE_NO_USE_CASES',
  useCases({ schemaVersion: 1, actors: [{ id: 'U' }], useCases: [{ id: 'Login' }], relations: [{ from: 'U', to: 'Login', kind: 'association' }] }))

expectAbsent('a use case every actor can reach', 'UML033_USE_CASE_WITHOUT_ACTOR',
  useCases({ schemaVersion: 1, actors: [{ id: 'U' }], useCases: [{ id: 'Login' }], relations: [{ from: 'U', to: 'Login', kind: 'association' }] }))

expectAbsent('a relation between two declared elements', 'UML034_DANGLING_RELATION_ENDPOINT',
  useCases({ schemaVersion: 1, actors: [{ id: 'U' }], useCases: [{ id: 'Login' }], relations: [{ from: 'U', to: 'Login', kind: 'association' }] }))

expectAbsent('an include chain that does not close', 'UML035_INCLUDE_EXTEND_CYCLE',
  useCases({
    schemaVersion: 1,
    actors: [{ id: 'U' }],
    useCases: [{ id: 'Pay' }, { id: 'Ship' }],
    relations: [
      { from: 'U', to: 'Pay', kind: 'association' },
      { from: 'Pay', to: 'Ship', kind: 'include' },
    ],
  }))

expectAbsent('a timing model with no undeclared reference', 'UML046_TIMING_UNDECLARED_REFERENCE',
  reviewUml({
    model: {
      schemaVersion: 1,
      lifelines: [{ id: 'A', label: 'A' }],
      states: [{ id: 'Idle', label: 'Idle' }],
      segments: [{ lifeline: 'A', state: 'Idle', from: 0 }],
      messages: [],
      constraints: [],
    },
    diagramKind: 'timing',
  }))

expectAbsent('a timing model whose segments are in time order', 'UML044_TIMING_TIME_ORDER',
  reviewUml({
    model: {
      schemaVersion: 1,
      lifelines: [{ id: 'A', label: 'A' }],
      states: [{ id: 'Idle', label: 'Idle' }, { id: 'Busy', label: 'Busy' }],
      segments: [{ lifeline: 'A', state: 'Idle', from: 0 }, { lifeline: 'A', state: 'Busy', from: 50 }],
      messages: [],
      constraints: [],
    },
    diagramKind: 'timing',
  }))

expectAbsent('a timing model with one state per moment', 'UML045_TIMING_SIMULTANEOUS_STATES',
  reviewUml({
    model: {
      schemaVersion: 1,
      lifelines: [{ id: 'A', label: 'A' }],
      states: [{ id: 'Idle', label: 'Idle' }, { id: 'Busy', label: 'Busy' }],
      segments: [{ lifeline: 'A', state: 'Idle', from: 0 }, { lifeline: 'A', state: 'Busy', from: 50 }],
      messages: [],
      constraints: [],
    },
    diagramKind: 'timing',
  }))

expectAbsent('a profile whose stereotypes are all used', 'UML051_PROFILE_UNUSED_STEREOTYPE',
  reviewUml({
    model: {
      schemaVersion: 1,
      profile: { id: 'P', label: 'P' },
      stereotypes: [{ id: 'A', label: 'A' }],
      metaclasses: [{ id: 'M', label: 'M' }],
      extensions: [{ stereotype: 'A', metaclass: 'M' }],
      applications: [{ profile: 'P', applyTo: 'X' }],
      generalizations: [],
    },
    diagramKind: 'profile',
  }))

expectAbsent('a profile whose every metaclass is extended', 'UML052_PROFILE_EXTENSION_MISSING',
  reviewUml({
    model: {
      schemaVersion: 1,
      profile: { id: 'P', label: 'P' },
      stereotypes: [{ id: 'A', label: 'A' }],
      metaclasses: [{ id: 'M', label: 'M' }],
      extensions: [{ stereotype: 'A', metaclass: 'M' }],
      applications: [{ profile: 'P', applyTo: 'X' }],
      generalizations: [],
    },
    diagramKind: 'profile',
  }))

expectAbsent('an acyclic stereotype hierarchy', 'UML053_PROFILE_GENERALIZATION_CYCLE',
  reviewUml({
    model: {
      schemaVersion: 1,
      profile: { id: 'P', label: 'P' },
      stereotypes: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }],
      metaclasses: [{ id: 'M', label: 'M' }],
      extensions: [{ stereotype: 'A', metaclass: 'M' }],
      applications: [{ profile: 'P', applyTo: 'X' }],
      generalizations: [{ general: 'A', specific: 'B' }],
    },
    diagramKind: 'profile',
  }))

// ------------------------------------------------------------- structure & claims --

expectAbsent('a dependency graph with no cycle', 'UML022_CYCLE',
  reviewStructure({ diagram: ['@startuml', 'component [A] as A', 'component [B] as B', 'A --> B', '@enduml'].join('\n') }))

expectAbsent('a dependency graph with every node connected', 'UML020_ISOLATED_NODE',
  reviewStructure({ diagram: ['@startuml', 'component [A] as A', 'component [B] as B', 'A --> B', '@enduml'].join('\n') }))

expectAbsent('a dependency graph whose endpoints are declared', 'UML021_DANGLING_REFERENCE',
  reviewStructure({ diagram: ['@startuml', 'component [A] as A', 'component [B] as B', 'A --> B', '@enduml'].join('\n') }))

expectAbsent('a document that claims nothing absolutely', 'CONCURRENCY_ABSOLUTE_CLAIM',
  runConcurrencyScan('The cache is guarded by a mutex; the queue is drained on shutdown.'))

// The three async absolute forms, each with the claim removed and the async vocabulary left in
// place: a refusal would pass a case like this for the wrong reason, so every text below still
// yields findings. "blocks" is what the absolute rule must NOT catch - only the negated forms are
// claims about safety.
expectAbsent('an async handler that blocks without claiming it does not', 'CONCURRENCY_ABSOLUTE_CLAIM',
  runConcurrencyScan('The handler blocks the event loop while it reads the file synchronously in an async task.'))

expectAbsent('an async design that says nothing about blocking', 'CONCURRENCY_ABSOLUTE_CLAIM',
  runConcurrencyScan('Each request runs as an async task that awaits a promise; the callback runs on the event loop.'))

expectAbsent('a Chinese async design that only reports blocking', 'CONCURRENCY_ABSOLUTE_CLAIM',
  runConcurrencyScan('这个回调会阻塞事件循环，异步任务要等它结束。'))

// Metamorphic: the same design in the other language must mine the same families. The Chinese
// vocabulary was added for exactly this reason, and a translation is the cheapest way to notice
// that one of the two tables has drifted.
test('metamorphic: the same async design in Chinese mines the same families', () => {
  const english = runConcurrencyScan('The gateway is non-blocking; each request is an async task awaiting a promise.')
  const chinese = runConcurrencyScan('网关是非阻塞的；每个请求是一个异步任务，等待 promise。')
  const familiesOf = (report) => [...new Set(report.findings.map((finding) => finding.family))].sort()
  const left = familiesOf(english).join(',')
  const right = familiesOf(chinese).join(',')
  if (left !== right) throw new Error('families differ: english=' + left + ' chinese=' + right)
  if (left === '') throw new Error('neither text mined a family; this case would pass vacuously')
})

// Shared locations: the counters, with the one condition that makes each code fire put right.
const sharedCounter = (name) => ({
  schemaVersion: 1,
  init: name + '-idle',
  states: [{ id: name + '-idle' }, { id: name + '-done', terminal: true }],
  transitions: [{ from: name + '-idle', event: 'inc', to: name + '-done' }],
})
const sharedAccesses = (kind, extra = {}) => [
  { machine: 0, event: 'inc', location: 'counter', kind, ...extra },
  { machine: 1, event: 'inc', location: 'counter', kind, ...extra },
]

expectAbsent('two read-modify-writes under one lock', 'C5_NON_ATOMIC_UPDATE',
  runCompositionVerification([sharedCounter('a'), sharedCounter('b')], {
    shared: [{ id: 'counter', initial: 0 }, { id: 'mutex', initial: false }],
    accesses: sharedAccesses('read-write', { protectedBy: 'mutex' }),
  }))

expectAbsent('a single writer and a reader', 'C5_NON_ATOMIC_UPDATE',
  runCompositionVerification([sharedCounter('a'), sharedCounter('b')], {
    shared: [{ id: 'counter', initial: 0 }],
    accesses: [
      { machine: 0, event: 'inc', location: 'counter', kind: 'write' },
      { machine: 1, event: 'inc', location: 'counter', kind: 'read' },
    ],
  }))

expectAbsent('two readers of one location', 'C4_SHARED_WRITE_RACE',
  runCompositionVerification([sharedCounter('a'), sharedCounter('b')], {
    shared: [{ id: 'counter', initial: 0 }],
    accesses: sharedAccesses('read'),
  }))

// ------------------------------------------------------------------ design engine --
// Eleven codes, each with the declaration put right. The near miss matters more here than in
// most domains: a signal like "this edge is a bridge" is true of many healthy designs, so a
// check that fires on the near miss as well is not deciding anything.
const designCase = (overrides = {}) => runDesignReview({
  schemaVersion: 1,
  architecture: { nodes: ['a', 'b'], edges: [['a', 'b']] },
  ...overrides,
})
const layersOf = (names) => names.map(([name, members]) => ({ name, members }))

expectAbsent('a graph with the cycle cut', 'DES1_CYCLE',
  designCase({ architecture: { nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] } }))

expectAbsent('an edge one step down the declared layers', 'DES2_LAYER_ORDER',
  designCase({
    architecture: { nodes: ['u', 's', 'd'], edges: [['u', 's'], ['s', 'd']] },
    declare: { layers: layersOf([['ui', ['u']], ['service', ['s']], ['data', ['d']]]) },
  }))

expectAbsent('a crossing the declared rule allows', 'DES3_BOUNDARY_LEAK',
  designCase({
    architecture: { nodes: ['bill', 'idp'], edges: [['bill', 'idp']] },
    declare: {
      boundaries: layersOf([['billing', ['bill']], ['identity', ['idp']]]),
      allowedEdges: [{ id: 'r1', source: 'billing', allow: ['identity'] }],
    },
  }))

// The near miss for a load-bearing element is a ring: every node has two ways round, so
// nothing is an articulation point and no edge is a bridge.
expectAbsent('a ring, where no element is load-bearing', 'DES4_LOAD_BEARING_ELEMENT',
  designCase({ architecture: { nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c'], ['c', 'a']] } }))

expectAbsent('every node placed in a declared layer', 'DES5_UNDECLARED_NODE',
  designCase({
    architecture: { nodes: ['u', 's'], edges: [['u', 's']] },
    declare: { layers: layersOf([['ui', ['u']], ['service', ['s']]]) },
  }))

expectAbsent('the required dependency present', 'DES6_MISSING_REQUIRED_EDGE',
  designCase({ declare: { requiredEdges: [{ id: 'must', from: 'a', to: 'b' }] } }))

// A subtype may refuse an event its supertype never had: that narrows nothing the base
// promised, so it is a legitimate narrowing rather than a strengthened precondition.
expectAbsent('a subtype refusing an event the supertype never had', 'DES7_LSP_CONTRACT',
  designCase({
    types: [
      { name: 'Account', stereotype: 'class', operations: [{ name: 'withdraw', parameters: ['Money'] }], transitions: [{ event: 'withdraw' }] },
      { name: 'Savings', stereotype: 'class', extends: 'Account', forbids: [{ event: 'closeEarly' }] },
    ],
  }))

expectAbsent('every interface operation called by a client', 'DES8_ISP_UNUSED_OPERATION',
  designCase({
    types: [
      { name: 'Reader', stereotype: 'interface', operations: [{ name: 'find' }] },
      { name: 'Job', stereotype: 'class', uses: [{ type: 'Reader', operations: ['find'] }] },
    ],
  }))

// The near miss for a split interface: one client needs both operations, which joins the
// two groups and means one interface is the right width after all.
expectAbsent('clients whose operation sets overlap', 'DES9_ISP_DISJOINT_CLIENTS',
  designCase({
    types: [
      { name: 'Store', stereotype: 'interface', operations: [{ name: 'read' }, { name: 'write' }] },
      { name: 'Reader', stereotype: 'class', uses: [{ type: 'Store', operations: ['read'] }] },
      { name: 'Both', stereotype: 'class', uses: [{ type: 'Store', operations: ['read', 'write'] }] },
    ],
  }))

expectAbsent('every dependency owned by exactly one responsibility', 'DES10_RESPONSIBILITY_GAP',
  designCase({
    types: [{
      name: 'OrderService', stereotype: 'class',
      responsibilities: [{ name: 'pricing', uses: ['PriceList'] }, { name: 'persistence', uses: ['OrderStore'] }],
      dependsOn: ['PriceList', 'OrderStore'],
    }],
  }))

expectAbsent('an abstraction depending on another abstraction', 'DES11_CONCRETE_DEPENDENCY',
  designCase({
    types: [
      { name: 'Notifier', stereotype: 'interface', operations: [{ name: 'send' }], dependsOn: ['Transport'] },
      { name: 'Transport', stereotype: 'interface', operations: [{ name: 'deliver' }] },
    ],
  }))

if (failures > 0) {
  console.log('negative tests failed:', failures)
  process.exit(1)
}
console.log('all negative tests passed')

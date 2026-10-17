/**
 * The tool-entry boundary: what a caller actually gets from the registered tools.
 *
 * Every other suite in this repository calls the engines in `lib/` directly, so the layer a
 * model really reaches — the tool definition, its argument schema, the `reportView` switch,
 * and the mapping from a verdict to a returned result — was only covered by accident. This
 * suite drives the real entry: a `ToolRuntime` with the plugin's own definitions registered,
 * called through `runtime.execute(...)`, which is the pipeline the agent loop uses (argument
 * validation, the tool body, the declared output contract, and `output.render`).
 *
 * Two traps this pins:
 *
 * - Argument validation happens in the runtime, not in the body. A missing or wrong-typed
 *   argument never reaches a tool and never yields a report; a well-typed but invalid model
 *   does yield one. The three outcomes — tool error, refusal, failed review — are asserted to
 *   stay distinguishable on specific fields.
 * - `reportView` is read only by `output.render`. It may change the text a model reads and
 *   must never change the canonical value, the verdict, or the set of finding codes. Every
 *   tool is checked for that relation, and the two views are compared for every tool.
 *
 * The cases at the end marked `PINNED GAP` record behaviour this suite found and may not fix
 * (it touches no `src/`). They assert today's observable outcome with the source reason
 * beside them, so the day a tool gains a guard the case goes red and gets rewritten on
 * purpose rather than silently passing either way.
 */
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { modelVerifyTool } from '../../lib/tool.js'
import { modelDataModelVerifyTool } from '../../lib/data-tool.js'
import { modelConcurrencyScanTool } from '../../lib/concurrency-tool.js'
import { modelComposeTool } from '../../lib/compose-tool.js'
import { modelExportTool } from '../../lib/export-tool.js'
import { umlRenderTool, umlParseTool, umlReviewTool, umlExplainLabelsTool } from '../../lib/uml-tool.js'
import { umlStructureTool } from '../../lib/structure-tool.js'
import { designTool } from '../../lib/design-tool.js'
import { reportDiffTool } from '../../lib/report-diff-tool.js'

// ---------------------------------------------------------------------------
// The harness
// ---------------------------------------------------------------------------

let failures = 0

async function test(name, fn) {
  try {
    await fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const MAX_SHOWN = 320

/** The actual value, truncated, so a failing case says what it got instead of only what it wanted. */
function show(value) {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  try {
    const text = JSON.stringify(value)
    if (text === undefined) return String(value)
    return text.length > MAX_SHOWN ? text.slice(0, MAX_SHOWN) + '…' : text
  } catch {
    return String(value)
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

function expectEq(actual, expected, message) {
  expect(actual === expected, `${message} — expected ${show(expected)}, got ${show(actual)}`)
}

function expectDeepEq(actual, expected, message) {
  expect(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${message} — the two values differ`,
  )
}

/** A returned report: the call settled successfully and carries a verdict. */
function expectReport(res, message) {
  expect(res.isError === false, `${message}: expected a returned report, got a tool error ${show(res.error)}`)
  const value = res.value
  expect(value !== null && typeof value === 'object', `${message}: expected a report object, got ${show(value)}`)
  expect(typeof value.verdict === 'string', `${message}: every report carries a verdict, got ${show(value)}`)
  return value
}

/** A refusal or failure at the argument layer: no report exists at all. */
function expectToolError(res, message) {
  expect(res.isError === true, `${message}: expected a tool error, got ${show(res.value)}`)
  expect(res.value === undefined, `${message}: a failed call must carry no canonical value, got ${show(res.value)}`)
  return res.error
}

/** The finding codes a report carries, whichever family it belongs to. */
function findingCodes(value) {
  const codes = []
  for (const check of Array.isArray(value.checks) ? value.checks : []) {
    for (const finding of Array.isArray(check.findings) ? check.findings : []) codes.push(finding.code)
  }
  for (const finding of Array.isArray(value.findings) ? value.findings : []) codes.push(finding.code)
  return [...new Set(codes)].sort()
}

// ---------------------------------------------------------------------------
// The entry: a real ToolRuntime with this plugin's definitions
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS = [
  modelVerifyTool,
  modelDataModelVerifyTool,
  modelConcurrencyScanTool,
  modelComposeTool,
  modelExportTool,
  umlRenderTool,
  umlParseTool,
  umlReviewTool,
  umlExplainLabelsTool,
  umlStructureTool,
  designTool,
  reportDiffTool,
]

// `ToolRuntime`'s constructor registers its per-scope tool-schema contribution on
// `ctx.systemPrompt`, so that one seam has to exist. Nothing else is provided: no tool body
// here reads a service (`ctx.skills` and `ctx.cordisInspect` belong to `apply`, which
// `tests/apply-smoke.mjs` covers).
const ctx = new Context()
ctx.provide('systemPrompt', {
  tools() { return () => {} },
  section() { return () => {} },
  getSectionOrder() { return 0 },
})
const runtime = new ToolRuntime(ctx)
for (const definition of TOOL_DEFINITIONS) runtime.register(definition)

let callCounter = 0

/** One model-facing call through the registry pipeline, exactly as the agent loop dispatches it. */
function call(name, args) {
  callCounter += 1
  return runtime.execute({
    callId: `tool-boundary-${String(callCounter)}`,
    name,
    arguments: args,
    signal: new AbortController().signal,
  })
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MACHINE = {
  schemaVersion: 1,
  init: 'A',
  states: [{ id: 'A' }, { id: 'B', terminal: true }],
  transitions: [{ from: 'A', event: 'go', to: 'B' }],
}

/** A second machine, so a composition has two participants. */
const SECOND_MACHINE = {
  schemaVersion: 1,
  init: 'P',
  states: [{ id: 'P' }, { id: 'Q', terminal: true }],
  transitions: [{ from: 'P', event: 'go', to: 'Q' }],
}

/** A chain long enough that a sequence trace hits its step cap. */
const CHAIN_MACHINE = {
  schemaVersion: 1,
  init: 'S0',
  states: [{ id: 'S0' }, { id: 'S1' }, { id: 'S2' }, { id: 'S3' }, { id: 'S4', terminal: true }],
  transitions: [
    { from: 'S0', event: 'e1', to: 'S1' },
    { from: 'S1', event: 'e2', to: 'S2' },
    { from: 'S2', event: 'e3', to: 'S3' },
    { from: 'S3', event: 'e4', to: 'S4' },
  ],
}

/**
 * Two events commute and a later one does not, so A3 sees an order dependence only when its
 * permutation cap reaches the third event. That is what makes `maxPermutationEvents` testable
 * at all: on a small machine every cap produces the same report.
 */
const ORDERED_MACHINE = {
  schemaVersion: 1,
  init: 'S0',
  states: [{ id: 'S0' }, { id: 'S1' }, { id: 'S2' }, { id: 'S3', terminal: true }],
  transitions: [
    { from: 'S0', event: 'a', to: 'S1' },
    { from: 'S0', event: 'b', to: 'S1' },
    { from: 'S1', event: 'c', to: 'S2' },
    { from: 'S2', event: 'd', to: 'S3' },
  ],
}

const DATA_MODEL = {
  schemaVersion: 1,
  // `primaryKey` is an entity-level array. The engine never read the field-level flag this fixture
  // used to carry, so it was a key that did nothing until the schema closed and refused it.
  entities: [{ name: 'User', fields: [{ name: 'id', type: 'uuid' }], primaryKey: ['id'] }],
}

const STATE_DIAGRAM = 'stateDiagram-v2\n  [*] --> A\n  A --> B : go\n  B --> [*]\n'

/** The same notation, one state the model does not have: the round-trip check must see it. */
const WIDER_DIAGRAM = 'stateDiagram-v2\n  [*] --> A\n  A --> B : go\n  B --> [*]\n  B --> C : extra\n  C --> [*]\n'

const STRUCTURE_DIAGRAM = 'component C1\ncomponent C2\nC1 --> C2\n'
const BACK_EDGE_DIAGRAM = 'component C1\ncomponent C2\nC1 --> C2\nC2 --> C1\n'

const SCAN_TEXT_ABSOLUTE = 'the cache is lock-free and the counter is atomic.'
const SCAN_TEXT_KEYWORD = 'the worker protects the counter with a mutex.'
const SCAN_TEXT_PLAIN = 'the loop adds one to a local counter.'

/** A design with one broken declaration, so the tool has something to report through the host. */
const DESIGN_MODEL = {
  schemaVersion: 1,
  architecture: { nodes: ['ui', 'repo'], edges: [['ui', 'repo']] },
  declare: {
    layers: [{ name: 'ui', members: ['ui'] }, { name: 'service', members: [] }, { name: 'data', members: ['repo'] }],
  },
}

/** A baseline/current pair one added error finding apart, computed by the engine under test. */
const REPORT_BASELINE = { verdict: 'pass', checks: [{ id: 'S1', status: 'pass', findings: [] }] }
const REPORT_CURRENT = {
  verdict: 'fail',
  checks: [{ id: 'S1', status: 'fail', findings: [{ code: 'S1_INVENTED', severity: 'error', message: 'invented by the caller', evidence: { state: 'A' } }] }],
}

// ---------------------------------------------------------------------------
// Coverage gate: every registered tool is exercised below, and every table names a real tool
// ---------------------------------------------------------------------------

/** Each tool's required parameters, plus a call that satisfies them. */
const REQUIRED_PARAMS = {
  model_verify: { required: ['model'], valid: () => ({ model: MACHINE }) },
  model_datamodel_verify: { required: ['model'], valid: () => ({ model: DATA_MODEL }) },
  model_concurrency_scan: { required: ['text'], valid: () => ({ text: SCAN_TEXT_PLAIN }) },
  model_compose_verify: { required: ['machines'], valid: () => ({ machines: [MACHINE, SECOND_MACHINE] }) },
  model_export: { required: ['model', 'format'], valid: () => ({ model: MACHINE, format: 'tla' }) },
  uml_render: { required: ['model'], valid: () => ({ model: MACHINE }) },
  uml_parse: { required: ['diagram'], valid: () => ({ diagram: STATE_DIAGRAM }) },
  uml_review: { required: [], valid: () => ({ model: MACHINE }) },
  uml_explain_labels: { required: [], valid: () => ({}) },
  uml_structure_verify: { required: [], valid: () => ({ diagram: STRUCTURE_DIAGRAM }) },
  model_design_review: { required: ['model'], valid: () => ({ model: DESIGN_MODEL }) },
  report_diff: { required: ['baseline', 'current'], valid: () => ({ baseline: REPORT_BASELINE, current: REPORT_CURRENT }) },
}

/** One wrong-typed or out-of-enum argument per tool, with the violation the schema must report. */
const TYPE_ERRORS = {
  model_verify: { args: { model: MACHINE, maxStates: 'ten' }, param: 'maxStates', violation: '"maxStates" must be an integer' },
  model_datamodel_verify: { args: { model: DATA_MODEL, reportView: 'pretty' }, param: 'reportView', violation: 'must be one of ["digest","full"]' },
  model_concurrency_scan: { args: { text: 42 }, param: 'text', violation: '"text" must be a string' },
  model_compose_verify: { args: { machines: [MACHINE, SECOND_MACHINE], maxStates: 1.5 }, param: 'maxStates', violation: '"maxStates" must be an integer' },
  model_export: { args: { model: MACHINE, format: 7 }, param: 'format', violation: '"format" must be a string' },
  uml_render: { args: { model: MACHINE, notation: 'graphviz' }, param: 'notation', violation: 'must be one of ["auto","mermaid","plantuml"]' },
  uml_parse: { args: { diagram: 123 }, param: 'diagram', violation: '"diagram" must be a string' },
  uml_review: { args: { model: MACHINE, roundTrip: 'no' }, param: 'roundTrip', violation: '"roundTrip" must be a boolean' },
  uml_explain_labels: { args: { notation: 'graphviz' }, param: 'notation', violation: 'must be one of ["auto","mermaid","plantuml"]' },
  uml_structure_verify: { args: { diagram: 42 }, param: 'diagram', violation: '"diagram" must be a string' },
  model_design_review: { args: { model: DESIGN_MODEL, reportView: 'pretty' }, param: 'reportView', violation: 'must be one of ["digest","full"]' },
  report_diff: { args: { baseline: REPORT_BASELINE, current: REPORT_CURRENT, reportView: 'pretty' }, param: 'reportView', violation: 'must be one of ["digest","full"]' },
}

/** A call that succeeds, used for the reportView matrix and the per-tool view-schema case. */
const VIEW_CASES = {
  model_verify: () => ({ model: MACHINE }),
  model_datamodel_verify: () => ({ model: DATA_MODEL }),
  model_concurrency_scan: () => ({ text: SCAN_TEXT_ABSOLUTE }),
  model_compose_verify: () => ({ machines: [MACHINE, SECOND_MACHINE] }),
  model_export: () => ({ model: MACHINE, format: 'prism' }),
  uml_render: () => ({ model: MACHINE }),
  uml_parse: () => ({ diagram: STATE_DIAGRAM }),
  uml_review: () => ({ model: MACHINE, diagram: STATE_DIAGRAM }),
  uml_explain_labels: () => ({}),
  uml_structure_verify: () => ({ diagram: STRUCTURE_DIAGRAM }),
  model_design_review: () => ({ model: DESIGN_MODEL }),
  report_diff: () => ({ baseline: REPORT_BASELINE, current: REPORT_CURRENT }),
}

const TABLE_NAMES = [
  ['required-parameter', REQUIRED_PARAMS],
  ['wrong-type', TYPE_ERRORS],
  ['reportView', VIEW_CASES],
]

for (const [label, table] of TABLE_NAMES) {
  await test(`the ${label} table names every tool this suite registers and nothing else`, () => {
    const registered = new Set(TOOL_DEFINITIONS.map((definition) => definition.name))
    const uncovered = [...registered].filter((name) => !Object.hasOwn(table, name))
    expect(uncovered.length === 0, `no ${label} row for ${uncovered.join(', ')} — a tool the plugin registers is not exercised here`)
    const unknown = Object.keys(table).filter((name) => !registered.has(name))
    expect(unknown.length === 0, `${label} row(s) for ${unknown.join(', ')}, which this suite does not register`)
  })
}

// `apply` is the path that decides what a session actually sees, so the suite's own list is
// checked against it: a tool added to the plugin fails here until a row exists for it above.
await test('every tool the plugin registers on ctx.tools is exercised by this suite', async () => {
  const applyCtx = new Context()
  const registered = []
  applyCtx.provide('skills', { registerProvider() { return () => {} } })
  applyCtx.provide('tools', { register(definition) { registered.push(definition.name); return () => {} } })
  applyCtx.provide('cordisInspect', { register() { return () => {} } })
  const plugin = await import('../../lib/index.js')
  plugin.apply(applyCtx, { enabled: true, interaction: 'follow-approval' })
  const exercised = new Set(TOOL_DEFINITIONS.map((definition) => definition.name))
  const missing = registered.filter((name) => !exercised.has(name))
  expect(missing.length === 0, `the plugin registers ${missing.join(', ')}; this suite never calls ${missing.length === 1 ? 'it' : 'them'}`)
  const extra = [...exercised].filter((name) => !registered.includes(name))
  expect(extra.length === 0, `this suite calls ${extra.join(', ')}, which the plugin does not register`)
})

// ---------------------------------------------------------------------------
// Missing required parameters: refused, explained, and never silently defaulted
// ---------------------------------------------------------------------------

for (const [name, spec] of Object.entries(REQUIRED_PARAMS)) {
  for (const param of spec.required) {
    await test(`${name}: a call without \`${param}\` is refused by the argument layer`, async () => {
      const args = spec.valid()
      delete args[param]
      const res = await call(name, args)
      const error = expectToolError(res, `${name} with no \`${param}\``)
      expectEq(error?.info?.code, 'INVALID_ARGS', `${name}: the failure must be routable as INVALID_ARGS`)
      expectEq(error?.info?.name, 'ToolArgsError', `${name}: the failure must name the validator`)
      expect(
        typeof error?.message === 'string' && error.message.includes(`missing required property "${param}"`),
        `${name}: the message must name the missing parameter, got ${show(error?.message)}`,
      )
    })

    await test(`${name}: the same call with \`${param}\` provided runs`, async () => {
      const res = await call(name, spec.valid())
      expectReport(res, `${name} with a valid \`${param}\``)
    })
  }
}

// The tools whose only input is optional at the schema level leave the decision to their body,
// so their refusal is a returned report rather than a tool error — and the two must not be
// confused. `uml_review` and `uml_structure_verify` also pin the in-body guard.
await test('uml_review: neither model nor diagram is refused by the tool as a report, not as a tool error', async () => {
  const res = await call('uml_review', {})
  const value = expectReport(res, 'uml_review with no input at all')
  expectEq(value.verdict, 'fail', 'a refusal does not pass')
  expectEq(value.ok, false, 'ok is false: the request was not answered')
  expectEq(value.ran, false, 'ran is false: no review was attempted')
  expectEq(value.errorCode, 'UML_INPUT', 'the refusal carries its code')
  // The refusal contract is not uniform: this one carries no `schema`. See the case below.
  expectEq(value.schema, undefined, 'the UML front end does not stamp a schema on a refusal')
})

// PINNED GAP. Basis: `errorResult` in src/uml-tool.ts builds
// `{ ok, ran, ...refusalVerdict(message), errorCode, error }` and never a `schema`, so every
// refusal from the UML front end lacks the field — while the in-body refusal in
// src/structure-tool.ts adds `schema: REPORT_SCHEMAS.structure` and the catch in
// src/export-tool.ts adds `schema: REPORT_SCHEMAS.export`. A consumer that branches on
// `schema` therefore cannot do it for every refusal. Recorded, not endorsed.
await test('uml_review: PINNED — a UML refusal carries no `schema`, unlike a structure or export refusal', async () => {
  const uml = expectReport(await call('uml_review', {}), 'a UML refusal')
  const structure = expectReport(await call('uml_structure_verify', {}), 'a structure refusal')
  const exported = expectReport(await call('model_export', { model: 'nope', format: 'tla' }), 'an export refusal')
  expectEq(uml.ran, false, 'all three refused')
  expectEq(structure.ran, false, 'all three refused')
  expectEq(exported.ran, false, 'all three refused')
  expectEq(uml.schema, undefined, 'the UML refusal has no family schema — this is the gap')
  expectEq(structure.schema, 'model-everything/structure/v1', 'the structure refusal has one')
  expectEq(exported.schema, 'model-everything/export/v1', 'the export refusal has one')
})

await test('uml_review: the nearest case — a model and no diagram — is a real review', async () => {
  const value = expectReport(await call('uml_review', { model: MACHINE }), 'uml_review with a model')
  expectEq(value.ok, true, 'the tool ran')
  expectEq(value.ran, true, 'a review was attempted')
  expectEq(value.source, 'model', 'the report says which input answered it')
})

await test('uml_structure_verify: neither diagram nor diagrams is refused as a report', async () => {
  const res = await call('uml_structure_verify', {})
  const value = expectReport(res, 'uml_structure_verify with no input at all')
  expectEq(value.verdict, 'fail', 'a refusal does not pass')
  expectEq(value.ran, false, 'ran is false: no graph was read')
  expectEq(value.errorCode, 'UML_INPUT', 'the refusal carries its code')
})

await test('uml_structure_verify: the nearest case — one diagram — is a real review', async () => {
  const value = expectReport(await call('uml_structure_verify', { diagram: STRUCTURE_DIAGRAM }), 'uml_structure_verify with a diagram')
  expectEq(value.ran, true, 'the tool ran')
  expectEq(value.schema, 'model-everything/structure/v1', 'the single-diagram family schema')
})

await test('uml_structure_verify: `diagrams` takes the multi-level branch and reports its own schema', async () => {
  const res = await call('uml_structure_verify', { diagrams: [{ name: 'top', diagram: STRUCTURE_DIAGRAM }] })
  const value = expectReport(res, 'uml_structure_verify with diagrams')
  expectEq(value.schema, 'model-everything/granularity/v1', 'the levels branch has its own schema, not the structure one')
  expectEq(value.ran, true, 'the tool ran')
})

await test('uml_explain_labels: no parameters is a complete call, not a refusal', async () => {
  const value = expectReport(await call('uml_explain_labels', {}), 'uml_explain_labels with no parameters')
  expectEq(value.verdict, 'pass', 'nothing to review, nothing to fail')
  expectEq(value.action, 'explain-labels', 'the report names the job it did')
})

// ---------------------------------------------------------------------------
// Wrong types and out-of-enum values: refused before the body runs
// ---------------------------------------------------------------------------

for (const [name, spec] of Object.entries(TYPE_ERRORS)) {
  await test(`${name}: a wrong-typed \`${spec.param}\` is refused with the violation named`, async () => {
    const res = await call(name, spec.args)
    const error = expectToolError(res, `${name} with a wrong-typed \`${spec.param}\``)
    expectEq(error?.info?.code, 'INVALID_ARGS', `${name}: a type error is an argument error`)
    expect(
      typeof error?.message === 'string' && error.message.includes(spec.violation),
      `${name}: expected the message to carry ${show(spec.violation)}, got ${show(error?.message)}`,
    )
  })

  await test(`${name}: the same call with a well-typed \`${spec.param}\` runs`, async () => {
    const fixed = { ...spec.args }
    if (spec.param === 'maxStates') fixed.maxStates = 10
    if (spec.param === 'format') fixed.format = 'spin'
    if (spec.param === 'text') fixed.text = SCAN_TEXT_PLAIN
    if (spec.param === 'notation') fixed.notation = 'plantuml'
    if (spec.param === 'diagram') fixed.diagram = STATE_DIAGRAM
    if (spec.param === 'roundTrip') fixed.roundTrip = false
    if (spec.param === 'reportView') fixed.reportView = 'full'
    expectReport(await call(name, fixed), `${name} with a well-typed \`${spec.param}\``)
  })
}

// `reportView` is declared by every tool with the same enum; a tool that forgets the parameter
// would silently ignore it and answer this with a report instead of a refusal.
for (const name of Object.keys(VIEW_CASES)) {
  await test(`${name}: \`reportView\` accepts digest|full and refuses anything else`, async () => {
    const rejected = await call(name, { ...VIEW_CASES[name](), reportView: 'pretty' })
    const error = expectToolError(rejected, `${name} with reportView: 'pretty'`)
    expectEq(error?.info?.code, 'INVALID_ARGS', `${name}: an undeclared or out-of-enum reportView must be refused`)
    expect(
      typeof error?.message === 'string' && error.message.includes('reportView'),
      `${name}: the violation must name reportView, got ${show(error?.message)}`,
    )
    const accepted = await call(name, { ...VIEW_CASES[name](), reportView: 'full' })
    expectReport(accepted, `${name} with reportView: 'full'`)
  })
}

// `notation` and `intent` are shared by several UML tools; each tool must declare both the
// parameter and the same enum, or the value reaches the engine unvalidated.
for (const [name, args] of [
  ['uml_render', { model: MACHINE }],
  ['uml_parse', { diagram: STATE_DIAGRAM }],
  ['uml_review', { model: MACHINE }],
  ['uml_structure_verify', { diagram: STRUCTURE_DIAGRAM }],
]) {
  await test(`${name}: \`notation\` is declared and holds only a known notation`, async () => {
    const error = expectToolError(await call(name, { ...args, notation: 'graphviz' }), `${name} with notation: 'graphviz'`)
    expectEq(error?.info?.code, 'INVALID_ARGS', `${name}: an unknown notation must not reach the parser`)
    expect(
      typeof error?.message === 'string' && error.message.includes('"auto"'),
      `${name}: the violation must list the accepted notations, got ${show(error?.message)}`,
    )
  })
}

for (const [name, args] of [
  ['uml_render', { model: MACHINE }],
  ['uml_parse', { diagram: STATE_DIAGRAM }],
  ['uml_review', { model: MACHINE }],
]) {
  await test(`${name}: \`intent\` is declared and holds only a known intent`, async () => {
    const error = expectToolError(await call(name, { ...args, intent: 'guess' }), `${name} with intent: 'guess'`)
    expectEq(error?.info?.code, 'INVALID_ARGS', `${name}: an unknown intent must be refused before any work`)
    expect(
      typeof error?.message === 'string' && error.message.includes('must be one of'),
      `${name}: the violation must list the accepted intents, got ${show(error?.message)}`,
    )
  })
}

// ---------------------------------------------------------------------------
// Unknown parameters: the parameter root is open, so a typo is dropped in silence
// ---------------------------------------------------------------------------

// Basis: `defineTool` compiles `parameters` through `parameterSchemaSpecToJsonSchema`
// (`@deepseek-ai/dsh-tools`), which emits `{type: 'object', properties, required}` and no
// `additionalProperties: false`. The validator only rejects undeclared keys for a node that
// says `additionalProperties === false`, so every key outside the declaration is passed
// through to the body and ignored there. Pinned, not endorsed: the near misses below show
// what a dropped key costs.
await test('model_verify: an undeclared top-level key is ignored, not refused', async () => {
  const plain = expectReport(await call('model_verify', { model: MACHINE }), 'model_verify with only a model')
  const extra = await call('model_verify', { model: MACHINE, notAParameter: 1, anotherOne: { deep: true } })
  expect(extra.isError === false, `an undeclared key must not fail the call, got ${show(extra.error)}`)
  expectDeepEq(extra.value, plain, 'an undeclared key must leave the report exactly as it was')
})

await test('model_verify: a misspelled option is dropped while the real one is honoured', async () => {
  const plain = expectReport(await call('model_verify', { model: MACHINE }), 'model_verify with only a model')
  const typo = expectReport(await call('model_verify', { model: MACHINE, maxstates: 1 }), 'model_verify with `maxstates`')
  expectDeepEq(typo, plain, '`maxstates` is not `maxStates`: the typo must change nothing')
  const real = expectReport(await call('model_verify', { model: MACHINE, maxStates: 1 }), 'model_verify with `maxStates: 1`')
  expect(real.summary.truncated === true, `the correctly spelled cap must bite, got ${show(real.summary)}`)
  expect(JSON.stringify(real) !== JSON.stringify(plain), 'the correctly spelled cap must change the report')
})

await test('uml_review: a misspelled `roundtrip` is dropped while `roundTrip` is honoured', async () => {
  const plain = expectReport(await call('uml_review', { model: MACHINE }), 'uml_review with a model')
  const typo = expectReport(await call('uml_review', { model: MACHINE, roundtrip: false }), 'uml_review with `roundtrip`')
  expectDeepEq(typo, plain, '`roundtrip` is not `roundTrip`: the typo must change nothing')
  const real = expectReport(await call('uml_review', { model: MACHINE, roundTrip: false }), 'uml_review with roundTrip: false')
  expect(JSON.stringify(real) !== JSON.stringify(plain), 'turning the fidelity check off must change the report')
})

await test('model_verify: a misspelled `reportview` does not switch the view', async () => {
  const res = await call('model_verify', { model: MACHINE, reportview: 'full' })
  const value = expectReport(res, 'model_verify with `reportview`')
  const full = expectReport(await call('model_verify', { model: MACHINE, reportView: 'full' }), 'model_verify with reportView: full')
  expectDeepEq(value, full, 'the two calls answer the same report')
  const text = res.content[0]?.text ?? ''
  expect(text !== JSON.stringify(value, null, 2), 'a misspelled reportView must leave the body in digest form, not print the structured report')
})

// ---------------------------------------------------------------------------
// Defaults: omitting an option must equal passing the documented default
// ---------------------------------------------------------------------------

await test('model_verify: omitting `maxStates` equals the documented default of 10000', async () => {
  const omitted = expectReport(await call('model_verify', { model: MACHINE }), 'omitted maxStates')
  const explicit = expectReport(await call('model_verify', { model: MACHINE, maxStates: 10000 }), 'maxStates: 10000')
  expectDeepEq(omitted, explicit, 'the documented default must be the value the engine receives')
})

await test('model_verify: the nearest counterexample — a cap of 1 truncates the search', async () => {
  const omitted = expectReport(await call('model_verify', { model: MACHINE }), 'omitted maxStates')
  const capped = expectReport(await call('model_verify', { model: MACHINE, maxStates: 1 }), 'maxStates: 1')
  expectEq(omitted.summary.truncated, false, 'the default search is not truncated on this machine')
  expectEq(capped.summary.truncated, true, 'a cap of 1 must report the truncation rather than pass quietly')
})

await test('model_verify: omitting `maxPermutationEvents` equals the documented default of 5', async () => {
  const omitted = expectReport(await call('model_verify', { model: ORDERED_MACHINE }), 'omitted maxPermutationEvents')
  const explicit = expectReport(await call('model_verify', { model: ORDERED_MACHINE, maxPermutationEvents: 5 }), 'maxPermutationEvents: 5')
  expectDeepEq(omitted, explicit, 'the documented default must be the value the engine receives')
})

await test('model_verify: the nearest counterexample — a cap of 2 stops before the third event', async () => {
  const omitted = expectReport(await call('model_verify', { model: ORDERED_MACHINE }), 'omitted maxPermutationEvents')
  const capped = expectReport(await call('model_verify', { model: ORDERED_MACHINE, maxPermutationEvents: 2 }), 'maxPermutationEvents: 2')
  const a3 = (report) => report.checks.find((check) => check.id === 'A3')
  expectEq(a3(omitted)?.status, 'fail', 'the default cap reaches the event that makes the order matter')
  expectEq(a3(capped)?.status, 'pass', 'a cap of 2 samples only the two commuting events')
})

await test('model_verify: omitting `stateMapping` equals the identity mapping in every check', async () => {
  const omitted = expectReport(await call('model_verify', { model: MACHINE, beforeModel: MACHINE }), 'omitted stateMapping')
  const identity = expectReport(await call('model_verify', { model: MACHINE, beforeModel: MACHINE, stateMapping: { A: 'A', B: 'B' } }), 'identity stateMapping')
  const checks = (report) => report.checks.filter((check) => check.id.startsWith('D'))
  expect(checks(omitted).length > 0, `this fixture must run the regression checks, got ${show(omitted.checks.map((check) => check.id))}`)
  expectDeepEq(checks(identity), checks(omitted), 'the identity mapping must leave every D check as the default did')
  // The one deliberate difference: the mapping is echoed so a reader can see what was compared.
  expectDeepEq(omitted.comparison.stateMapping, {}, 'omitted stateMapping is echoed as an empty mapping')
  expectDeepEq(identity.comparison.stateMapping, { A: 'A', B: 'B' }, 'an explicit mapping is echoed verbatim')
})

await test('model_compose_verify: omitting `maxStates` equals the documented default of 10000', async () => {
  const args = { machines: [MACHINE, SECOND_MACHINE] }
  const omitted = expectReport(await call('model_compose_verify', args), 'omitted maxStates')
  const explicit = expectReport(await call('model_compose_verify', { ...args, maxStates: 10000 }), 'maxStates: 10000')
  expectDeepEq(omitted, explicit, 'the documented default must be the value the engine receives')
})

await test('model_compose_verify: the nearest counterexample — a cap of 1 truncates the product space', async () => {
  const args = { machines: [MACHINE, SECOND_MACHINE] }
  const capped = expectReport(await call('model_compose_verify', { ...args, maxStates: 1 }), 'maxStates: 1')
  expectEq(capped.summary.truncated, true, 'a capped search must say so rather than read as a clean one')
})

await test('uml_render: omitting `notation` equals `auto`, which equals `mermaid` for a drawn model', async () => {
  const omitted = expectReport(await call('uml_render', { model: MACHINE }), 'omitted notation')
  const auto = expectReport(await call('uml_render', { model: MACHINE, notation: 'auto' }), "notation: 'auto'")
  const mermaid = expectReport(await call('uml_render', { model: MACHINE, notation: 'mermaid' }), "notation: 'mermaid'")
  expectEq(omitted.notation, 'mermaid', 'a model is drawn in Mermaid unless asked otherwise')
  expectDeepEq(auto, omitted, "the declared default 'auto' must be the omitted behaviour")
  expectDeepEq(mermaid, omitted, "'auto' resolves to mermaid where there is no text to detect from")
})

await test('uml_render: the nearest counterexample — plantuml is a different diagram, not a relabelled one', async () => {
  const mermaid = expectReport(await call('uml_render', { model: MACHINE, notation: 'mermaid' }), "notation: 'mermaid'")
  const plantuml = expectReport(await call('uml_render', { model: MACHINE, notation: 'plantuml' }), "notation: 'plantuml'")
  expectEq(plantuml.notation, 'plantuml', 'the engine reports the notation it used')
  expect(plantuml.diagram !== mermaid.diagram, 'the two notations must not render the same source')
})

await test('uml_render: omitting `maxSteps` equals the documented default of 60', async () => {
  const args = { model: CHAIN_MACHINE, kind: 'sequence' }
  const omitted = expectReport(await call('uml_render', args), 'omitted maxSteps')
  const explicit = expectReport(await call('uml_render', { ...args, maxSteps: 60 }), 'maxSteps: 60')
  expectDeepEq(omitted, explicit, 'the documented default must be the value the renderer receives')
})

await test('uml_render: the nearest counterexample — a cap of 1 cuts the sequence trace', async () => {
  const args = { model: CHAIN_MACHINE, kind: 'sequence' }
  const omitted = expectReport(await call('uml_render', args), 'omitted maxSteps')
  const capped = expectReport(await call('uml_render', { ...args, maxSteps: 1 }), 'maxSteps: 1')
  expect(capped.diagram.length < omitted.diagram.length, `a cap of 1 must shorten the trace, got ${String(capped.diagram.length)} vs ${String(omitted.diagram.length)}`)
})

await test('uml_render: omitting `kind` equals the documented default of `state`', async () => {
  const omitted = expectReport(await call('uml_render', { model: MACHINE }), 'omitted kind')
  const explicit = expectReport(await call('uml_render', { model: MACHINE, kind: 'state' }), "kind: 'state'")
  expectEq(omitted.kind, 'state', 'the default family is reported in the result')
  expectDeepEq(omitted, explicit, 'the documented default must be the family the renderer receives')
})

await test('uml_parse: omitting `notation` equals `auto`', async () => {
  const omitted = expectReport(await call('uml_parse', { diagram: STATE_DIAGRAM }), 'omitted notation')
  const auto = expectReport(await call('uml_parse', { diagram: STATE_DIAGRAM, notation: 'auto' }), "notation: 'auto'")
  expectDeepEq(omitted, auto, "the declared default 'auto' must be the omitted behaviour")
})

await test('uml_review: omitting `roundTrip` equals the documented default of true', async () => {
  const omitted = expectReport(await call('uml_review', { model: MACHINE }), 'omitted roundTrip')
  const explicit = expectReport(await call('uml_review', { model: MACHINE, roundTrip: true }), 'roundTrip: true')
  expectDeepEq(omitted, explicit, 'the documented default must be the value the reviewer receives')
  expect(omitted.roundTrip !== null && omitted.roundTrip !== undefined, `the fidelity check must have run, got ${show(omitted.roundTrip)}`)
})

await test('uml_review: the nearest counterexample — roundTrip: false drops the fidelity proof', async () => {
  const omitted = expectReport(await call('uml_review', { model: MACHINE }), 'omitted roundTrip')
  const off = expectReport(await call('uml_review', { model: MACHINE, roundTrip: false }), 'roundTrip: false')
  expectDeepEq(off.roundTrip, null, 'without the check there is no fidelity result to report')
  expect(JSON.stringify(off) !== JSON.stringify(omitted), 'turning the check off must change the report')
})

await test('uml_review: omitting `kind` equals the documented default of `state`', async () => {
  const omitted = expectReport(await call('uml_review', { model: MACHINE }), 'omitted kind')
  const explicit = expectReport(await call('uml_review', { model: MACHINE, kind: 'state' }), "kind: 'state'")
  expectDeepEq(omitted, explicit, 'the documented default must be the family the reviewer receives')
})

await test('uml_explain_labels: omitting `notation` equals `auto`, which equals `mermaid`', async () => {
  const omitted = expectReport(await call('uml_explain_labels', {}), 'omitted notation')
  const auto = expectReport(await call('uml_explain_labels', { notation: 'auto' }), "notation: 'auto'")
  const mermaid = expectReport(await call('uml_explain_labels', { notation: 'mermaid' }), "notation: 'mermaid'")
  expectEq(omitted.notation, 'mermaid', 'the label contract is printed for Mermaid unless asked otherwise')
  expectDeepEq(auto, omitted, "the declared default 'auto' must be the omitted behaviour")
  expectDeepEq(mermaid, omitted, "'auto' resolves to mermaid where there is no text to detect from")
})

await test('uml_explain_labels: the nearest counterexample — plantuml has its own label contract', async () => {
  const mermaid = expectReport(await call('uml_explain_labels', { notation: 'mermaid' }), "notation: 'mermaid'")
  const plantuml = expectReport(await call('uml_explain_labels', { notation: 'plantuml' }), "notation: 'plantuml'")
  expectEq(mermaid.directivePrefix, '%%dsh-model-everything:', 'mermaid comments carry the directive')
  expectEq(plantuml.directivePrefix, "'dsh-model-everything:", 'plantuml comments carry the directive')
  // The label forms themselves are notation-independent: only the comment syntax differs, so
  // the case asserts both halves rather than "the two reports differ somewhere".
  expectDeepEq(plantuml.acceptedLabelForms, mermaid.acceptedLabelForms, 'the accepted label spellings are shared across notations')
  expect(JSON.stringify(plantuml.directiveLines) !== JSON.stringify(mermaid.directiveLines), 'the directive examples must follow the notation')
})

await test('uml_structure_verify: omitting `notation` equals `auto`, which reads this PlantUML text', async () => {
  const omitted = expectReport(await call('uml_structure_verify', { diagram: STRUCTURE_DIAGRAM }), 'omitted notation')
  const auto = expectReport(await call('uml_structure_verify', { diagram: STRUCTURE_DIAGRAM, notation: 'auto' }), "notation: 'auto'")
  expectDeepEq(omitted, auto, "the declared default 'auto' must be the omitted behaviour")
  expectEq(omitted.notation, 'plantuml', 'auto detected the notation from the text')
})

// ---------------------------------------------------------------------------
// reportView: the text may change, the answer may not
// ---------------------------------------------------------------------------

for (const [name, argsFor] of Object.entries(VIEW_CASES)) {
  await test(`${name}: reportView changes the body and never the answer`, async () => {
    const args = argsFor()
    const digest = await call(name, args)
    const full = await call(name, { ...args, reportView: 'full' })
    const digestValue = expectReport(digest, `${name} in digest view`)
    const fullValue = expectReport(full, `${name} in full view`)
    expectDeepEq(digestValue, fullValue, `${name}: the canonical value must not depend on reportView`)
    expectEq(digestValue.verdict, fullValue.verdict, `${name}: the verdict must not depend on reportView`)
    expectDeepEq(findingCodes(digestValue), findingCodes(fullValue), `${name}: the finding codes must not depend on reportView`)
    const digestText = digest.content[0]?.text ?? ''
    const fullText = full.content[0]?.text ?? ''
    expectEq(fullText, JSON.stringify(fullValue, null, 2), `${name}: full view prints the structured report verbatim`)
    expect(digestText !== fullText, `${name}: the two views must not render the same text, or the switch does nothing`)
    expect(digestText.length > 0, `${name}: the digest view must not be empty`)
  })
}

await test('reportView: a failing verdict survives the full view on every family that carries one', async () => {
  const failing = [
    ['model_verify', { model: { schemaVersion: 1 } }],
    ['model_concurrency_scan', { text: SCAN_TEXT_ABSOLUTE }],
    ['uml_parse', { diagram: 'sequenceDiagram\n  A->>B: hi\n' }],
    ['uml_review', { model: MACHINE, diagram: WIDER_DIAGRAM }],
    ['uml_structure_verify', {}],
  ]
  for (const [name, args] of failing) {
    const full = await call(name, { ...args, reportView: 'full' })
    const value = expectReport(full, `${name} in full view on a failing input`)
    expectEq(value.verdict, 'fail', `${name}: the full view must not upgrade a failing verdict`)
    expectEq(full.content[0]?.text, JSON.stringify(value, null, 2), `${name}: full view prints the structured report verbatim`)
  }
})

await test('reportView: digest is the shorter view for a checks-report family', async () => {
  const digest = await call('model_verify', { model: MACHINE })
  const full = await call('model_verify', { model: MACHINE, reportView: 'full' })
  const digestText = digest.content[0]?.text ?? ''
  const fullText = full.content[0]?.text ?? ''
  expect(digestText.length < fullText.length, `the digest is the view that costs less, got ${String(digestText.length)} vs ${String(fullText.length)}`)
  expect(digestText.includes('CHECKS'), `the digest still carries the inventory line, got ${show(digestText.slice(0, 160))}`)
})

// PINNED INVERSION. Basis: `renderReportText` (src/report-view.ts) recognizes a `checks[]`
// report, then a `findings[]` report, then a delta, then a payload, and otherwise falls back to
// `renderFallbackReport`, which prints the header plus `JSON.stringify(rest)` COMPACT — while
// `full` prints the same object INDENTED. A small findings-free structure report therefore
// makes the default view larger than the escape hatch. Recorded, not endorsed: this case goes
// red the day the fallback stops costing more than the structured report.
await test('uml_structure_verify: PINNED — on a findings-free report the default view is larger than full', async () => {
  const digest = await call('uml_structure_verify', { diagram: STRUCTURE_DIAGRAM })
  const full = await call('uml_structure_verify', { diagram: STRUCTURE_DIAGRAM, reportView: 'full' })
  const digestText = digest.content[0]?.text ?? ''
  const fullText = full.content[0]?.text ?? ''
  expectEq(fullText, JSON.stringify(full.value, null, 2), 'full view prints the structured report verbatim')
  expect(
    digestText.length > fullText.length,
    `the pinned inversion is gone: the fallback View is now ${String(digestText.length)} chars against ${String(fullText.length)} for full — rewrite this case`,
  )
})

// ---------------------------------------------------------------------------
// verdict against tool failure: three outcomes that must stay distinguishable
// ---------------------------------------------------------------------------

await test('model_concurrency_scan: an absolute claim fails the review but not the call', async () => {
  const res = await call('model_concurrency_scan', { text: SCAN_TEXT_ABSOLUTE })
  const value = expectReport(res, 'a document claiming thread safety')
  expectEq(value.ok, true, 'ok means the tool ran')
  expectEq(value.ran, true, 'the scan ran')
  expectEq(value.verdict, 'fail', 'an absolute concurrency claim needs dedicated verification')
  expectEq(value.findings[0]?.code, 'CONCURRENCY_ABSOLUTE_CLAIM', 'the error finding names the claim')
  expectEq(value.findings[0]?.severity, 'error', 'an absolute claim is an error, not a note')
  expectEq(value.summary.absoluteClaims, 1, 'the summary counts it once')
})

await test('model_concurrency_scan: the nearest case — the same subject without the claim passes', async () => {
  const value = expectReport(await call('model_concurrency_scan', { text: SCAN_TEXT_PLAIN }), 'a sequential sentence')
  expectEq(value.verdict, 'pass', 'nothing was claimed, so nothing failed')
  expectEq(value.findings.length, 0, 'no finding is invented')
  expectEq(value.summary.absoluteClaims, 0, 'no absolute claim was counted')
})

await test('model_concurrency_scan: a hedged keyword lands between the two, as pass_with_findings', async () => {
  const value = expectReport(await call('model_concurrency_scan', { text: SCAN_TEXT_KEYWORD }), 'a shared-state sentence')
  expectEq(value.verdict, 'pass_with_findings', 'a keyword is not a proof claim')
  expectEq(value.findings[0]?.code, 'CONCURRENCY_KEYWORD', 'the warning names the term')
  expectEq(value.findings[0]?.severity, 'warning', 'a term to review is a warning')
})

await test('model_verify: a schema-rejected model is a returned report, not a tool error', async () => {
  const res = await call('model_verify', { model: 'not-an-object' })
  const value = expectReport(res, 'a model that is not an object')
  expectEq(value.ok, false, 'the tool could not answer')
  expectEq(value.ran, true, 'the engine did run: this is a validation result, not a refusal')
  expectEq(value.verdict, 'fail', 'an unverifiable model does not pass')
  expectEq(value.schema, 'model-everything/verify/v1', 'the report keeps the family schema')
  expectEq(value.checks.length, 1, `only the validation check can run, got ${show(value.checks.map((check) => check.id))}`)
  expectEq(value.checks[0]?.id, 'MODEL', 'the single check is model validation')
  expectEq(value.checks[0]?.status, 'fail', 'and it fails')
  expectEq(value.checks[0]?.findings[0]?.code, 'MODEL_INVALID', 'the finding code is the schema refusal')
  expectEq(value.summary.checksRun, 0, 'no S/A check ran against a model that does not validate')
  expectEq(value.modelHash, '', 'there is no hash of a model that was never accepted')
})

await test('model_verify: the nearest case — a valid model runs the checks instead', async () => {
  const value = expectReport(await call('model_verify', { model: MACHINE }), 'a valid machine')
  expectEq(value.ok, true, 'the tool answered')
  expect(value.checks.length > 1, `the structural and adversarial checks must run, got ${show(value.checks.map((check) => check.id))}`)
  expect(value.checks.some((check) => check.id === 'S1'), 'the structural checks are present')
  expectEq(findingCodes(value).includes('MODEL_INVALID'), false, 'a valid model produces no schema refusal')
  expectEq(value.modelHash.length, 64, 'an accepted model is hashed')
})

await test('model_verify: an undeclared field is a schema refusal naming the field', async () => {
  const value = expectReport(await call('model_verify', { model: { ...MACHINE, bogus: true } }), 'a model with an undeclared field')
  expectEq(value.ok, false, 'the schema is closed, as the tool description says')
  expectEq(value.checks[0]?.findings[0]?.code, 'MODEL_INVALID', 'the refusal code')
  expect(
    typeof value.checks[0]?.findings[0]?.message === 'string' && value.checks[0].findings[0].message.includes('bogus'),
    `the message must name the undeclared field, got ${show(value.checks[0]?.findings[0]?.message)}`,
  )
})

await test('a tool error, a refusal and a failed review are three different outcomes', async () => {
  const argumentError = await call('model_verify', {})
  expectEq(argumentError.isError, true, 'the argument layer fails the call before any body runs')
  expectEq(argumentError.error?.info?.code, 'INVALID_ARGS', 'and its code is the argument code')
  expectEq(argumentError.value, undefined, 'no report exists for a call that never ran')

  const refusal = await call('model_export', { model: 'nope', format: 'tla' })
  const refused = expectReport(refusal, 'an unexportable model')
  expectEq(refused.ran, false, 'a refusal did not run the exporter')
  expectEq(refused.errorCode, 'MODEL_INVALID', 'the refusal names why')
  expectEq(refused.schema, 'model-everything/export/v1', 'and keeps the family schema')
  expectEq(typeof refused.error, 'string', 'a refusal carries the reason as text')

  const review = expectReport(await call('model_verify', { model: 'not-an-object' }), 'a schema-rejected model')
  expectEq(review.ran, true, 'the engine ran and reported')
  expectEq(review.errorCode, undefined, 'a completed review is not a refusal')

  expect(argumentError.isError !== refusal.isError, 'a refusal is not a tool error')
  expect(refused.ran !== review.ran, 'a refusal is not a completed review')
})

// ---------------------------------------------------------------------------
// Which input answered: model, diagram, or both
// ---------------------------------------------------------------------------

await test('uml_review: a model alone is reviewed as a model, with the diagram it draws', async () => {
  const value = expectReport(await call('uml_review', { model: MACHINE }), 'a model alone')
  expectEq(value.source, 'model', 'the report says the model answered it')
  expectEq(typeof value.primary, 'string', 'the model is drawn, so primary carries the diagram')
})

await test('uml_review: a diagram alone is read as a diagram, and fidelity is declared unproven', async () => {
  const value = expectReport(await call('uml_review', { diagram: STATE_DIAGRAM }), 'a diagram alone')
  expectEq(value.source, 'diagram', 'the report says the diagram answered it')
  expectEq(value.primary, undefined, 'nothing was drawn from a model')
  expect(
    findingCodes(value).includes('UML018_FIDELITY_UNCHECKED'),
    `a diagram with no model beside it must say fidelity is unproven, got ${show(findingCodes(value))}`,
  )
})

await test('uml_review: both inputs are compared, and source says so', async () => {
  const value = expectReport(await call('uml_review', { model: MACHINE, diagram: STATE_DIAGRAM }), 'a model and its diagram')
  expectEq(value.source, 'model+diagram', 'the report says both answered it')
})

await test('uml_review: the nearest case — a diagram that does not carry the model fails the comparison', async () => {
  const together = expectReport(await call('uml_review', { model: MACHINE, diagram: WIDER_DIAGRAM }), 'a mismatched pair')
  expectEq(together.verdict, 'fail', 'a diagram that invents a state is a defect')
  expect(
    findingCodes(together).includes('UML017_ROUND_TRIP_MISMATCH'),
    `the mismatch must be named, got ${show(findingCodes(together))}`,
  )
  const alone = expectReport(await call('uml_review', { diagram: WIDER_DIAGRAM }), 'the same diagram alone')
  expectEq(alone.verdict, 'pass', 'read on its own terms the same diagram is well formed')
  expectEq(
    findingCodes(alone).includes('UML017_ROUND_TRIP_MISMATCH'),
    false,
    'fidelity cannot be reported against a model the caller did not provide',
  )
})

await test('uml_parse: the family is detected from the text, and a family with no machine is refused by code', async () => {
  const parsed = expectReport(await call('uml_parse', { diagram: STATE_DIAGRAM }), 'a state diagram')
  expectEq(parsed.family, 'state', 'the family is reported')
  expectEq(parsed.kind, 'state', 'and so is the diagram kind')
  expectEq(parsed.errorCode, undefined, 'a readable machine is not a refusal')
  expect(parsed.model !== undefined, 'the model is returned for the verification engine')

  const refused = expectReport(await call('uml_parse', { diagram: 'sequenceDiagram\n  A->>B: hi\n' }), 'a sequence diagram')
  expectEq(refused.errorCode, 'UML_NOT_A_STATE_DIAGRAM', 'a trace cannot reconstruct a machine, and the code says which refusal')
  expectEq(refused.ran, false, 'the parser refused rather than guessed')
  expectEq(refused.kind, undefined, 'a refused parse reports no diagram kind it did not read')
})

await test('uml_parse: an empty diagram is refused like a missing one, by the same code', async () => {
  const empty = expectReport(await call('uml_parse', { diagram: '' }), 'an empty diagram')
  const prose = expectReport(await call('uml_parse', { diagram: 'hello, not a diagram' }), 'prose')
  expectEq(empty.errorCode, 'UML_INPUT', 'an empty string is not a diagram either')
  expectEq(prose.errorCode, 'UML_INPUT', 'text that is not a diagram is an input refusal')
  expectEq(empty.ran, false, 'nothing ran')
  expectEq(prose.ran, false, 'nothing ran')
})

// ---------------------------------------------------------------------------
// report_diff: the delta and the run it came from
// ---------------------------------------------------------------------------

await test('report_diff: two runs over the same report add nothing', async () => {
  const once = await call('model_verify', { model: ORDERED_MACHINE })
  const value = expectReport(await call('report_diff', { baseline: once.value, current: once.value }), 'a report against itself')
  expectEq(value.verdict, 'pass', 'nothing was added')
  expectEq(value.currentVerdict, 'pass_with_findings', 'the echoed run verdict is kept, not merged into the delta')
  expectEq(value.summary.added, 0, 'no added finding')
  expectEq(value.summary.removed, 0, 'no removed finding')
  expectEq(value.summary.changed, 0, 'no changed finding')
  expect(value.summary.baseline > 0, `the fixture must carry findings for the comparison to mean anything, got ${show(value.summary)}`)
})

await test('report_diff: the nearest counterexample — one new error fails the delta and keeps currentVerdict', async () => {
  const value = expectReport(await call('report_diff', { baseline: REPORT_BASELINE, current: REPORT_CURRENT }), 'a baseline plus one error')
  expectEq(value.verdict, 'fail', 'a new error finding fails the delta')
  expectEq(value.currentVerdict, 'fail', 'and the current run still fails on its own terms')
  expectEq(value.summary.added, 1, 'one finding was added')
  expectEq(value.summary.addedErrors, 1, 'and it is an error')
  expectEq(value.added[0]?.code, 'S1_INVENTED', 'the added finding is the new one')
})

await test('report_diff: a non-report input is refused with a code, not read as a clean delta', async () => {
  // This used to assert `verdict: pass` with `currentVerdict: 'fail'` beside it, on the argument that a
  // reader told to ignore `ok` and read the verdict would still see the failing run. Running the installed
  // plugin showed the opposite: two 'junk' strings answered `verdict: pass`, and `verdict` is the field a
  // reader IS told to act on. A mitigation in a field the reader is told to ignore is not a mitigation.
  const value = expectReport(await call('report_diff', { baseline: 'not a report', current: 'not a report' }), 'two non-reports')
  expectEq(value.ok, false, 'the tool did not produce a report')
  expectEq(value.ran, false, 'and it says so: nothing was compared')
  expectEq(value.verdict, 'fail', 'a refusal is not a pass')
  expectEq(value.errorCode, 'REPORT_INVALID', 'the refusal carries a code to route on')
  expect(
    typeof value.verdictReason === 'string' && value.verdictReason.startsWith('the tool did not run:'),
    `a refusal says it did not run — got ${show(value.verdictReason)}`,
  )
  expect(
    typeof value.verdictReason === 'string' && /not a report/.test(value.verdictReason),
    `the refusal names what was wrong with the input — got ${show(value.verdictReason)}`,
  )
})

await test('report_diff: the nearest case still reports — a real baseline against a partial current report', async () => {
  // The guard must refuse non-reports without refusing partial ones. This is the line: an object with
  // findings and no schema is a report for the purpose of a diff, and the delta still describes it.
  const partial = { findings: [{ check: 'S2', code: 'S2_NO_TRANSITIONS', severity: 'error', message: 'no transitions' }] }
  const value = expectReport(await call('report_diff', { baseline: { findings: [] }, current: partial }), 'a partial current report')
  expectEq(value.ok, true, 'a partial report is comparable')
  expectEq(value.summary.added, 1, 'its finding is the added one')
  expectEq(value.verdict, 'fail', 'and it fails the delta')
})

// ---------------------------------------------------------------------------
// Pinned gaps: the current outcome, with the source reason
// ---------------------------------------------------------------------------

// PINNED GAP. Basis: `model_compose_verify` declares `machines` as `type: 'json'` (no shape
// check) and `runCompositionVerification` (src/engine.ts) opens with
// `machinesInput.forEach(...)` with no array guard, while `compose-tool.ts` has no try/catch.
// A non-array reaches the engine and escapes as a raw TypeError: the call fails, but with no
// `errorCode` a caller can route on. Asserted as-is; the case must be rewritten the day the
// tool refuses this input with a code instead.
await test('model_compose_verify: PINNED — a non-array `machines` escapes as an uncoded failure', async () => {
  const res = await call('model_compose_verify', { machines: 'not-an-array' })
  const error = expectToolError(res, 'machines given as a string')
  expectEq(error?.info, undefined, `the gap is the missing error code; got ${show(error?.info)}`)
  expect(typeof error?.message === 'string' && error.message.length > 0, 'the message must at least say something')
})

await test('model_compose_verify: the nearest case — one machine is refused with a code and a report', async () => {
  const value = expectReport(await call('model_compose_verify', { machines: [MACHINE] }), 'a composition of one machine')
  expectEq(value.ok, false, 'one machine is not a composition')
  expectEq(value.ran, true, 'the engine ran and said so')
  expectEq(value.checks[0]?.id, 'MODEL', 'the validation check carries it')
  expectEq(value.checks[0]?.findings[0]?.code, 'MODEL_INVALID', 'with a routable code')
  expectEq(value.summary.machineCount, 1, 'and the count of accepted machines')
})

// PINNED GAP. Basis: `uml_structure_verify` declares `diagrams` as `type: 'json'`, and
// `reviewGranularity` (src/granularity.ts) starts with `diagrams.map(...)` behind no guard;
// `structure-tool.ts` wraps nothing in try/catch. A non-array therefore escapes as a raw
// TypeError with no code — the one input class this tool does not answer with a report.
await test('uml_structure_verify: PINNED — a non-array `diagrams` escapes as an uncoded failure', async () => {
  const res = await call('uml_structure_verify', { diagrams: 'not-an-array' })
  const error = expectToolError(res, 'diagrams given as a string')
  expectEq(error?.info, undefined, `the gap is the missing error code; got ${show(error?.info)}`)
})

// PINNED GAP, same shape: a level object with no `diagram` reaches `entry.diagram.split(...)`
// inside `reviewGranularity`.
await test('uml_structure_verify: PINNED — a level without `diagram` escapes as an uncoded failure', async () => {
  const res = await call('uml_structure_verify', { diagrams: [{ name: 'top' }] })
  const error = expectToolError(res, 'a level with a name and no diagram')
  expectEq(error?.info, undefined, `the gap is the missing error code; got ${show(error?.info)}`)
})

// PINNED GAP. Basis: `reviewGranularity` hashes each level as `{ name: entry.name, hash }`
// (src/granularity.ts); a level without `name` puts `undefined` into the canonical value,
// which the registry's lossless-JSON output contract rejects. The defect is real and the
// failure is at least coded, but it is the tool's own return value that is malformed.
await test('uml_structure_verify: PINNED — a level without `name` returns a value the output contract rejects', async () => {
  const res = await call('uml_structure_verify', { diagrams: [{ diagram: STRUCTURE_DIAGRAM }] })
  const error = expectToolError(res, 'a level with a diagram and no name')
  expectEq(error?.info?.code, 'INVALID_TOOL_OUTPUT', 'the failure is the output contract, not the input guard')
  expectEq(error?.info?.name, 'ToolOutputError', 'and it names the contract that caught it')
  expect(
    typeof error?.message === 'string' && error.message.includes('lossless JSON'),
    `the reason must be the non-lossless value, got ${show(error?.message)}`,
  )
})

await test('uml_structure_verify: the nearest case — the same level with a name returns a report', async () => {
  const value = expectReport(await call('uml_structure_verify', { diagrams: [{ name: 'top', diagram: STRUCTURE_DIAGRAM }] }), 'a named level')
  expectEq(value.verdict, 'pass', 'a named single level has nothing wrong with it')
  expectEq(value.schema, 'model-everything/granularity/v1', 'and reports the levels schema')
})

// PINNED GAP. Basis: `model_datamodel_verify` declares `copyPairs`, `migrationMappings` and
// `backupPairs` as `type: 'json'`, and `runDataVerification` iterates each one unguarded
// (`(options.migrationMappings ?? []).map(...)` and friends), so a non-array escapes as a raw
// TypeError with no code — while `fieldMapping`, read through `Object.entries`, tolerates the
// same junk. The asymmetry is the gap; the tolerant neighbour is asserted beside it.
await test('model_datamodel_verify: PINNED — a non-array `copyPairs` escapes as an uncoded failure', async () => {
  const res = await call('model_datamodel_verify', { model: DATA_MODEL, copyPairs: 'junk' })
  const error = expectToolError(res, 'copyPairs given as a string')
  expectEq(error?.info, undefined, `the gap is the missing error code; got ${show(error?.info)}`)
})

await test('model_datamodel_verify: PINNED — a non-array `migrationMappings` escapes as an uncoded failure', async () => {
  const res = await call('model_datamodel_verify', { model: DATA_MODEL, migrationMappings: 'junk' })
  const error = expectToolError(res, 'migrationMappings given as a string')
  expectEq(error?.info, undefined, `the gap is the missing error code; got ${show(error?.info)}`)
})

await test('model_datamodel_verify: PINNED — a non-array `backupPairs` escapes as an uncoded failure', async () => {
  const res = await call('model_datamodel_verify', { model: DATA_MODEL, backupPairs: 'junk' })
  const error = expectToolError(res, 'backupPairs given as a string')
  expectEq(error?.info, undefined, `the gap is the missing error code; got ${show(error?.info)}`)
})

await test('model_datamodel_verify: the nearest case — `fieldMapping` takes the same junk and still reports', async () => {
  const value = expectReport(await call('model_datamodel_verify', { model: DATA_MODEL, fieldMapping: 'junk' }), 'fieldMapping given as a string')
  expectEq(value.ok, true, 'this option is read tolerantly')
  expectEq(value.verdict, 'pass', 'and the model itself is fine')
})

// PINNED GAP. Basis: `model_export` declares `model` as `type: 'json'` and `format` as a
// required enum, so a *missing* format is an argument error while an unparseable model is a
// returned refusal; `runDataVerification`'s sibling does the opposite. The two paths are
// asserted together so nobody reads one for the other.
await test('model_export: PINNED — a missing required `format` is a tool error, an unexportable model is a report', async () => {
  const missing = await call('model_export', { model: MACHINE })
  const error = expectToolError(missing, 'no format')
  expectEq(error?.info?.code, 'INVALID_ARGS', 'the argument layer answers first for a missing enum')
  const value = expectReport(await call('model_export', { model: MACHINE, format: 'uppaal' }), 'a real export')
  expectEq(value.format, 'uppaal', 'the export names its target')
  expectEq(typeof value.primary, 'string', 'and carries the generated file')
  expect(value.primary.length > 0, 'the generated file is not empty')
})

await test('model_export: the nearest case — a refused export still answers, with its code', async () => {
  const value = expectReport(await call('model_export', { model: 'nope', format: 'tla' }), 'an unexportable model')
  expectEq(value.ran, false, 'nothing was translated')
  expectEq(value.errorCode, 'MODEL_INVALID', 'the refusal code is the model, not the arguments')
})

// ---------------------------------------------------------------------------
// Scheduling: the concurrency classifier fails closed
// ---------------------------------------------------------------------------

await test('the declared concurrency classifier opts valid calls into a parallel group', () => {
  const mode = runtime.executionMode({ callId: 'schedule-1', name: 'model_verify', arguments: { model: MACHINE }, signal: new AbortController().signal })
  expectDeepEq(mode, { kind: 'parallel' }, 'a validated call is declared concurrency-safe by the tool')
})

await test('the nearest case — invalid arguments are scheduled exclusively rather than in parallel', () => {
  const empty = runtime.executionMode({ callId: 'schedule-2', name: 'model_verify', arguments: {}, signal: new AbortController().signal })
  const wrongType = runtime.executionMode({ callId: 'schedule-3', name: 'model_verify', arguments: { model: MACHINE, maxStates: 'ten' }, signal: new AbortController().signal })
  expectDeepEq(empty, { kind: 'exclusive' }, 'a call that cannot run must not overlap a sibling')
  expectDeepEq(wrongType, { kind: 'exclusive' }, 'nor must one with a wrong-typed argument')
})

await test('the nearest case — an unknown tool is scheduled exclusively', () => {
  const mode = runtime.executionMode({ callId: 'schedule-4', name: 'no_such_tool', arguments: {}, signal: new AbortController().signal })
  expectDeepEq(mode, { kind: 'exclusive' }, 'an unresolvable call is never parallel')
})

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The engine refuses what it cannot read
// ---------------------------------------------------------------------------

// The robustness audit's D6-D12: four entry points answered a question nobody asked. An unknown
// export format was silently written as Promela, an unknown notation was coerced, a diff of nothing
// reported agreement, and two text entry points threw a raw TypeError. None of these is a model
// being wrong - they are the engine being handed something that is not the thing it checks, and the
// answer has to be a code the caller can route on.

await test('model_export: a format the exporter cannot write is refused, not substituted', async () => {
  // `exportModel` used to end with `return exportSpin(ex)`, so every one of these produced Promela
  // with `format: 'spin'` in the report - a different notation's text, and a format nobody asked for.
  for (const format of ['mermaid', 'graphviz', 'SPIN', '', 'spin\n', 42, null]) {
    const res = await call('model_export', { model: MACHINE, format })
    const error = expectToolError(res, `format ${show(format)}`)
    expect(
      typeof error?.info?.code === 'string' && error.info.code.length > 0,
      `format ${show(format)}: a refusal must carry a code, got ${show(error?.info)}`,
    )
  }
  // The nearest miss: each format the exporter does declare still writes its own notation.
  for (const format of ['uppaal', 'tla', 'prism', 'spin']) {
    const value = expectReport(await call('model_export', { model: MACHINE, format }), `format ${format}`)
    expectEq(value.format, format, `format ${format} must be the one that was asked for`)
  }
})

await test('uml_review: a notation that is not a notation is refused, not coerced', async () => {
  for (const notation of ['graphviz', 'dot', 42, '', 'PlantUML']) {
    const res = await call('uml_review', { model: MACHINE, notation })
    const error = expectToolError(res, `notation ${show(notation)}`)
    expect(typeof error?.info?.code === 'string', `notation ${show(notation)}: a refusal must carry a code`)
  }
  // `auto` means decide for me, and a real notation is taken as given.
  expectReport(await call('uml_review', { model: MACHINE, notation: 'auto' }), 'notation auto')
  expectReport(await call('uml_review', { model: MACHINE, notation: 'mermaid' }), 'notation mermaid')
})

await test('report_diff: an absent report and a wrong-typed one are refused the same way', async () => {
  // The false green: with no inputs, every comparison found nothing and the report said the two agree.
  // The absence of an input is not agreement.
  //
  // Both shapes are refusals, not tool errors, and that is the layering this repository draws: a MISSING
  // parameter is the argument layer's tool error (asserted above), while `null` and `'junk'` are values
  // that reach the tool, which then refuses with a code. They used to land in different layers - `null`
  // threw out of execute, a string was reported as a pass - and neither is a shape a caller can route on.
  for (const [label, args] of [
    ['two nulls', { baseline: null, current: null }],
    ['a null current', { baseline: MACHINE, current: null }],
    ['two strings', { baseline: 'not a report', current: 'not a report' }],
    ['a number', { baseline: 5, current: 5 }],
  ]) {
    const value = expectReport(await call('report_diff', args), label)
    expectEq(value.ok, false, `${label}: no report was produced`)
    expectEq(value.ran, false, `${label}: nothing was compared`)
    expectEq(value.verdict, 'fail', `${label}: a refusal is not a pass`)
    expectEq(value.errorCode, 'REPORT_INVALID', `${label}: the refusal carries a code to route on`)
  }
  // And the message distinguishes the two cases, because the fix differs: pass the thing, or pass a report.
  const absent = expectReport(await call('report_diff', { baseline: null, current: null }), 'two nulls')
  const wrong = expectReport(await call('report_diff', { baseline: 'not a report', current: 'not a report' }), 'two strings')
  expect(String(absent.verdictReason).includes('is null'), `an absent report says it is absent — got ${show(absent.verdictReason)}`)
  expect(/not a report/.test(String(wrong.verdictReason)), `a wrong-typed report says what was expected — got ${show(wrong.verdictReason)}`)
})

await test('uml_structure_verify: a diagram that is not text is refused, not thrown', async () => {
  // `reviewStructure({ diagram: 42 })` threw `text.split is not a function`, and `{}` threw a read
  // of `undefined` - a TypeError, which is not something a caller can route on.
  //
  // A MISSING `diagram` is not in this list on purpose: the tool refuses it before the engine sees
  // it, with its own message, and the two refusals belong to different layers. The engine-level shape
  // handling is asserted in tests/engine, where the engine can be called directly.
  for (const diagram of [42, null, {}, []]) {
    const res = await call('uml_structure_verify', { diagram })
    const error = expectToolError(res, `diagram ${show(diagram)}`)
    expect(/diagram/i.test(error.message), `diagram ${show(diagram)}: the refusal must name the argument, got ${error.message}`)
  }
})

if (failures > 0) {
  console.log('tool boundary tests failed:', failures)
  process.exit(1)
}
console.log('all tool boundary tests passed')

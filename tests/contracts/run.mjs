// Report-contract suite: freeze what every engine concludes about a fixed corpus, so a
// change in behaviour has to be looked at instead of merely not breaking a presence check.
//
// Three things are checked per case:
//   1. the report's semantic projection equals the frozen snapshot;
//   2. the model hash equals the frozen hash, so a change to the input is visible too;
//   3. the verdict is what the snapshot says, which is the field a reader acts on.
//
// A snapshot that differs is not a failing review: it means the engine's answer changed.
// Read `snapshot-report.json`'s diff, decide whether the new answer is right, and re-run
// with UPDATE_REPORT_SNAPSHOT=1 to record it. The point is that the decision is taken
// deliberately, once per change, rather than never.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runVerification, runCompositionVerification } from '../../lib/engine.js'
import { runDataVerification } from '../../lib/data-engine.js'
import { renderUml, reviewUml, parseUml } from '../../lib/uml.js'
import { runDesignReview } from '../../lib/design-engine.js'
import { declaredDesign, defectiveDesign, bareDesign, refusedDesign } from '../fixtures/design.mjs'
import { renderReportText } from '../../lib/report-view.js'
import { reviewStructure } from '../../lib/structure.js'
import { reviewGranularity } from '../../lib/granularity.js'
import { runConcurrencyScan } from '../../lib/concurrency.js'
import { exportModel } from '../../lib/exporters.js'
import { diffReports } from '../../lib/baseline.js'

const snapshotPath = fileURLToPath(new URL('./snapshot-report.json', import.meta.url))
const update = process.env.UPDATE_REPORT_SNAPSHOT === '1'

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

const stateMachine = {
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

const narratedMachine = {
  ...stateMachine,
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

// A machine with one defect of each kind the engine can name, so the snapshot holds a
// non-trivial verdict and a non-empty finding list.
const defectiveMachine = {
  schemaVersion: 1,
  init: 'A',
  states: [{ id: 'A' }, { id: 'B' }, { id: 'ORPHAN' }, { id: 'LOOP' }],
  transitions: [
    { from: 'A', event: 'go', to: 'B' },
    { from: 'B', event: 'go', to: 'B' },
    { from: 'B', event: 'spin', to: 'LOOP' },
    { from: 'LOOP', event: 'spin', to: 'LOOP' },
    { from: 'B', event: 'go', to: 'LOOP' },
  ],
  variables: [{ name: 'unused', kind: 'integer', init: 0 }],
}

const dataModel = {
  schemaVersion: 1,
  entities: [
    { name: 'User', fields: [{ name: 'id', type: 'uuid', required: true }, { name: 'email', type: 'string', required: true, unique: true }], primaryKey: ['id'] },
    { name: 'Order', fields: [{ name: 'id', type: 'uuid', required: true }, { name: 'user', type: 'uuid', required: true }], primaryKey: ['id'] },
  ],
  relationships: [{ fromEntity: 'Order', fromField: 'user', toEntity: 'User', toField: 'id', onDelete: 'cascade' }],
  invariants: [{ id: 'counts', description: 'every order has a user', kind: 'count-equal', sourceEntity: 'Order', targetEntity: 'User' }],
}

const useCaseModel = {
  schemaVersion: 1,
  actors: [{ id: 'Customer' }, { id: 'Admin' }],
  useCases: [{ id: 'Login', label: 'Log in' }, { id: 'Audit' }],
  relations: [
    { from: 'Customer', to: 'Login', kind: 'association' },
    { from: 'Admin', to: 'Audit', kind: 'association' },
  ],
}

const timingModel = {
  schemaVersion: 1,
  unit: 'ms',
  lifelines: [{ id: 'WU', label: 'Web User', kind: 'concise' }, { id: 'WB', label: 'Web Browser', kind: 'robust' }],
  states: [{ id: 'Idle' }, { id: 'Waiting', label: 'waiting for a URL' }],
  segments: [
    { lifeline: 'WB', state: 'Idle', from: 0, atStart: true },
    { lifeline: 'WU', state: 'Idle', from: 0, atStart: true },
    { lifeline: 'WU', state: 'Waiting', from: 100 },
  ],
  messages: [{ from: 'WU', to: 'WB', time: 100, label: 'URL' }],
  constraints: [{ fromTime: 100, toTime: 250, label: '{150 ms}' }],
}

const profileModel = {
  schemaVersion: 1,
  profile: { id: 'EJBP', label: 'EJB Profile' },
  stereotypes: [{ id: 'EJB', label: 'EJB' }, { id: 'Stateless', label: 'Stateless' }],
  metaclasses: [{ id: 'Component', label: 'Component' }, { id: 'Class', label: 'Class' }],
  extensions: [{ stereotype: 'EJB', metaclass: 'Component', multiplicity: '0..1', label: 'base' }],
  applications: [{ profile: 'EJBP', applyTo: 'Shop' }],
  generalizations: [{ general: 'EJB', specific: 'Stateless' }],
}

/** What a reader acts on, plus the wording of every finding. Evidence is left out: it is
 *  the input, and the model hash below is what pins that. */
function projection(report) {
  const finding = (entry) => ({
    code: entry.code,
    severity: entry.severity,
    message: entry.message,
    ...(entry.detail === undefined ? {} : { detail: entry.detail }),
  })
  // The engine nests its findings inside each check, and which check is failing is the
  // first thing a reader of a failing report looks for. Freezing the whole report as one
  // body string would hide exactly that.
  const checks = report.checks === undefined ? undefined : report.checks.map((check) => ({
    id: check.id,
    status: check.status,
    summary: check.summary,
    findings: (check.findings ?? []).map(finding),
  }))
  return {
    ok: report.ok,
    ran: report.ran,
    // A refusal's code is the field a caller acts on.
    ...(report.errorCode === undefined ? {} : { errorCode: report.errorCode }),
    verdict: report.verdict,
    verdictReason: report.verdictReason,
    schema: report.schema,
    modelHash: report.modelHash ?? report.hashes?.modelHash,
    summary: report.summary,
    ...(checks === undefined ? {} : { checks }),
    findings: (report.findings ?? []).map(finding),
    ...(report.family === undefined ? {} : { family: report.family, source: report.source }),
    ...(report.roundTrip === undefined || report.roundTrip === null ? {} : { roundTrip: { ok: report.roundTrip.ok, diffs: report.roundTrip.diffs } }),
    nextSteps: report.nextSteps,
    // The domains that answer with their own shape: an export carries its payload, a
    // report diff carries the delta. Freeze what a caller acts on there too.
    ...(report.format === undefined ? {} : { format: report.format, payloadLength: (report.primary ?? '').length }),
    ...(report.summary?.added === undefined && report.added === undefined ? {} : {
      delta: {
        added: (report.added ?? report.summary?.added ?? []).map((entry) => entry.code ?? entry),
        removed: (report.removed ?? report.summary?.removed ?? []).map((entry) => entry.code ?? entry),
        changed: (report.changed ?? report.summary?.changed ?? []).map((entry) => entry.code ?? entry),
      },
    }),
    // The rendered body is part of the contract a caller reads.
    body: renderReportText(report),
  }
}

// The tool layer is where four defects lived: the bodies, the refusals and the shapes a caller reads. A contract
// snapshot that only freezes the engines cannot see them. These cases call the tools' own `execute`, so they need
// `@deepseek-ai/dsh-tools` (a devDependency) - loaded the way tests/uml loads it, with a visible skip.
let toolCases = {}
try {
  const [umlTool, exportTool, structureTool, verifyTool, diffTool] = await Promise.all([
    import('../../lib/uml-tool.js'), import('../../lib/export-tool.js'), import('../../lib/structure-tool.js'),
    import('../../lib/tool.js'), import('../../lib/report-diff-tool.js'),
  ])
  toolCases = {
    'uml parse: a hand-drawn state diagram': () => umlTool.umlParseTool.execute({ diagram: stateDiagramText, notation: 'mermaid' }),
    // The output side: `uml_render` is the only tool that returns a payload nobody has frozen, and its warnings are
    // what tell a reader the drawing is an approximation.
    'uml render: a state machine to mermaid': () => umlTool.umlRenderTool.execute({ model: stateMachine, kind: 'state', notation: 'mermaid' }),
    'uml render: a family the notation only approximates': () => umlTool.umlRenderTool.execute({ model: communicationModel, kind: 'communication', notation: 'plantuml' }),
    // The tool's parameter is `kind`; the engine option is `diagramKind`. A snapshot of the tool layer is the only
    // thing that can tell those apart, which is how this session's own `diagramKind` mistake went unnoticed.
    'uml review: a communication model through the tool': () => umlTool.umlReviewTool.execute({ model: communicationModel, kind: 'communication' }),
    'uml review: a model from another family': () => umlTool.umlReviewTool.execute({ model: { schemaVersion: 1, architecture: { nodes: ['a', 'b'], edges: [['a', 'b']] } }, kind: 'communication' }),
    'structure: a component diagram through the tool': () => structureTool.umlStructureTool.execute({ diagram: structureDiagram }),
    'structure: two levels through the tool': () => structureTool.umlStructureTool.execute({ diagrams: [{ name: 'system', diagram: structureDiagram }, { name: 'core', parent: 'system', diagram: coreDiagram }] }),
    'export: a model too large for the prism encoding': () => exportTool.modelExportTool.execute({ model: wideVariables, format: 'prism' }),
    // A refusal at the tool boundary: the option is declared `json`, so the tool is the only layer that can refuse a
    // shape the engine would silently read as identity. `errorCode` is in the projection for exactly this.
    'verify: a stateMapping the tool refuses': () => verifyTool.modelVerifyTool.execute({ model: stateMachine, beforeModel: stateMachine, stateMapping: 'INIT=STARTING' }),
    // `report_diff` is a tool with no engine of its own: it reads two reports and renders a delta, and both halves of
    // that were wrong until this session.
    'report diff: a clean delta through the tool': () => diffTool.reportDiffTool.execute({ baseline: runVerification(stateMachine), current: runVerification(stateMachine) }),
    'report diff: an escalation through the tool': () => diffTool.reportDiffTool.execute({ baseline: escalatingBaseline, current: escalatingCurrent }),
  }
} catch (error) {
  console.log('SKIP tool-layer contract cases: the dsh tool modules did not load (' + (error instanceof Error ? error.message : String(error)) + ')')
}

// Two machines that are both ready for `go`: the composition cases need a rendezvous that can fire, and a name
// nothing declares, which is the C2 finding the engine started reporting when the option stopped being ignored.
const leftMachine = { schemaVersion: 1, init: 'IDLE', states: [{ id: 'IDLE' }, { id: 'RUNNING', terminal: true }], transitions: [{ from: 'IDLE', event: 'go', to: 'RUNNING' }] }
const rightMachine = { schemaVersion: 1, init: 'WAIT', states: [{ id: 'WAIT' }, { id: 'DONE', terminal: true }], transitions: [{ from: 'WAIT', event: 'go', to: 'DONE' }] }
// Two reports that differ in one thing: a finding that keeps its evidence and moves from warning to error.
const escalatingBaseline = {
  schema: 'model-everything/verify/v1',
  ran: true,
  ok: true,
  verdict: 'pass_with_findings',
  verdictReason: 'no error findings; 1 warning finding(s)',
  summary: { checksRun: 1 },
  checks: [{ id: 'S5', name: 'Event Completeness', status: 'fail', detail: '', findings: [{ code: 'S5_UNHANDLED_EVENT', severity: 'warning', message: 'A silently ignores event stop', evidence: { state: 'A', event: 'stop' } }] }],
}
const escalatingCurrent = {
  ...escalatingBaseline,
  verdict: 'fail',
  verdictReason: '1 error finding(s)',
  checks: [{ id: 'S5', name: 'Event Completeness', status: 'fail', detail: '', findings: [{ code: 'S5_UNHANDLED_EVENT', severity: 'error', message: 'A silently ignores event stop', evidence: { state: 'A', event: 'stop' } }] }],
}
const communicationModel = {
  schemaVersion: 1,
  lifelines: [{ id: 'C', classifier: 'Customer' }, { id: 'O', classifier: 'Order' }],
  links: [{ from: 'C', to: 'O' }],
  messages: [{ sequence: '1', from: 'C', to: 'O', label: 'create' }],
}
const structureDiagram = ['@startuml', 'component [UI] as UI', 'component [Core] as Core', 'component [Island] as Island', 'UI --> Core', 'Core --> UI', '@enduml'].join('\n')
const coreDiagram = ['@startuml', 'component [Cache] as Cache', 'component [Store] as Store', 'Cache --> Store', 'Cache --> UI', '@enduml'].join('\n')
const stateDiagramText = ['stateDiagram-v2', '  [*] --> Idle', '  Idle --> BUSY : go', '  BUSY --> Idle', '  BUSY --> [*]'].join('\n')
const wideVariables = {
  schemaVersion: 1,
  init: 'A',
  states: [{ id: 'A' }, { id: 'B', terminal: true }],
  transitions: [{ from: 'A', event: 'go', to: 'B' }],
  variables: [
    { name: 'x', kind: 'integer', init: 0, min: 0, max: 200 },
    { name: 'y', kind: 'integer', init: 0, min: 0, max: 200 },
  ],
}

const cases = {
  'verify: a machine with a narrative': () => runVerification(narratedMachine, {}),
  'verify: a machine with one defect of each kind': () => runVerification(defectiveMachine, {}),
  'verify: the same machine after a refactor, with regression': () => runVerification(stateMachine, { beforeModel: narratedMachine, stateMapping: { INIT: 'INIT', STARTING: 'STARTING', ACTIVE: 'ACTIVE', ERROR: 'ERROR', FATAL: 'FATAL' } }),
  'verify: a model the schema refuses': () => runVerification({ schemaVersion: 9 }, {}),
  'compose: two machines that rendezvous': () => runCompositionVerification([leftMachine, rightMachine], { rendezvous: ['go'] }),
  'compose: a rendezvous name nothing declares': () => runCompositionVerification([leftMachine, rightMachine], { rendezvous: ['go', 'typo'] }),
  'datamodel: a valid model': () => runDataVerification(dataModel),
  'datamodel: a migration with no mapping': () => runDataVerification(
    { ...dataModel, entities: [{ name: 'User', fields: [{ name: 'id', type: 'uuid', required: true }, { name: 'fullName', type: 'string', required: true }], primaryKey: ['id'] }] },
    { beforeModel: dataModel },
  ),
  'uml: a use case model': () => reviewUml({ model: useCaseModel, diagramKind: 'use-case' }),
  'uml: a hand-written use case diagram': () => reviewUml({ diagram: ['@startuml', ':Customer: --> (Login)', '(Audit)', '@enduml'].join('\n') }),
  'uml: a timing model': () => reviewUml({ model: timingModel, diagramKind: 'timing' }),
  'uml: the timing diagram it renders': () => reviewUml({ diagram: renderUml(timingModel, 'plantuml', 'timing').primary }),
  'uml: a profile model': () => reviewUml({ model: profileModel, diagramKind: 'profile' }),
  'uml: a state diagram read back': () => reviewUml({ diagram: renderUml(stateMachine, 'mermaid', 'state').primary }),
  'structure: a component diagram with a cycle and an isolated node': () => reviewStructure({ diagram: ['@startuml', 'component [A] as A', 'component [B] as B', 'component [C] as C', 'A --> B', 'B --> A', '@enduml'].join('\n') }),
  'structure: a matrix that forbids the edge the diagram draws': () => reviewStructure({
    diagram: ['@startuml', 'component [UI] as UI', 'component [DB] as DB', 'UI --> DB', '@enduml'].join('\n'),
    matrix: { rules: [{ id: 'no-direct', source: 'UI', deny: ['DB'] }], default: 'allow' },
  }),
  'granularity: a child that does not refine its parent': () => reviewGranularity({
    diagrams: [
      { name: 'system', diagram: ['@startuml', 'component [UI] as UI', 'component [Core] as Core', 'UI --> Core', '@enduml'].join('\n') },
      { name: 'core', parent: 'system', diagram: ['@startuml', 'component [Cache] as Cache', 'component [Store] as Store', 'Cache --> Store', 'Cache --> UI', '@enduml'].join('\n') },
    ],
  }),
  'concurrency: a document full of absolute claims': () => runConcurrencyScan('The cache is thread-safe and lock-free. Shared state is protected by a mutex. The ISR-safe path touches no shared memory.'),
  'export: a verified machine to spin': () => exportModel(stateMachine, 'spin'),
  'export: a model the schema refuses': () => exportModel({ schemaVersion: 9 }, 'tla'),
  'report diff: a machine against its own refactor': () => diffReports(
    runVerification(narratedMachine, {}),
    runVerification(stateMachine, { beforeModel: narratedMachine, stateMapping: { INIT: 'INIT', STARTING: 'STARTING', ACTIVE: 'ACTIVE', ERROR: 'ERROR', FATAL: 'FATAL' } }),
  ),
  'design: a layered design that keeps every declaration': () => runDesignReview(declaredDesign),
  'design: a design that contradicts its declarations': () => runDesignReview(defectiveDesign),
  'design: a design that declares nothing but a graph': () => runDesignReview(bareDesign),
  'design: a model the schema refuses': () => runDesignReview(refusedDesign),
  ...toolCases,
}

const current = {}
for (const [name, build] of Object.entries(cases)) {
  let report
  try {
    report = await build()
  } catch (error) {
    report = { ok: false, ran: false, verdict: 'fail', verdictReason: 'threw: ' + (error instanceof Error ? error.message : String(error)), schema: 'none', summary: {}, findings: [], nextSteps: [] }
  }
  current[name] = projection(report)
}

if (update || !existsSync(snapshotPath)) {
  writeFileSync(snapshotPath, JSON.stringify(current, null, 2) + '\n', 'utf8')
  console.log(update ? 'snapshot updated:' : 'snapshot created:', snapshotPath)
}

const frozen = JSON.parse(readFileSync(snapshotPath, 'utf8'))

test('every frozen case still exists', () => {
  const missing = Object.keys(frozen).filter((name) => !(name in current))
  if (missing.length > 0) throw new Error('snapshot cases with no builder: ' + missing.join(' | '))
  const added = Object.keys(current).filter((name) => !(name in frozen))
  if (added.length > 0) throw new Error('cases with no frozen answer (re-run with UPDATE_REPORT_SNAPSHOT=1 after reading them): ' + added.join(' | '))
})

for (const name of Object.keys(frozen)) {
  test('report contract: ' + name, () => {
    const want = frozen[name]
    const got = current[name]
    if (got === undefined) throw new Error('no report built for this case')
    if (JSON.stringify(got) === JSON.stringify(want)) return
    // Name the field that moved, and how, rather than dumping two objects.
    const lines = []
    for (const key of new Set([...Object.keys(want), ...Object.keys(got)])) {
      const left = JSON.stringify(want[key])
      const right = JSON.stringify(got[key])
      if (left === right) continue
      lines.push('  ' + key + ':\n    frozen: ' + String(left).slice(0, 400) + '\n    now:    ' + String(right).slice(0, 400))
    }
    throw new Error('the engine answers differently now:\n' + lines.join('\n'))
  })
}

test('report contract: the projection drops nothing a reader acts on', () => {
  const keys = new Set(Object.keys(current['verify: a machine with a narrative']))
  for (const required of ['ok', 'ran', 'verdict', 'verdictReason', 'schema', 'modelHash', 'summary', 'findings', 'nextSteps', 'body']) {
    if (!keys.has(required)) throw new Error('the projection is missing ' + required)
  }
})

test('report contract: the corpus reaches more than one verdict', () => {
  const verdicts = new Set(Object.values(current).map((report) => report.verdict))
  if (verdicts.size < 2) throw new Error('a corpus that only ever says one thing proves little: ' + JSON.stringify([...verdicts]))
})

if (failures > 0) {
  console.log('report contract tests failed:', failures)
  process.exit(1)
}
console.log('all report contract tests passed')

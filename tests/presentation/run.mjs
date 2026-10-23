// The card a UI shows, kept apart from the text the model reads.
//
// What is being checked is not "the meta exists". It is that the two views disagree on purpose: the
// model-facing render keeps every check, the card keeps four lines, and a replayed payload that has lost
// fields renders instead of throwing.
import { cardBlocks, reportCard, reportResultView } from '../../lib/presentation.js'
import { verifyAutomaton } from '../../lib/automaton.js'
import { MODEL_AUTOMATON_TOOL_NAME, modelAutomatonTool } from '../../lib/automaton-tool.js'
import { MODEL_VERIFY_TOOL_NAME, modelVerifyTool } from '../../lib/tool.js'
import { STRUCTURE_TOOL_NAME, umlStructureTool } from '../../lib/structure-tool.js'
import { modelEditTool } from '../../lib/edit-tool.js'
import { reportDiffTool } from '../../lib/report-diff-tool.js'

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

const failing = {
  verdict: 'fail',
  verdictReason: '1 error finding(s) (first: A3_LEADS_TO)',
  findings: [
    { code: 'A3_LEADS_TO', severity: 'error', message: 'the order never completes' },
    { code: 'A12_BUDGET', severity: 'warning', message: 'worst path 52 against a budget of 40' },
  ],
  summary: { checksRun: 7 },
  nextSteps: ['Resolve the failing checks first: leads-to (A3).'],
}

test('the card keeps the verdict, the counts and the first error', () => {
  const card = reportCard(failing, 'model_verify')
  if (card.verdict !== 'fail') throw new Error('verdict lost')
  if (card.errors !== 1 || card.warnings !== 1) throw new Error('counts wrong: ' + JSON.stringify(card))
  if (card.first?.code !== 'A3_LEADS_TO') throw new Error('first finding is the error, not the warning')
  if (card.checksRun !== 7) throw new Error('checksRun lost')
})

test('the card is four lines, not the report', () => {
  const text = cardBlocks(reportCard(failing, 'model_verify')).map((block) => block.text ?? '').join('\n')
  const lines = text.split('\n')
  if (lines.length > 5) throw new Error('the card grew into a report: ' + String(lines.length) + ' lines')
  if (!/A3_LEADS_TO/.test(text)) throw new Error('the first finding is missing from the card')
  if (/A12_BUDGET/.test(text)) throw new Error('a warning is not the first thing a card shows when an error exists')
})

test('a replayed payload with fields missing renders instead of throwing', () => {
  const card = reportCard({ verdict: 'pass' }, 'model_verify')
  if (card.errors !== 0 || card.first !== null || card.next !== null) throw new Error('partial payload produced ' + JSON.stringify(card))
  const view = reportResultView('model_verify')({}, { content: [], meta: card })
  if (view === undefined) throw new Error('a partial payload must still render')
})

test('no meta at all falls back to the raw content', () => {
  const view = reportResultView('model_verify')({}, { content: [] })
  if (view !== undefined) throw new Error('without meta the host must render the raw result')
})

test('every report tool in the plugin declares both hooks', async () => {
  // Read the modules rather than a list written here: a tool added later must not be able to skip the
  // card, and a list in the test is exactly how it would.
  const modules = ['automaton-tool', 'compose-tool', 'concurrency-tool', 'data-tool', 'design-tool', 'edit-tool', 'export-tool', 'report-diff-tool', 'structure-tool', 'uml-tool', 'tool']
  const missing = []
  for (const file of modules) {
    const mod = await import('../../lib/' + file + '.js')
    for (const value of Object.values(mod)) {
      if (value === null || typeof value !== 'object') continue
      if (typeof value.name !== 'string' || value.output === undefined) continue
      if (typeof value.output.presentationMeta !== 'function') missing.push(value.name + ' (presentationMeta)')
      if (typeof value.presentResult !== 'function') missing.push(value.name + ' (presentResult)')
    }
  }
  if (missing.length > 0) throw new Error('no card: ' + missing.join(', '))
})

test('the card comes from the report, never from a second render', () => {
  const automaton = {
    states: ['s0', 's1'],
    alphabet: ['a'],
    transitions: [
      { from: 's0', symbol: 'a', to: 's1' },
      { from: 's1', symbol: 'a', to: 's1' },
    ],
    init: 's0',
    accepting: ['s1'],
  }
  const args = { automaton }
  const report = verifyAutomaton(automaton)
  const meta = modelAutomatonTool.output.presentationMeta(args, report)
  if (meta.verdict !== report.verdict) throw new Error('the card and the report disagree on the verdict')
  const view = modelAutomatonTool.presentResult(args, { content: [], meta })
  if (view === undefined || view.card !== 'generic') throw new Error('presentResult returned no card')
})


test('the pending card names the artifact and the file to follow', () => {
  const view = modelEditTool.presentCall({ modelPath: 'F:/repo/examples/order.json', ops: [{ addState: 'x' }] })
  if (view === undefined) throw new Error('no call card for a valid call')
  if (!String(view.title).includes('order.json')) throw new Error('the title does not name the file: ' + String(view.title))
  if (view.kind !== 'edit') throw new Error('model_edit should carry kind edit, got ' + String(view.kind))
  if (JSON.stringify(view.locations) !== JSON.stringify([{ path: 'F:/repo/examples/order.json' }])) throw new Error('no follow-along location')
})

test('a call that cannot be validated shows no card of its own', () => {
  // defineTool validates before the presenter runs, so a malformed call falls back to the raw presentation
  // rather than to a title computed from arguments the tool would refuse.
  const view = modelEditTool.presentCall({})
  if (view !== undefined) throw new Error('an invalid call produced a card')
})

test('the edit card lists the changes and the delta', () => {
  const meta = {
    verdict: 'fail',
    errors: 1,
    warnings: 0,
    first: null,
    next: 'fix the budget',
    family: 'model_edit',
    changes: [{ kind: 'added', what: 'state waiting' }, { kind: 'removed', what: 'transition idle + go' }],
    delta: { added: 2, removed: 1, changed: 0, addedErrors: 1 },
  }
  const view = modelEditTool.presentResult({ modelPath: 'x.json', ops: [{ addState: 'a' }] }, { content: [], meta })
  const text = JSON.stringify(view)
  if (!text.includes('state waiting')) throw new Error('the change is missing from the card')
  if (!text.includes('added 2')) throw new Error('the delta is missing from the card')
})

test('the diff card leads with the delta, not with the current verdict', () => {
  const meta = {
    verdict: 'fail',
    errors: 1,
    warnings: 0,
    first: null,
    next: 'accept or fix',
    family: 'report_diff',
    delta: { added: 1, removed: 0, changed: 0, addedErrors: 1 },
    firstAdded: { code: 'A12_BUDGET', severity: 'error', message: 'budget 5 exceeded' },
    currentVerdict: 'fail',
  }
  const view = reportDiffTool.presentResult({ baseline: {}, current: {} }, { content: [], meta })
  const text = view.content.map((block) => block.text ?? '').join(String.fromCharCode(10))
  if (!/^FAIL\s+—\s+added 1/.test(text)) throw new Error('the card does not lead with the delta: ' + text)
  if (!text.includes('A12_BUDGET')) throw new Error('the first added finding is missing')
  if (!text.includes('current report on its own')) throw new Error('the current verdict is not distinguished from the delta')
})

test('a diff with nothing added says so', () => {
  const meta = { verdict: 'pass', errors: 0, warnings: 0, first: null, next: 'none', family: 'report_diff', delta: { added: 0, removed: 2, changed: 1, addedErrors: 0 } }
  const view = reportDiffTool.presentResult({ baseline: {}, current: {} }, { content: [], meta })
  if (!JSON.stringify(view).includes('nothing was added')) throw new Error('an empty delta should say the slice is accepted')
})


test('an export card previews the artifact and says how much it left out', async () => {
  const { modelExportTool } = await import('../../lib/export-tool.js')
  const model = { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }] }
  const args = { model, format: 'tla' }
  const report = await modelExportTool.execute(args)
  const meta = modelExportTool.output.presentationMeta(args, report)
  if (meta.source === undefined) throw new Error('the artifact is not previewed')
  if (meta.source.total < meta.source.lines.length) throw new Error('the preview claims more lines than the artifact has')
  const view = modelExportTool.presentResult(args, { content: [], meta })
  if (!JSON.stringify(view).includes('MODULE')) throw new Error('the preview does not show the artifact')
})


test('the card and the report agree on the verdict, family by family', async () => {
  // The rule every card follows: it renders the same computation. A card that recomputed anything could
  // disagree with the report it accompanies, and the reader would have no way to tell which is right.
  const machine = { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }] }
  const calls = [
    ['../../lib/tool.js', 'modelVerifyTool', { model: machine }],
    ['../../lib/compose-tool.js', 'modelComposeTool', { machines: [machine, machine] }],
    ['../../lib/data-tool.js', 'modelDataModelVerifyTool', { model: { entities: [{ name: 'User', fields: [{ name: 'id', type: 'string' }], primaryKey: ['id'] }] } }],
    ['../../lib/structure-tool.js', 'umlStructureTool', { diagram: 'component a\ncomponent b\na --> b\n' }],
    ['../../lib/design-tool.js', 'designTool', { model: { schemaVersion: 1, architecture: { nodes: ['a', 'b'], edges: [['a', 'b']] } } }],
    ['../../lib/concurrency-tool.js', 'modelConcurrencyScanTool', { text: 'The queue is thread-safe.' }],
    ['../../lib/automaton-tool.js', 'modelAutomatonTool', { automaton: { states: ['s0', 's1'], alphabet: ['a'], transitions: [{ from: 's0', symbol: 'a', to: 's1' }, { from: 's1', symbol: 'a', to: 's1' }], init: 's0', accepting: ['s1'] } }],
    ['../../lib/export-tool.js', 'modelExportTool', { model: machine, format: 'tla' }],
    ['../../lib/uml-tool.js', 'umlRenderTool', { model: machine, notation: 'mermaid' }],
  ]
  const disagreements = []
  for (const [modulePath, exportName, args] of calls) {
    const tool = (await import(modulePath))[exportName]
    const report = await tool.execute(args)
    const meta = tool.output.presentationMeta(args, report)
    if (meta.verdict !== report.verdict) disagreements.push(exportName + ': card ' + String(meta.verdict) + ' vs report ' + String(report.verdict))
    const view = tool.presentResult(args, { content: [], meta })
    if (view === undefined) disagreements.push(exportName + ': no card')
  }
  if (disagreements.length > 0) throw new Error(disagreements.join('; '))
})

test('a signal is not shown as a violation', async () => {
  const { designTool } = await import('../../lib/design-tool.js')
  const args = { model: { schemaVersion: 1, architecture: { nodes: ['a', 'b'], edges: [['a', 'b']] } } }
  const report = await designTool.execute(args)
  const meta = designTool.output.presentationMeta(args, report)
  if (meta.levels === undefined) throw new Error('the design card carries no levels')
  if (meta.levels.violations !== 0) throw new Error('a bridge is a signal, not a violation')
  if (meta.first !== null) throw new Error('a signal must not be presented as the first finding')
  const text = JSON.stringify(designTool.presentResult(args, { content: [], meta }))
  if (text.includes('✗')) throw new Error('the card marks a signal with an error glyph')
})

test('the structure card states the graph, not only the findings', async () => {
  const { umlStructureTool } = await import('../../lib/structure-tool.js')
  const args = { diagram: 'component a\ncomponent b\na --> b\nb --> a\n' }
  const report = await umlStructureTool.execute(args)
  const meta = umlStructureTool.output.presentationMeta(args, report)
  if (meta.graph === undefined) throw new Error('no graph counts in the card')
  if (meta.graph.nodes !== report.summary.nodes || meta.graph.cycles !== report.summary.cycles) throw new Error('graph counts disagree with the summary')
  const text = umlStructureTool.presentResult(args, { content: [], meta }).content[0].text
  if (!text.includes('edges')) throw new Error('the card does not state the graph: ' + text)
})

test('the scan card says the claims were routed, not proven', async () => {
  const { modelConcurrencyScanTool } = await import('../../lib/concurrency-tool.js')
  const args = { text: 'The queue is thread-safe and never blocks.' }
  const report = await modelConcurrencyScanTool.execute(args)
  const meta = modelConcurrencyScanTool.output.presentationMeta(args, report)
  if (meta.claims === undefined || meta.claims.absolute < 1) throw new Error('no claim count in the card')
  const text = modelConcurrencyScanTool.presentResult(args, { content: [], meta }).content[0].text
  if (!text.includes('proved none')) throw new Error('the card claims more than it did: ' + text)
})


// ------------------------------------------------------------------------------------------------
// Path coverage: the fallbacks.
//
// The tests above describe a well-formed report. These walk the other branches - a payload that is not
// an object, one a replay lost fields from, a report with no checks, a diff with no delta - because that
// is where a card renders nothing, or throws, and a happy-path test never goes there.
const presentation = await import('../../lib/presentation.js')
const NL = String.fromCharCode(10)
const lines = (blocks) => blocks.map((block) => block.text ?? '').join(NL)

test('a payload that is not an object still produces a card', () => {
  for (const value of [null, undefined, 'text', 42, [1, 2]]) {
    const card = presentation.reportCard(value, 'model_verify')
    if (card.verdict !== undefined) throw new Error('a non-object payload produced a verdict')
    if (card.errors !== 0 || card.warnings !== 0) throw new Error('a non-object payload produced counts')
    if (card.first !== null || card.next !== null) throw new Error('a non-object payload produced a finding')
  }
})

test('a report with neither summary nor checks has no checks count', () => {
  const card = presentation.reportCard({ verdict: 'pass', findings: [] }, 'model_automaton_verify')
  if (card.checksRun !== undefined) throw new Error('checksRun was invented')
  const text = presentation.cardBlocks(card)[0].text
  if (text.includes('checks')) throw new Error('the card claims a check count it does not have: ' + text)
})

test('the design violations branch turns violations into the findings', () => {
  const card = presentation.reportCard({
    verdict: 'fail',
    violations: [{ code: 'DES1_CYCLE', severity: 'error', message: 'the graph has a cycle' }],
    signals: [{ code: 'DES4_LOAD_BEARING_ELEMENT', message: 'a bridge' }],
    facts: [{ nodes: 2 }],
  }, 'model_design_review')
  if (card.errors !== 1) throw new Error('the violation was not counted')
  if (card.first === null || card.first.code !== 'DES1_CYCLE') throw new Error('the violation is not the first finding')
  if (card.levels === undefined || card.levels.signals !== 1 || card.levels.facts !== 1) throw new Error('the levels were not separated')
})

test('a card with no verdict, reason or next step renders what it has', () => {
  const card = presentation.reportCard({ findings: [{ code: 'X', severity: 'warning', message: 'm' }] }, 'custom_family')
  if (card.first === null) throw new Error('the warning is the first finding')
  const text = presentation.cardBlocks(card)[0].text
  if (!text.startsWith('custom_family')) throw new Error('without a verdict the family should lead: ' + text)
  if (text.includes('next:')) throw new Error('a missing next step must not render an empty one')
})

test('a route-less family carries no route and still renders', () => {
  const card = presentation.reportCard({ verdict: 'pass' }, 'not_a_tool')
  if (card.route !== undefined) throw new Error('a route appeared for an unknown family')
  if (presentation.cardBlocks(card).length === 0) throw new Error('the card rendered nothing')
})

test('a diff without a current verdict or a first added finding still renders', () => {
  const card = presentation.reportCard({ verdict: 'fail', summary: { added: 0, removed: 0, changed: 0, addedErrors: 0 } }, 'report_diff')
  if (card.currentVerdict !== undefined) throw new Error('a current verdict was invented')
  if (card.firstAdded !== undefined) throw new Error('a first added finding was invented')
  const text = lines(presentation.diffCardBlocks(card))
  if (!text.includes('nothing was added')) throw new Error('an empty delta must say the slice is accepted: ' + text)
  if (text.includes('current report on its own')) throw new Error('a missing current verdict must not render a line')
})

test('a diff whose additions are warnings still names the first one', () => {
  const card = presentation.reportCard({
    verdict: 'pass_with_findings',
    summary: { added: 1, removed: 0, changed: 0, addedErrors: 0 },
    added: [{ code: 'W1', severity: 'warning', message: 'a warning was added' }],
  }, 'report_diff')
  if (card.firstAdded === undefined || card.firstAdded.code !== 'W1') throw new Error('the warning was not carried as the first addition')
})

test('an edit card lists the overflow instead of hiding it', () => {
  const changes = Array.from({ length: 8 }, (_, index) => ({ kind: 'added', what: 'state s' + String(index) }))
  const card = { verdict: 'pass', errors: 0, warnings: 0, first: null, next: null, family: 'model_edit', changes }
  const text = lines(presentation.editCardBlocks(card))
  if (!text.includes('state s5')) throw new Error('the sixth change should be listed: ' + text)
  if (!text.includes('more in the report')) throw new Error('the overflow is silent: ' + text)
})

test('an edit card without a delta or a next step renders neither', () => {
  const card = { verdict: 'pass', errors: 0, warnings: 0, first: null, next: null, family: 'model_edit', changes: [{ kind: 'added', what: 'state a' }] }
  const text = lines(presentation.editCardBlocks(card))
  if (text.includes('findings:')) throw new Error('a missing delta rendered a findings line')
  if (text.includes('next:')) throw new Error('a missing next step rendered one')
})

test('an artifact preview caps at the limit and counts every line', () => {
  const long = Array.from({ length: 40 }, (_, index) => 'line ' + String(index)).join(NL)
  const card = presentation.cardWithSource({ verdict: 'pass' }, 'model_export', long, 'artifact: tla')
  if (card.source === undefined) throw new Error('no preview')
  if (card.source.lines.length !== 14) throw new Error('the preview is not capped: ' + String(card.source.lines.length))
  if (card.source.total !== 40) throw new Error('the total is wrong: ' + String(card.source.total))
  const short = presentation.cardWithSource({ verdict: 'pass' }, 'model_export', 'one line', 'artifact: tla')
  if (short.source === undefined || short.source.total !== 1) throw new Error('a one-line artifact is not previewed')
})

test('a blank or missing artifact produces no preview', () => {
  for (const text of [undefined, '', '   ']) {
    const card = presentation.cardWithSource({ verdict: 'pass' }, 'model_export', text, 'artifact')
    if (card.source !== undefined) throw new Error('a blank artifact produced a preview')
  }
})

test('the pending card handles each argument shape', () => {
  const none = presentation.reportCallView('model_verify')({})
  if (none.title !== 'model_verify') throw new Error('without a path the title should be the family: ' + String(none.title))
  if (none.locations !== undefined) throw new Error('a call with no path must not claim a location')
  const repo = presentation.reportCallView('uml_structure_verify')({ repoPath: 'F:/repo/src' })
  if (repo.title !== 'uml_structure_verify  src') throw new Error('the repo path is not named: ' + String(repo.title))
  if (repo.kind !== 'search') throw new Error('a uml_ tool should carry kind search')
  const plain = presentation.reportCallView('model_export')({ path: 'a/b/c.tla' })
  if (plain.kind !== 'other') throw new Error('a plain report tool should carry kind other')
  const trailing = presentation.reportCallView('model_verify')({ modelPath: 'a/b/' })
  if (!String(trailing.title).includes('b')) throw new Error('a trailing separator broke the title: ' + String(trailing.title))
  const bare = presentation.reportCallView('model_verify')({ modelPath: 'model.json' })
  if (bare.title !== 'model_verify  model.json') throw new Error('a bare filename is not named: ' + String(bare.title))
})

test('no payload means no card, so the host falls back to the text', () => {
  const view = presentation.reportResultView('model_verify')({}, { content: [] })
  if (view !== undefined) throw new Error('a report with no meta should let the host render the raw result')
  const empty = presentation.reportResultView('model_verify')({}, { content: [], meta: { family: 'model_verify' } })
  if (empty !== undefined) throw new Error('a payload with nothing to say should fall back')
})

test('the design card states a skipped check, and the scan card omits empty families', () => {
  const design = { verdict: 'pass_with_findings', errors: 0, warnings: 0, first: null, next: null, family: 'model_design_review', levels: { violations: 0, signals: 0, facts: 0, skipped: 2 } }
  const designText = lines(presentation.designCardBlocks(design))
  if (!designText.includes('examined nothing')) throw new Error('a skipped check must be stated: ' + designText)
  const scan = { verdict: 'pass', errors: 0, warnings: 0, first: null, next: null, family: 'model_interleaving_scan', claims: { absolute: 0, keywords: 0, families: [] } }
  const scanText = lines(presentation.scanCardBlocks(scan))
  if (scanText.trimEnd().endsWith('·')) throw new Error('an empty family list left a dangling separator: ' + scanText)
  if (!scanText.includes('proved none')) throw new Error('the scan card must say it proved nothing')
})

test('the structure card renders without graph counts', () => {
  const card = { verdict: 'fail', errors: 1, warnings: 0, first: null, next: null, family: 'uml_structure_verify' }
  const text = lines(presentation.structureCardBlocks(card))
  if (text.includes('graph:')) throw new Error('a graph line appeared without graph counts')
})


// ------------------------------------------------------------------------------------------------
// Path coverage, second pass: the arms a branch report showed untouched - defaults for a finding
// without a code or a severity, a card without a verdict in each family builder, a payload-less result
// view for every family, and the two argument shapes the pending card has not seen.
const NL2 = String.fromCharCode(10)
const joined = (blocks) => blocks.map((block) => block.text ?? '').join(NL2)

test('an info-level finding never leads the card, and a codeless error is still named', () => {
  // The card leads with an error or a warning; an info finding is a note and stays in the report. A finding
  // that carries neither a code nor a severity must not crash the walk that decides which one leads.
  const info = presentation.reportCard({ verdict: 'pass', findings: [{ message: 'something worth knowing' }] }, 'model_verify')
  if (info.errors !== 0 || info.warnings !== 0) throw new Error('an info finding was counted as a finding that decides')
  if (info.first !== null) throw new Error('an info finding led the card')
  const codeless = presentation.reportCard({ verdict: 'fail', findings: [{ severity: 'error', message: 'something broke' }] }, 'model_verify')
  if (codeless.first === null || codeless.first.code !== 'UNKNOWN') throw new Error('a codeless error was dropped or unnamed: ' + JSON.stringify(codeless.first))
})

test('an edit-shaped report takes its delta from reportDelta', () => {
  const card = presentation.reportCard({ verdict: 'pass', reportDelta: { summary: { added: 3, removed: 1, changed: 2, addedErrors: 0 } } }, 'model_edit')
  if (card.delta === undefined || card.delta.added !== 3 || card.delta.changed !== 2) throw new Error('the edit delta was not read from reportDelta')
})

test('a call whose arguments are not an object still gets a title', () => {
  for (const args of [null, 'text', 7, [1]]) {
    const view = presentation.reportCallView('model_verify')(args)
    if (view === undefined || view.title !== 'model_verify') throw new Error('no title for ' + String(args))
  }
})

test('a path made only of separators does not blank the title', () => {
  const view = presentation.reportCallView('model_verify')({ modelPath: '///' })
  if (!String(view.title).startsWith('model_verify')) throw new Error('the title lost its family: ' + String(view.title))
})

test('an edit with no changes says so rather than printing an empty list', () => {
  const card = { verdict: 'pass', errors: 0, warnings: 0, first: null, next: null, family: 'model_edit', changes: [] }
  const text = joined(presentation.editCardBlocks(card))
  if (!text.includes('no change was applied')) throw new Error('an empty edit rendered nothing: ' + text)
})

test('each family builder leads with its own name when there is no verdict', () => {
  const bare = { errors: 0, warnings: 0, first: null, next: null }
  const builders = [
    ['model_edit', presentation.editCardBlocks, 'model_edit'],
    ['report_diff', presentation.diffCardBlocks, 'report_diff'],
    ['uml_structure_verify', presentation.structureCardBlocks, 'uml_structure_verify'],
    ['model_design_review', presentation.designCardBlocks, 'model_design_review'],
    ['model_interleaving_scan', presentation.scanCardBlocks, 'model_interleaving_scan'],
  ]
  for (const [family, build, expected] of builders) {
    const text = joined(build({ ...bare, family }))
    if (!text.startsWith(expected)) throw new Error(family + ' did not lead with its name: ' + text)
  }
})

test('a payload-less result view falls back for every family', () => {
  for (const view of [presentation.editResultView('model_edit'), presentation.diffResultView('report_diff'), presentation.familyResultView('x', presentation.cardBlocks)]) {
    if (view({}, { content: [] }) !== undefined) throw new Error('a report with no meta should fall back to the text')
  }
})

test('a warning is the first finding in the structure card, and it is marked as one', () => {
  const card = { verdict: 'pass_with_findings', errors: 0, warnings: 1, first: { code: 'UML001', severity: 'warning', message: 'an isolated node' }, next: null, family: 'uml_structure_verify' }
  const text = joined(presentation.structureCardBlocks(card))
  if (!text.includes('⚠')) throw new Error('a warning is not marked as a warning: ' + text)
  if (text.includes('✗')) throw new Error('a warning was marked as an error')
})

test('a violation is the first finding in the design card, and it is marked as one', () => {
  const card = { verdict: 'fail', errors: 1, warnings: 0, first: { code: 'DES1_CYCLE', severity: 'error', message: 'a cycle' }, next: null, family: 'model_design_review' }
  const text = joined(presentation.designCardBlocks(card))
  if (!text.includes('✗ DES1_CYCLE')) throw new Error('the violation is not marked: ' + text)
})

test('a finding with no family is grouped under other', () => {
  const card = presentation.reportCard({ verdict: 'fail', findings: [{ code: 'X', severity: 'error', message: 'm' }], summary: { absoluteClaims: 1, keywords: 1 } }, 'model_interleaving_scan')
  const groups = card.claims?.families ?? []
  if (groups.length !== 1 || groups[0].family !== 'other') throw new Error('the unlabelled finding is not grouped: ' + JSON.stringify(groups))
})

test('the artifact preview names the cap when it applies', () => {
  const long = Array.from({ length: 20 }, (_, index) => 'l' + String(index)).join(NL2)
  const card = presentation.cardWithSource({ verdict: 'pass' }, 'model_export', long, 'artifact: spin', 5)
  if (card.source === undefined) throw new Error('no preview')
  const text = joined(presentation.cardBlocks(card))
  if (!text.includes('first 5 of 20 lines')) throw new Error('the cap is not stated: ' + text)
})


test('a result view whose payload has no verdict still titles the card with its family', () => {
  const bare = { errors: 0, warnings: 0, first: null, next: null, family: 'x' }
  const views = [
    ['model_edit', presentation.editResultView('model_edit')],
    ['report_diff', presentation.diffResultView('report_diff')],
    ['uml_structure_verify', presentation.familyResultView('uml_structure_verify', presentation.structureCardBlocks)],
  ]
  // `reportResultView` is deliberately not in this list: a payload with nothing to say is what it falls
  // back on, and that fallback has its own test above.
  for (const [family, view] of views) {
    const built = view({}, { content: [], meta: bare })
    if (built === undefined) throw new Error(family + ': a payload with no verdict should still render')
    if (String(built.title).trim() !== family) throw new Error(family + ': the title is not the family: ' + String(built.title))
  }
})

test('a first addition without a code or a severity is still rendered', () => {
  const card = presentation.reportCard({ verdict: 'pass_with_findings', summary: { added: 1, removed: 0, changed: 0, addedErrors: 0 }, added: [{ message: 'an unlabelled addition' }] }, 'report_diff')
  if (card.firstAdded === undefined) throw new Error('the addition was dropped')
  if (card.firstAdded.code !== '?') throw new Error('the missing code was not named: ' + card.firstAdded.code)
})

if (failures > 0) {
  console.log('presentation tests failed:', failures)
  process.exit(1)
}
console.log('all presentation tests passed')

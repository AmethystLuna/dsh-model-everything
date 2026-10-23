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

if (failures > 0) {
  console.log('presentation tests failed:', failures)
  process.exit(1)
}
console.log('all presentation tests passed')

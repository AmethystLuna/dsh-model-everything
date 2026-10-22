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

test('the report tools declare both hooks', () => {
  for (const [name, tool] of [[MODEL_VERIFY_TOOL_NAME, modelVerifyTool], [MODEL_AUTOMATON_TOOL_NAME, modelAutomatonTool], [STRUCTURE_TOOL_NAME, umlStructureTool]]) {
    if (typeof tool.output?.presentationMeta !== 'function') throw new Error(name + ' declares no presentationMeta')
    if (typeof tool.presentResult !== 'function') throw new Error(name + ' declares no presentResult')
  }
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

if (failures > 0) {
  console.log('presentation tests failed:', failures)
  process.exit(1)
}
console.log('all presentation tests passed')

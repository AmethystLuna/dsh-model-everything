// The two families the reading table left out, pinned as the shapes they actually are.
//
// `model_automaton_verify` carries its findings at the top level with a summary, like the structure and scan families; `uml_explain_labels` is a
// payload with conventions and no findings at all, like the drawing tools. A reader who trusts the table and finds neither family in it has to guess
// which of those two it is.
const automatonTool = (await import('../../lib/automaton-tool.js')).modelAutomatonTool
const labelsTool = (await import('../../lib/uml-tool.js')).umlExplainLabelsTool

let failures = 0
async function test(name, body) {
  try {
    await body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const AUTOMATON = {
  states: ['a', 'b'],
  alphabet: ['x'],
  transitions: [{ from: 'a', symbol: 'x', to: 'b' }],
  init: 'a',
  accepting: ['b'],
}

await test('the automaton family reports top-level findings and a next step', async () => {
  const report = await automatonTool.execute({ automaton: AUTOMATON })
  if (!Array.isArray(report.findings)) throw new Error('no top-level findings list')
  if ((report.checks ?? []).length > 0) throw new Error('it also carries a checks roster')
  if (typeof report.verdict !== 'string') throw new Error('no verdict')
  if (!Array.isArray(report.nextSteps) || report.nextSteps.length === 0) throw new Error('no next step')
})

await test('an automaton that fails carries an error finding, and the reason names it', async () => {
  // A malformed automaton is refused at the boundary with no findings, so the failing case has to be a well-formed pair that decides differently.
  const other = {
    states: ['t0'],
    alphabet: ['x'],
    transitions: [{ from: 't0', symbol: 'x', to: 't0' }],
    init: 't0',
    accepting: [],
  }
  const report = await automatonTool.execute({ automaton: AUTOMATON, other })
  if (report.verdict !== 'fail') throw new Error('verdict ' + String(report.verdict))
  const error = (report.findings ?? []).find((finding) => finding.severity === 'error')
  if (error === undefined) throw new Error('fail with no error finding')
  if (!String(report.verdictReason).includes(String(error.code))) throw new Error('the reason does not name ' + String(error.code))
})

await test('the explain-labels family is a payload: conventions, no findings, no next step', async () => {
  const report = await labelsTool.execute({ notation: 'mermaid' })
  if (!Array.isArray(report.acceptedLabelForms) || report.acceptedLabelForms.length === 0) throw new Error('no accepted forms')
  if (!Array.isArray(report.ignoredLines)) throw new Error('no ignored-lines list')
  if ((report.findings ?? []).length > 0) throw new Error('it carries findings after all')
  if ((report.nextSteps ?? []).length > 0) throw new Error('it carries a next step after all')
  if (typeof report.renderedForm !== 'string') throw new Error('no rendered form')
})

await test('both state a verdict, which is what makes them readable as reports at all', async () => {
  const [automaton, labels] = await Promise.all([
    automatonTool.execute({ automaton: AUTOMATON }),
    labelsTool.execute({ notation: 'plantuml' }),
  ])
  for (const [name, report] of [['automaton', automaton], ['labels', labels]]) {
    if (typeof report.verdict !== 'string' || report.verdict === '') throw new Error(name + ': no verdict')
    if (typeof report.verdictReason !== 'string' || report.verdictReason === '') throw new Error(name + ': no reason')
  }
})

if (failures > 0) {
  console.log('reading-shapes tests failed:', failures)
  process.exit(1)
}
console.log('all reading-shapes tests passed')
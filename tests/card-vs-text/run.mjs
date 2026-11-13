// The card and the text body are two views of one report, and a reader may see either first.
//
// So the verdict on the card has to be the verdict the text opens with, and a diff has to lead with its delta in both: the delta's verdict is about
// the change, while `CURRENT` carries the report's own. Two views that disagreed would let a reader act on the pair and report the other.
import { renderReportText } from '../../lib/report-view.js'
import { reportCard } from '../../lib/presentation.js'
import { runVerification } from '../../lib/engine.js'
import { diffReports } from '../../lib/baseline.js'

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

const BROKEN = { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }] }
const CLEAN = { schemaVersion: 1, init: 'i', states: [{ id: 'i' }, { id: 'd', terminal: true }], transitions: [{ from: 'i', event: 'go', to: 'd' }] }

const CASES = {
  'a failing verification': [runVerification(BROKEN), 'model_verify'],
  'a clean diff over a failing report': [diffReports(runVerification(BROKEN), runVerification(BROKEN)), 'report_diff'],
  'a diff with an added error': [diffReports(runVerification(CLEAN), runVerification(BROKEN)), 'report_diff'],
}

const firstLine = (report) => String(renderReportText(report, { full: false }).split('\n')[0])

test('the verdict on the card is the verdict the body opens with', () => {
  for (const [name, [report, family]] of Object.entries(CASES)) {
    const card = reportCard(report, family)
    const line = firstLine(report)
    if (!line.includes('verdict=' + String(card.verdict))) throw new Error(name + ': card ' + String(card.verdict) + ' against "' + line.slice(0, 80) + '"')
  }
})

test('a diff leads with its delta in both views, and the current verdict has its own line', () => {
  const report = CASES['a clean diff over a failing report'][0]
  const card = reportCard(report, 'report_diff')
  if (card.verdict !== 'pass') throw new Error('the delta verdict is ' + String(card.verdict))
  if (card.currentVerdict !== 'fail') throw new Error('currentVerdict is ' + String(card.currentVerdict))
  const body = renderReportText(report, { full: false })
  if (!/^model-everything\/baseline\/v1\s+verdict=pass/.test(body)) throw new Error('the body does not open with the delta: ' + body.slice(0, 80))
  if (!/CURRENT\s+verdict=fail/.test(body)) throw new Error('the body does not carry the current verdict')
})

test('an added error is a failing delta in both views', () => {
  const report = CASES['a diff with an added error'][0]
  const card = reportCard(report, 'report_diff')
  if (card.verdict !== 'fail') throw new Error('the delta verdict is ' + String(card.verdict))
  if (!firstLine(report).includes('new finding')) throw new Error('the body does not name the new findings: ' + firstLine(report).slice(0, 80))
})

test('the digest and the full view reach the same verdict', () => {
  // The two views differ in size, never in conclusion - the rule every family's `reportView` rests on. The full view is the report as JSON, so
  // the verdict is read from a different shape than the digest's one-line header.
  for (const [name, [report]] of Object.entries(CASES)) {
    const digest = renderReportText(report, { full: false })
    const full = renderReportText(report, { full: true })
    const digestVerdict = /verdict=(\w+)/.exec(digest)?.[1]
    const fullVerdict = JSON.parse(full).verdict
    if (digestVerdict === undefined) throw new Error(name + ': the digest names no verdict')
    if (digestVerdict !== fullVerdict) throw new Error(name + ': ' + String(digestVerdict) + ' against ' + String(fullVerdict))
    if (digest.length >= full.length) throw new Error(name + ': the digest is not shorter than the full view')
  }
})

if (failures > 0) {
  console.log('card-vs-text tests failed:', failures)
  process.exit(1)
}
console.log('all card-vs-text tests passed')
// The card a UI shows: one text block, and the line that has to be first in it.
//
// A card is read at a glance: the head line carries the verdict, the counters and - for a diff - the delta. So the checks are about that head line and
// about the family's own lead: a diff leads with the change, everything else leads with the verdict.
const presentation = await import('../../lib/presentation.js')
const { runVerification } = await import('../../lib/engine.js')
const { diffReports } = await import('../../lib/baseline.js')

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

const MACHINE = { schemaVersion: 1, init: 'i', states: [{ id: 'i' }, { id: 'd', terminal: true }], transitions: [{ from: 'i', event: 'go', to: 'd' }] }
const BROKEN = { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }] }

const textOf = (blocks) => blocks.map((block) => String(block.text ?? '')).join('\n')

test('a card is one text block, so a view has nothing to lay out', () => {
  for (const report of [runVerification(MACHINE), runVerification(BROKEN)]) {
    const blocks = presentation.cardBlocks(presentation.reportCard(report, 'model_verify'))
    if (blocks.length !== 1) throw new Error('blocks: ' + String(blocks.length))
    if (blocks[0].type !== 'text') throw new Error('type: ' + String(blocks[0].type))
  }
})

test('the first line of a card is the verdict, the check count and the counters', () => {
  const failing = textOf(presentation.cardBlocks(presentation.reportCard(runVerification(BROKEN), 'model_verify'))).split('\n')[0]
  if (!/^FAIL\b/.test(failing)) throw new Error('the head line is: ' + failing.slice(0, 60))
  if (!/checks/.test(failing) || !/error/.test(failing)) throw new Error('the head line counts nothing: ' + failing.slice(0, 80))
  const passing = textOf(presentation.cardBlocks(presentation.reportCard(runVerification(MACHINE), 'model_verify'))).split('\n')[0]
  if (!/^PASS\b/.test(passing)) throw new Error('the clean head line is: ' + passing.slice(0, 60))
})

test('a failing card names the first error on its second line', () => {
  const lines = textOf(presentation.cardBlocks(presentation.reportCard(runVerification(BROKEN), 'model_verify'))).split('\n')
  if (!/S2_NO_TRANSITIONS/.test(String(lines[1]))) throw new Error('the second line is: ' + String(lines[1]).slice(0, 80))
})

test('a diff card leads with the delta, not with the current verdict', () => {
  // The same rule the text body follows: the delta is what the card is about, and the current run is context.
  const delta = diffReports(runVerification(BROKEN), runVerification(MACHINE))
  if (delta.removed.length === 0) throw new Error('the fixture removed nothing, so the numbers cannot prove anything')
  const head = textOf(presentation.diffCardBlocks(presentation.reportCard(delta, 'report_diff'))).split('\n')[0]
  if (!/added \d+/.test(head) || !/removed \d+/.test(head)) throw new Error('the head line is: ' + head.slice(0, 80))
  // The numbers have to be the report's, not a default: a card that says `removed 0` for a delta of three reads as "nothing changed".
  if (!new RegExp('removed ' + String(delta.removed.length) + '\\b').test(head)) {
    throw new Error('the head line says something else: ' + head.slice(0, 80))
  }
})

test('a card says something about the next step', () => {
  const text = textOf(presentation.cardBlocks(presentation.reportCard(runVerification(BROKEN), 'model_verify')))
  if (!/next/i.test(text)) throw new Error('the card names no next step: ' + text.slice(0, 120))
})

if (failures > 0) {
  console.log('card-blocks tests failed:', failures)
  process.exit(1)
}
console.log('all card-blocks tests passed')
// The one family outside the report contract, and the shape it keeps instead.
//
// `diagram_diff` answers with a `verdict` and a `changes` list, and with neither `verdictReason` nor `nextSteps`. The reading skill says so,
// because a reader who goes looking for those two fields finds nothing and cannot tell whether the tool refused or the field is absent. The suite
// pins both halves: the shape, and the reason a refused side carries.
const diffTool = (await import('../../lib/diagram-diff-tool.js')).diagramDiffTool

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

const BEFORE = 'graph TD\n  a[A] --> b[B]'
const ADDED = 'graph TD\n  a[A] --> b[B]\n  b --> c[C]'

const codes = (report) => (report.changes ?? []).map((change) => String(change.code))

await test('an added node is an info change and the delta passes', async () => {
  const report = await diffTool.execute({ before: BEFORE, after: ADDED })
  if (report.verdict !== 'pass_with_findings') throw new Error('verdict ' + String(report.verdict))
  if (!codes(report).includes('H5_NODE_ADDED')) throw new Error('codes: ' + codes(report).join(','))
  const change = report.changes.find((entry) => entry.code === 'H5_NODE_ADDED')
  if (change.severity !== 'info') throw new Error('severity ' + String(change.severity))
})

await test('an unchanged drawing is a clean pass with no changes', async () => {
  const report = await diffTool.execute({ before: BEFORE, after: BEFORE })
  if (report.verdict !== 'pass') throw new Error('verdict ' + String(report.verdict))
  if ((report.changes ?? []).length !== 0) throw new Error('changes: ' + codes(report).join(','))
  if (report.ok !== true) throw new Error('ok ' + String(report.ok))
})

await test('a side that cannot be read is a failure whose reason is in its change', async () => {
  // The tool has no `verdictReason`: the sentence lives in the change's `message`, which is what the skill points at.
  const report = await diffTool.execute({ before: 'component a', after: ADDED })
  if (report.verdict !== 'fail') throw new Error('verdict ' + String(report.verdict))
  if (report.ok !== false) throw new Error('ok ' + String(report.ok))
  const change = (report.changes ?? []).find((entry) => entry.code === 'D1_SIDE_UNREADABLE')
  if (change === undefined) throw new Error('codes: ' + codes(report).join(','))
  if (typeof change.message !== 'string' || change.message.length === 0) throw new Error('the change carries no reason')
})

await test('the report states no verdictReason and no nextSteps, which the skill says out loud', async () => {
  const report = await diffTool.execute({ before: BEFORE, after: ADDED })
  if ('verdictReason' in report) throw new Error('the family gained a verdictReason: the skill says it has none')
  if ('nextSteps' in report) throw new Error('the family gained nextSteps: the skill says it has none')
  const keys = Object.keys(report).sort().join(',')
  // The schema is part of the shape: a caller decides how to read a payload by it, and a diff with no family could be
// compared against a report of another family.
if (keys !== 'changes,measured,ok,schema,verdict') throw new Error('the shape moved: ' + keys)
})

await test('the measurement says how big each side is', async () => {
  const report = await diffTool.execute({ before: BEFORE, after: ADDED })
  if (report.measured.before.nodes !== 2) throw new Error('before nodes ' + String(report.measured.before.nodes))
  if (report.measured.after.nodes !== 3) throw new Error('after nodes ' + String(report.measured.after.nodes))
})

if (failures > 0) {
  console.log('diagram-diff tests failed:', failures)
  process.exit(1)
}
console.log('all diagram-diff tests passed')
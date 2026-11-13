// The four claims the doctrine skill makes about `report_diff`, checked by running the tool.
//
// The acceptance criterion for a refactoring is usually "no new findings", and the whole method rests on a finding's identity being its check,
// its code and its locator. If a reworded message counted as a new finding, every refactor would look like a regression; if an added error did not
// fail the delta, none would look like one.
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

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const diffTool = (await import('file:///' + repo + 'lib/report-diff-tool.js')).reportDiffTool

/** A report shaped like a verification result, with one finding. */
const report = (finding) => ({
  schema: 'model-everything/verify/v1',
  verdict: 'fail',
  verdictReason: '1 error finding(s) (first error: A1_X)',
  checks: [{ id: 'A1', name: 'A1', status: 'fail', findings: [finding] }],
  nextSteps: ['fix it'],
})

const base = report({ code: 'A1_X', severity: 'error', message: 'first wording', evidence: 'states[0]' })
const clone = (value) => JSON.parse(JSON.stringify(value))

const diff = async (current) => diffTool.execute({ baseline: base, current, reportView: 'full' })

await test('two runs over the same input add nothing', async () => {
  const result = await diff(clone(base))
  if (result.added.length !== 0) throw new Error('added ' + String(result.added.length))
  if (result.changed.length !== 0) throw new Error('changed ' + String(result.changed.length))
  if (result.removed.length !== 0) throw new Error('removed ' + String(result.removed.length))
})

await test('a reworded message reads as changed, never as a new finding', async () => {
  const reworded = clone(base)
  reworded.checks[0].findings[0].message = 'second wording, same place'
  const result = await diff(reworded)
  if (result.added.length !== 0) throw new Error('a reworded message was added')
  if (result.changed.length !== 1) throw new Error('changed ' + String(result.changed.length))
})

await test('a finding with no locator uses its message, so a new message is a new finding', async () => {
  const bare = report({ code: 'A1_X', severity: 'error', message: 'first' })
  const other = report({ code: 'A1_X', severity: 'error', message: 'second' })
  const result = await diffTool.execute({ baseline: bare, current: other, reportView: 'full' })
  if (result.added.length !== 1 || result.removed.length !== 1) {
    throw new Error('added ' + String(result.added.length) + ', removed ' + String(result.removed.length))
  }
})

await test('the delta verdict fails on an added error, and the absolute verdict stays visible', async () => {
  const added = clone(base)
  added.checks[0].findings.push({ code: 'A1_Y', severity: 'error', message: 'new', evidence: 'states[1]' })
  const result = await diff(added)
  if (result.verdict !== 'fail') throw new Error('the delta verdict is ' + String(result.verdict))
  if (result.added.length !== 1) throw new Error('added ' + String(result.added.length))
  if (result.currentVerdict !== 'fail') throw new Error('currentVerdict is ' + String(result.currentVerdict))
})

await test('a clean delta over a still-failing report passes the delta and says so', async () => {
  const result = await diff(clone(base))
  if (result.verdict !== 'pass') throw new Error('the delta verdict is ' + String(result.verdict))
  if (result.currentVerdict !== 'fail') throw new Error('currentVerdict is ' + String(result.currentVerdict))
  const said = (result.nextSteps ?? []).join(' ')
  if (!/fail/i.test(said)) throw new Error('the next steps do not mention the report still failing: ' + said.slice(0, 80))
})

if (failures > 0) {
  console.log('diff-claims tests failed:', failures)
  process.exit(1)
}
console.log('all diff-claims tests passed')
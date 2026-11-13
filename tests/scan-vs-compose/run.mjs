// The scanner mines claims; the composer decides a model. Two tools on the same subject that must not be confused,
//
// The scan's own doctrine is that it does not prove concurrency safety. That has to be visible in its report - in the messages and in what it
// tells the reader to do next - and it must never wear the composer's codes. The composer decides C1-C5 on a model it is given, and must not
// dress a decision up as a mined claim.
const scanTool = (await import('../../lib/concurrency-tool.js')).modelConcurrencyScanTool
const composeTool = (await import('../../lib/compose-tool.js')).modelComposeTool

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

const codesOf = (report) => [...new Set([...(report.findings ?? []), ...(report.checks ?? []).flatMap((check) => check.findings ?? [])].map((finding) => String(finding.code)))]

const CLAIMS = [
  'The cache is guarded by a mutex, so it is thread-safe.',
  'Two workers write `counter` without a lock; that is a data race.',
].join('\n')

const COMPOSITION = {
  machines: [
    { schemaVersion: 1, init: 'i', states: [{ id: 'i' }, { id: 'd', terminal: true }], transitions: [{ from: 'i', event: 'w', to: 'd' }] },
    { schemaVersion: 1, init: 'i', states: [{ id: 'i' }, { id: 'd', terminal: true }], transitions: [{ from: 'i', event: 'w', to: 'd' }] },
  ],
  shared: [{ id: 'x', initial: 0 }],
  accesses: [{ machine: 0, event: 'w', location: 'x', kind: 'write' }, { machine: 1, event: 'w', location: 'x', kind: 'write' }],
}

await test('the scanner reports claims as claims, in its own names', async () => {
  const report = await scanTool.execute({ text: CLAIMS, reportView: 'full' })
  const codes = codesOf(report)
  if (codes.length === 0) throw new Error('no claim was mined')
  if (codes.some((code) => /^C[1-5]_/.test(code))) throw new Error('a composition code appeared in a scan: ' + codes.join(','))
  if (!codes.some((code) => code.startsWith('CONCURRENCY_'))) throw new Error('codes: ' + codes.join(','))
})

await test('the scanner says, in the message and in the next step, that it does not prove safety', async () => {
  const report = await scanTool.execute({ text: CLAIMS, reportView: 'full' })
  const said = (report.findings ?? []).map((finding) => String(finding.message)).join(' ')
  if (!/does not verify|not verify/i.test(said)) throw new Error('a claim was reported without saying it is unverified: ' + said.slice(0, 100))
  const steps = (report.nextSteps ?? []).map((step) => String(step)).join(' ')
  if (!/does not prove|not prove/i.test(steps)) throw new Error('the steps do not say safety is unproven: ' + steps.slice(0, 120))
})

await test('text with nothing to mine is refused, not passed', async () => {
  // A scan of nothing is not a clean bill of health, and the reply says so instead of reporting a pass.
  const report = await scanTool.execute({ text: 'The build runs one job at a time.', reportView: 'full' })
  if (report.verdict !== 'fail') throw new Error('verdict ' + String(report.verdict))
  if (report.errorCode !== 'CONCURRENCY_NO_CLAIM') throw new Error('code ' + String(report.errorCode))
})

await test('the composer decides C-codes and never mines a claim', async () => {
  const report = await composeTool.execute({ ...COMPOSITION, reportView: 'full' })
  const codes = codesOf(report)
  if (!codes.some((code) => /^C[1-5]_/.test(code))) throw new Error('no C-code: ' + codes.join(','))
  if (codes.some((code) => code.startsWith('CONCURRENCY_'))) throw new Error('a scan code appeared in a composition: ' + codes.join(','))
})

if (failures > 0) {
  console.log('scan-vs-compose tests failed:', failures)
  process.exit(1)
}
console.log('all scan-vs-compose tests passed')
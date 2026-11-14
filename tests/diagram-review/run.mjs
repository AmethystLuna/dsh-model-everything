// The structure budgets: three numbers and the finding each one raises.
//
// A picture that needs scrolling is no longer a summary, so the tool has budgets - and a budget nobody can trip is a number in a description. Each
// of the three is measured here on a drawing built to break exactly that one.
const reviewTool = (await import('../../lib/diagram-review-tool.js')).diagramReviewTool

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

const group = (size) => ['graph TD', '  subgraph g', ...Array.from({ length: size }, (_, index) => '    s' + String(index)), '  end'].join('\n')
const PLAIN = 'graph TD\n  a --> b\n  b --> c'

const codes = (report) => [...new Set((report.findings ?? []).map((finding) => String(finding.code)))]

await test('a drawing inside every budget passes and states what it measured', async () => {
  const report = await reviewTool.execute({ source: PLAIN })
  if (report.verdict !== 'pass') throw new Error('verdict ' + String(report.verdict))
  if (codes(report).length > 0) throw new Error('codes: ' + codes(report).join(','))
  if (report.measured.nodes !== 3) throw new Error('nodes ' + String(report.measured.nodes))
  if (report.measured.groups !== 0) throw new Error('groups ' + String(report.measured.groups))
})

await test('a boundary wider than maxMembers is B1', async () => {
  const report = await reviewTool.execute({ source: group(5), maxMembers: 3 })
  if (report.verdict !== 'fail') throw new Error('verdict ' + String(report.verdict))
  if (!codes(report).includes('B1_GROUP_TOO_WIDE')) throw new Error('codes: ' + codes(report).join(','))
  // The measurement names the group that broke it, which is the only way a reader can find it in the source.
  if (report.measured.widest?.group !== 'g') throw new Error('the measurement does not name the group')
})

await test('the same boundary passes at the default budget', async () => {
  // The control: a review that failed everything would pass the case above.
  const report = await reviewTool.execute({ source: group(5) })
  if (report.verdict !== 'pass') throw new Error('verdict ' + String(report.verdict))
  if (codes(report).length > 0) throw new Error('codes: ' + codes(report).join(','))
})

await test('a drawing with more nodes than maxNodes is B5', async () => {
  const report = await reviewTool.execute({ source: group(9), maxNodes: 5 })
  if (!codes(report).includes('B5_TOO_MANY_NODES')) throw new Error('codes: ' + codes(report).join(','))
})

await test('the measured numbers are the ones the findings are about', async () => {
  const report = await reviewTool.execute({ source: group(9), maxNodes: 5, maxMembers: 3 })
  if (report.measured.nodes !== 9) throw new Error('nodes ' + String(report.measured.nodes))
  if (report.measured.groups !== 1) throw new Error('groups ' + String(report.measured.groups))
  if (report.measured.widest?.size !== 9) throw new Error('widest ' + JSON.stringify(report.measured.widest))
})

await test('an empty source is a finding with its own code, not an empty review', async () => {
  // "produced no nodes" and "there was no source" are different answers: the second is the caller's input, the first is the
  // text's. Without the code the two read alike, and a review of nothing looks like a review.
  for (const source of ['', '   ', '\n\t\n']) {
    const report = await reviewTool.execute({ source })
    if (report.ok !== false) throw new Error('an empty source reviewed clean')
    if (report.verdict !== 'fail') throw new Error('verdict: ' + String(report.verdict))
    const codes = (report.findings ?? []).map((finding) => finding.code)
    if (!codes.includes('D0_NO_SOURCE')) throw new Error(JSON.stringify(source) + ' reported ' + codes.join(','))
  }
})

if (failures > 0) {
  console.log('diagram-review tests failed:', failures)
  process.exit(1)
}
console.log('all diagram-review tests passed')
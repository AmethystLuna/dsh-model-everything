// The review audits the modelling and the verification decides the behaviour, and neither may speak for the other.
//
// The same model, given to both, produces two families of code: `UML*` from the review, `S*`/`A*` from the verification. A model can be thin as a
// drawing and sound as a machine, and the two reports have to say different things about it - which is what makes running both worth anything.
const reviewTool = (await import('../../lib/uml-tool.js')).umlReviewTool
const verifyTool = (await import('../../lib/tool.js')).modelVerifyTool

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

/** A machine with a start, a terminal state and no dead ends: nothing for the behaviour checks to complain about. */
const FINE = {
  schemaVersion: 1, init: 'idle',
  states: [{ id: 'idle' }, { id: 'done', terminal: true }],
  transitions: [{ from: 'idle', event: 'go', to: 'done' }, { from: 'done', event: 'reset', to: 'idle' }],
}

/** The same shape with a state nothing leaves and no terminal: a modelling defect and a behavioural one. */
const DEAD = {
  schemaVersion: 1, init: 'a',
  states: [{ id: 'a' }, { id: 'b' }],
  transitions: [{ from: 'a', event: 'go', to: 'b' }],
}

await test('a model that is thin as a drawing and sound as a machine gets two different answers', async () => {
  const review = await reviewTool.execute({ model: FINE, reportView: 'full' })
  const verify = await verifyTool.execute({ model: FINE, reportView: 'full' })
  const reviewCodes = codesOf(review)
  if (!reviewCodes.includes('UML013_NO_NARRATIVE')) throw new Error('the review did not ask for a narrative: ' + reviewCodes.join(','))
  if (verify.verdict === 'fail') throw new Error('the behaviour checks failed a sound machine: ' + codesOf(verify).join(','))
  if (codesOf(verify).some((code) => code.startsWith('UML'))) throw new Error('a modelling code appeared in a verification: ' + codesOf(verify).join(','))
})

await test('a broken machine fails both, each naming only its own family', async () => {
  const review = await reviewTool.execute({ model: DEAD, reportView: 'full' })
  const verify = await verifyTool.execute({ model: DEAD, reportView: 'full' })
  if (review.verdict !== 'fail') throw new Error('the review passed a dead end: ' + codesOf(review).join(','))
  if (verify.verdict !== 'fail') throw new Error('the verification passed a dead end: ' + codesOf(verify).join(','))
  const reviewCodes = codesOf(review)
  const verifyCodes = codesOf(verify)
  if (!reviewCodes.includes('UML003_DEAD_END_STATE')) throw new Error('the review: ' + reviewCodes.join(','))
  if (!verifyCodes.some((code) => /^[SA]\d/.test(code))) throw new Error('the verification: ' + verifyCodes.join(','))
  if (reviewCodes.some((code) => /^[SA]\d/.test(code))) throw new Error('a behavioural code appeared in the review: ' + reviewCodes.join(','))
})

await test('the review tells the reader to run the verification, which is the division of labour in one sentence', async () => {
  const review = await reviewTool.execute({ model: FINE, reportView: 'full' })
  const steps = (review.nextSteps ?? []).map((step) => String(step)).join(' ')
  if (!/model_verify/.test(steps)) throw new Error('the review does not route to the verification: ' + steps.slice(0, 120))
})

if (failures > 0) {
  console.log('review-vs-verify tests failed:', failures)
  process.exit(1)
}
console.log('all review-vs-verify tests passed')
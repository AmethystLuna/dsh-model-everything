// A tool that declares `timeoutMs` asserts it forwards `exec.signal` to something that can stop.
//
// The host's contract is explicit (dsh-tools, `timeoutMs`): declaring it "asserts this tool forwards `exec.signal` to a
// cooperative implementation that can reach quiescence when the signal aborts". Seventeen tools declared it and none read
// the signal, so the assertion was false for every one of them.
//
// Measured: an aborted call answered the same as a live one. The two searches that can run for seconds - the state-space
// exploration and the composition product walk - check the signal now, and an aborted call settles with `ran: false` and its
// own code instead of a completed report.
const { modelVerifyTool } = await import('../../lib/tool.js')
const { modelComposeTool } = await import('../../lib/compose-tool.js')
const { runVerification } = await import('../../lib/engine.js')
const { REPORT_SCHEMAS } = await import('../../lib/engine.js')

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

const machine = (n) => ({
  schemaVersion: 1, init: 's0',
  states: Array.from({ length: n }, (_, i) => ({ id: 's' + i, ...(i === n - 1 ? { terminal: true } : {}) })),
  transitions: Array.from({ length: n - 1 }, (_, i) => ({ from: 's' + i, event: 'e' + i, to: 's' + (i + 1) })),
})

const aborted = () => {
  const controller = new AbortController()
  controller.abort()
  return controller.signal
}

await test('a verification whose deadline passed settles without a report', async () => {
  const result = await modelVerifyTool.execute({ model: machine(200) }, { signal: aborted() })
  if (result.ran !== false) throw new Error('it ran to completion under an aborted signal')
  if (result.errorCode !== 'TOOL_ABORTED') throw new Error('it answered ' + String(result.errorCode) + ', not TOOL_ABORTED')
  if (result.schema !== REPORT_SCHEMAS.verify) throw new Error('the refusal lost its family: ' + String(result.schema))
})

await test('a composition whose deadline passed settles the same way', async () => {
  const result = await modelComposeTool.execute({ machines: [machine(20), machine(20)] }, { signal: aborted() })
  if (result.ran !== false) throw new Error('it ran to completion under an aborted signal')
  if (result.errorCode !== 'TOOL_ABORTED') throw new Error('it answered ' + String(result.errorCode))
  if (result.schema !== REPORT_SCHEMAS.compose) throw new Error('the refusal lost its family')
})

await test('the control: the same calls answer when no deadline passed', async () => {
  // A guard that refuses everything is not a guard.
  const verify = await modelVerifyTool.execute({ model: machine(10) })
  if (typeof verify.verdict !== 'string') throw new Error('a live call did not answer')
  const compose = await modelComposeTool.execute({ machines: [machine(10), machine(10)] })
  if (typeof compose.verdict !== 'string') throw new Error('a live composition did not answer')
  const engine = runVerification(machine(10), {})
  if (typeof engine.verdict !== 'string') throw new Error('the engine did not answer an empty signal')
})

await test('the engine refuses directly, so the guard is not only in the tool wrapper', async () => {
  let threw = false
  try {
    runVerification(machine(200), { signal: aborted() })
  } catch (error) {
    threw = true
    if (String(error.code) !== 'TOOL_ABORTED') throw new Error('it threw ' + String(error.code))
  }
  if (!threw) throw new Error('the engine ran to completion under an aborted signal')
})

if (failures > 0) {
  console.log('abort tests failed:', failures)
  process.exit(1)
}
console.log('all abort tests passed')
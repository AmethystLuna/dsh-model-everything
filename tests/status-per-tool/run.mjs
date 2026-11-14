// One tool failing to register must report that tool, not all of them.
//
// The status used to be eight booleans written together after the last registration, inside one `try`. A failure on the
// fourteenth tool reported every one of the eight false - "nothing is installed" on a row where thirteen tools answer.
// This suite makes one registration throw and reads the status back.
import { Context } from '@deepseek-ai/cordis'

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

/** Build the row the Loader builds, with one tool's registration made to fail. */
async function statusWith(failing) {
  const { Config } = await import('../../lib/index.js')
  const ctx = new Context()
  ctx.provide('skills', { registerProvider() { return () => {} } })
  ctx.provide('tools', {
    register(definition) {
      if (definition?.name === failing) throw new Error('the registry refused ' + String(failing))
      return () => {}
    },
  })
  ctx.provide('systemPrompt', { context() { return () => {} } })
  let provider
  ctx.provide('cordisInspect', { register(value) { provider = value; return () => {} } })
  const mod = await import('../../lib/index.js')
  mod.apply(ctx, new Config({ interaction: 'follow-approval' }))
  return provider.query('status')
}

await test('when every tool registers, the status says so and names nothing missing', async () => {
  const status = await statusWith('nothing-fails')
  if (status.missingTools.length !== 0) throw new Error('missing: ' + status.missingTools.join(', '))
  for (const flag of ['toolRegistered', 'dataToolRegistered', 'concurrencyToolRegistered', 'composeToolRegistered', 'exportToolRegistered', 'umlToolsRegistered', 'structureToolRegistered', 'reportDiffToolRegistered', 'designToolRegistered', 'editToolRegistered', 'automatonToolRegistered']) {
    if (status[flag] !== true) throw new Error(flag + ' is not true')
  }
})

await test('the tool that failed is the one reported, and the others stay true', async () => {
  // The last registration is the case the old code could not survive: it was the one that decided all eight flags.
  const status = await statusWith('model_automaton_verify')
  if (status.automatonToolRegistered !== false) throw new Error('the failed tool reports as registered')
  if (status.toolRegistered !== true) throw new Error('a neighbour was reported false as well')
  if (status.reportDiffToolRegistered !== true) throw new Error('a neighbour was reported false as well')
  if (status.missingTools.length !== 1) throw new Error('missingTools: ' + JSON.stringify(status.missingTools))
  if (!status.missingTools[0].startsWith('model_automaton_verify: ')) throw new Error('missingTools names ' + status.missingTools[0])
})

await test('a UML tool that fails takes its group flag down and leaves the rest alone', async () => {
  const status = await statusWith('uml_parse')
  if (status.umlToolsRegistered !== false) throw new Error('the UML group still reports registered')
  if (status.structureToolRegistered !== true) throw new Error('a sibling UML tool was reported false')
  if (status.missingTools.length !== 1) throw new Error(JSON.stringify(status.missingTools))
})

if (failures > 0) {
  console.log('status-per-tool tests failed:', failures)
  process.exit(1)
}
console.log('all status-per-tool tests passed')
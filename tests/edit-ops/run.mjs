// Every edit operation, applied once, with the file read back.
//
// The refusal side is `tests/edit-refusals`. This is the other half: an op that is accepted has to change the file in the way its name says, report
// one change, and leave a model the engine can still read. A verdict of `fail` after an accepted op is not a refusal - it is the edited model's own
// report, and telling those two apart is the point of reading the file back.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const scratch = mkdtempSync(join(tmpdir(), 'dme-edit-ops-'))
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }))

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
const editTool = (await import('file:///' + repo + 'lib/edit-tool.js')).modelEditTool

const BASE = {
  schemaVersion: 1, init: 's0',
  states: [{ id: 's0' }, { id: 's1', terminal: true }],
  transitions: [{ from: 's0', event: 'go', to: 's1' }, { from: 's1', event: 'back', to: 's0' }],
  narrative: { states: { s0: 'start' }, events: { go: 'advance' } },
}

const run = async (name, ops) => {
  const path = join(scratch, name + '.json')
  writeFileSync(path, JSON.stringify(BASE, null, 2))
  const before = readFileSync(path, 'utf8')
  const report = await editTool.execute({ modelPath: path, ops })
  if (report === undefined) throw new Error(name + ': no report')
  const after = readFileSync(path, 'utf8')
  if (after === before) throw new Error(name + ': the file did not change')
  if ((report.changes ?? []).length === 0) throw new Error(name + ': no change was reported')
  if (JSON.stringify(report.changes ?? []).includes('undefined')) throw new Error(name + ': a change carries undefined')
  return { report, model: JSON.parse(after) }
}

await test('addState appends the state and reports it', async () => {
  const { model, report } = await run('addState', [{ addState: { id: 's2' } }])
  if (!model.states.some((state) => state.id === 's2')) throw new Error('the state was not added')
  if ((model.states ?? []).length !== 3) throw new Error('states: ' + String(model.states.length))
  if (report.modelValid === false) throw new Error('the model is invalid after adding a state')
})

await test('removeState drops the edges that pointed at it too', async () => {
  // The state removed still has an edge of its own (`s1 --back--> s0`) when the batch reaches it, so the operation itself has to take that edge
  // out. A removal that left it behind would name a state the model no longer has, and the whole batch would be refused.
  const { model } = await run('removeState', [
    // The narrative names the event the next op removes, and a narrative naming a removed event is invalid in its own right.
    { remove: '/narrative' },
    { removeTransition: ['s0', 'go'] },
    { addState: { id: 's9', terminal: true } },
    { addTransition: ['s0', 'end', 's9'] },
    { removeState: 's1' },
  ])
  if (model.states.some((state) => state.id === 's1')) throw new Error('the state survived')
  if (!model.states.some((state) => state.id === 's9')) throw new Error('the batch stopped after the removal')
  const dangling = (model.transitions ?? []).filter((transition) => transition.from === 's1' || transition.to === 's1')
  if (dangling.length > 0) throw new Error('an edge still names the removed state: ' + JSON.stringify(dangling))
})
await test('addTransition adds one edge', async () => {
  const { model } = await run('addTransition', [{ addTransition: ['s1', 'reset', 's0'] }])
  if ((model.transitions ?? []).length !== 3) throw new Error('transitions: ' + String(model.transitions.length))
  if (!(model.transitions ?? []).some((transition) => transition.event === 'reset')) throw new Error('the edge was not added')
})

await test('removeTransition drops one edge and leaves the other', async () => {
  // The edge removed is not the only way out of the init state: removing that one would leave the model invalid and the batch refused.
  const { model } = await run('removeTransition', [{ removeTransition: ['s1', 'back'] }])
  if ((model.transitions ?? []).length !== 1) throw new Error('transitions: ' + String(model.transitions.length))
  if ((model.transitions ?? [])[0]?.event !== 'go') throw new Error('the wrong edge was removed')
})

await test('updateTransition patches the named edge', async () => {
  const { model } = await run('updateTransition', [{ updateTransition: ['s0', 'go', { to: 's0' }] }])
  const edge = (model.transitions ?? [])[0]
  if (edge?.to !== 's0') throw new Error('the edge still goes to ' + String(edge?.to))
})

await test('set writes a value at a pointer', async () => {
  const { model } = await run('set', [{ set: ['/init', 's0'] }, { set: ['/states/1/terminal', false] }])
  if (model.states[1].terminal !== false) throw new Error('the value was not written')
})

await test('remove deletes the key at a pointer', async () => {
  const { model } = await run('remove', [{ remove: '/narrative' }])
  if ('narrative' in model) throw new Error('the key survived')
})

await test('a change says what it wrote, not only where', async () => {
  // `set /init` alone says where; a reader still has to open the file to learn what it now holds. The two ops that replace a value carry it.
  const written = await run('value', [{ set: ['/init', 's1'] }])
  const detail = String((written.report.changes ?? [])[0]?.detail ?? '')
  if (!detail.includes('s1')) throw new Error('the change does not name the value: ' + JSON.stringify(detail))
  const patched = await run('patch', [{ updateTransition: ['s0', 'go', { to: 's0' }] }])
  const patchDetail = String((patched.report.changes ?? [])[0]?.detail ?? '')
  if (!/to = s0/.test(patchDetail)) throw new Error('the patch change names no value: ' + JSON.stringify(patchDetail))
})

if (failures > 0) {
  console.log('edit-ops tests failed:', failures)
  process.exit(1)
}
console.log('all edit-ops tests passed')
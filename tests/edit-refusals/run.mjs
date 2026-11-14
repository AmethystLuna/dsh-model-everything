// The edit tool's promise: it refuses an edit that would leave an invalid model and writes nothing.
//
// "Writes nothing" is the half that cannot be seen in the reply - a refusal that already truncated the file reads exactly like a refusal that did
// not. So each case compares the bytes on disk with the bytes before the call, and the escape hatch is measured too: without it a guard that
// never writes would pass every case.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const scratch = mkdtempSync(join(tmpdir(), 'dme-edit-refusals-'))
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

const MODEL = {
  schemaVersion: 1,
  init: 's0',
  states: [{ id: 's0' }, { id: 's1', terminal: true }],
  transitions: [{ from: 's0', event: 'go', to: 's1' }],
}

const freshFile = (name) => {
  const path = join(scratch, name + '.json')
  writeFileSync(path, JSON.stringify(MODEL, null, 2))
  return path
}

const bytes = (path) => readFileSync(path, 'utf8')

/** One refused edit: the reply says fail, and the file is byte-identical. */
const refused = async (name, ops, extra = {}) => {
  const path = freshFile(name)
  const before = bytes(path)
  const report = await editTool.execute({ modelPath: path, ops, ...extra })
  if (report === undefined) throw new Error(name + ': no report')
  if (report.verdict !== 'fail') throw new Error(name + ': verdict ' + String(report.verdict))
  if (bytes(path) !== before) throw new Error(name + ': the file changed under a refusal')
  return report
}

await test('an ops that is not a list is refused and writes nothing', async () => {
  await refused('ops-not-a-list', 'nope')
})

await test('removing a state the model does not have is refused and writes nothing', async () => {
  const report = await refused('unknown-state', [{ removeState: 'nope' }])
  const said = String(report.verdictReason) + ' ' + JSON.stringify(report.validationErrors ?? '')
  if (!/nope/.test(said)) throw new Error('the refusal does not name the state: ' + said.slice(0, 80))
})

await test('an edit that leaves the model invalid is refused, writes nothing, and says which field', async () => {
  // The validation errors live in the message rather than in `validationErrors`: those fields belong to the refusal to refuse, which is
  // `allowInvalid`. What a reader needs here is the sentence, and it has to name the field that would be wrong.
  const report = await refused('invalid-model', [{ removeState: 's0' }])
  const said = String(report.verdictReason)
  if (!/invalid model/.test(said)) throw new Error('the reason: ' + said.slice(0, 80))
  if (!/init/.test(said)) throw new Error('the reason does not name the field: ' + said.slice(0, 100))
  if (!/allowInvalid/.test(said)) throw new Error('the reason does not say how to proceed anyway: ' + said.slice(0, 100))
  if (report.errorCode !== 'EDIT_RESULT_INVALID') throw new Error('the code: ' + String(report.errorCode))
})

await test('a refusal names the operation that broke the model, in either spelling', async () => {
  // The shorthand form (`{removeState: 's0'}`) carries no `op` field of its own: replaying the raw entries blamed operation 1 every time and called
  // the operation `(undefined)`. The loop walks the normalised entries now, so the number and the name are both the real ones.
  const single = await refused('naming-single', [{ removeState: 's0' }])
  if (!/Operation 1 \(removeState\)/.test(String(single.verdictReason))) throw new Error('single: ' + String(single.verdictReason).slice(-120))
  const batch = await refused('naming-batch', [{ addState: { id: 's2' } }, { removeState: 's0' }])
  if (!/Operation 2 \(removeState\)/.test(String(batch.verdictReason))) throw new Error('batch: ' + String(batch.verdictReason).slice(-120))
})

await test('the escape hatch writes the invalid model, and says what it is', async () => {
  // Without this case a guard that refuses everything would pass the four above.
  const path = freshFile('escape-hatch')
  const before = bytes(path)
  const report = await editTool.execute({ modelPath: path, ops: [{ set: ['/init', 'ghost'] }], allowInvalid: true })
  if (report === undefined) throw new Error('no report')
  if (bytes(path) === before) throw new Error('allowInvalid did not write')
  if (report.modelValid !== false) throw new Error('the report hides that the model is invalid')
})

await test('ops that are not a list are refused by name, not thrown as a TypeError', async () => {
  // `ops` is declared `json`, so a string reaches the editor: the refusal has to name the option and the code.
  const path = freshFile('ops-shape')
  for (const ops of ['nope', 5, null]) {
    const report = await editTool.execute({ modelPath: path, ops })
    if (report.ran !== false) throw new Error(JSON.stringify(ops) + ' ran')
    if (report.errorCode !== 'EDIT_OPTION_INVALID') throw new Error(JSON.stringify(ops) + ' answered ' + String(report.errorCode))
    if (report.schema !== 'model-everything/edit/v1') throw new Error('schema: ' + String(report.schema))
  }
})

await test('an empty batch is refused, because nothing would be written', async () => {
  const path = freshFile('empty-batch')
  const report = await editTool.execute({ modelPath: path, ops: [] })
  if (report.errorCode !== 'EDIT_OPTION_INVALID') throw new Error('code: ' + String(report.errorCode))
})

await test('an operation that is not an object is refused by its position', async () => {
  const path = freshFile('not-an-object')
  const report = await editTool.execute({ modelPath: path, ops: [null] })
  if (report.errorCode !== 'EDIT_OPTION_INVALID') throw new Error('code: ' + String(report.errorCode))
  if (!/operation 1/.test(String(report.error))) throw new Error('it does not name the position: ' + String(report.error))
})

await test('a value the change wrote is described, not printed as an object', async () => {
  // The detail a reader acts on: "to {\"states\": ...}" is the value; `[object Object]` would say nothing.
  const path = freshFile('object-value')
  // The narrative names a state the fixture has, so the batch writes: a value the model rejects would test the wrong path.
  const report = await editTool.execute({ modelPath: path, ops: [{ set: ['/narrative', { states: { s0: 'A longer note about the start state' } }] }] })
  const detail = String(report.changes?.[0]?.detail ?? '')
  if (!detail.startsWith('to ')) throw new Error('detail: ' + detail)
  if (!detail.includes('states')) throw new Error('the value is not described: ' + detail)
})

await test('a batch that would leave the model invalid names the operation it stops at', async () => {
  // The first op is fine and the second is not, so a report that blamed operation 1 would be wrong.
  const path = freshFile('invalid-batch')
  const report = await editTool.execute({ modelPath: path, ops: [{ addState: 'c' }, { set: ['/init', 'ghost'] }] })
  if (report.errorCode !== 'EDIT_RESULT_INVALID') throw new Error('code: ' + String(report.errorCode))
  if (!/Operation 2/.test(String(report.error))) throw new Error('it did not blame the second operation: ' + String(report.error))
})

await test('a transition that already exists is refused, not duplicated', async () => {
  const path = freshFile('duplicate-transition')
  const report = await editTool.execute({ modelPath: path, ops: [{ addTransition: ['s0', 'go', 's1'] }] })
  if (report.errorCode !== 'EDIT_OPTION_INVALID') throw new Error('code: ' + String(report.errorCode))
  if (!/already exists/.test(String(report.error))) throw new Error('the refusal does not say why: ' + String(report.error))
})

await test('a patch that is not an object is refused by name', async () => {
  const path = freshFile('patch-shape')
  for (const patch of ['nope', 5, ['a']]) {
    // The patch is the third element itself, not an object holding it: `{ patch }` would be a valid object of fields.
    const report = await editTool.execute({ modelPath: path, ops: [{ updateTransition: ['s0', 'go', patch] }] })
    if (report.errorCode !== 'EDIT_OPTION_INVALID') throw new Error(JSON.stringify(patch) + ' answered ' + String(report.errorCode))
  }
})

await test('an operation whose own application throws is refused with its position', async () => {
  // `removeState` of a state that is not there throws inside the op loop, which is a different refusal from a batch
  // that stops validating: the message names the operation, not the validation.
  const path = freshFile('op-throws')
  const report = await editTool.execute({ modelPath: path, ops: [{ removeState: 'ghost' }] })
  if (report.errorCode !== 'EDIT_OPTION_INVALID') throw new Error('code: ' + String(report.errorCode))
  if (!/operation 1/.test(String(report.error))) throw new Error('position missing: ' + String(report.error))
})

if (failures > 0) {
  console.log('edit-refusals tests failed:', failures)
  process.exit(1)
}
console.log('all edit-refusals tests passed')
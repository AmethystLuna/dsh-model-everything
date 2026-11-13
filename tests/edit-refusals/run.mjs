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

await test('the escape hatch writes the invalid model, and says what it is', async () => {
  // Without this case a guard that refuses everything would pass the four above.
  const path = freshFile('escape-hatch')
  const before = bytes(path)
  const report = await editTool.execute({ modelPath: path, ops: [{ set: ['/init', 'ghost'] }], allowInvalid: true })
  if (report === undefined) throw new Error('no report')
  if (bytes(path) === before) throw new Error('allowInvalid did not write')
  if (report.modelValid !== false) throw new Error('the report hides that the model is invalid')
})

if (failures > 0) {
  console.log('edit-refusals tests failed:', failures)
  process.exit(1)
}
console.log('all edit-refusals tests passed')
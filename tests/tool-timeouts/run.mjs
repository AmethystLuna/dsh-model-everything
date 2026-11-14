// Every tool declares how long the host may wait for it, and the family whose search can take seconds gets the most.
//
// A timeout shorter than the work kills the call with nothing to read, and the caller cannot tell that from a tool that failed. Composition is the only
// family whose default search bound can take seconds on an input a caller would plausibly write, so its declared limit is checked to be the largest -
// that ordering is what keeps the number honest without pinning a count.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let failures = 0
function test(name, body) {
  try {
    body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

/** Tool module file name to the timeout it declares beside its `defineTool` call. */
const timeouts = () => {
  const out = new Map()
  for (const file of readdirSync(join(repo, 'src'))) {
    if (!file.endsWith('-tool.ts') && file !== 'tool.ts') continue
    const text = readFileSync(join(repo, 'src', file), 'utf8')
    const match = /timeoutMs:\s*([0-9_]+)/.exec(text)
    if (match !== null) out.set(file, Number(String(match[1]).replace(/_/g, '')))
  }
  return out
}

const declared = timeouts()

test('every tool module declares a timeout', () => {
  if (declared.size < 8) throw new Error('only ' + String(declared.size) + ' tool module(s) declare one')
  for (const [file, value] of declared) {
    if (!Number.isInteger(value) || value <= 0) throw new Error(file + ': ' + String(value))
  }
})

test('the composition tools get the longest limit, because their search can take seconds', () => {
  const compose = declared.get('compose-tool.ts')
  if (compose === undefined) throw new Error('compose-tool.ts declares none')
  for (const [file, value] of declared) {
    if (file === 'compose-tool.ts') continue
    if (value > compose) throw new Error(file + ' waits longer than a composition: ' + String(value) + ' > ' + String(compose))
  }
})

test('the edit tool gets more time than a report tool, because it writes', () => {
  const edit = declared.get('edit-tool.ts')
  const report = declared.get('report-diff-tool.ts')
  if (edit === undefined || report === undefined) throw new Error('a module declares none')
  if (edit < report) throw new Error('edit ' + String(edit) + ' < report ' + String(report))
})

if (failures > 0) {
  console.log('tool-timeouts tests failed:', failures)
  process.exit(1)
}
console.log('all tool-timeouts tests passed')
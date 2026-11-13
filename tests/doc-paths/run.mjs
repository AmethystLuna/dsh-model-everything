// The field paths the skills tell a reader to look at have to exist in the reports.
//
// A skill that says "read summary.errors" or "check hashes.modelHash" is pointing at a place; a path that is not there costs a reader more
// than the missing sentence would have. This suite builds one report per family shape and resolves each path the documentation names.
import { runVerification, runCompositionVerification } from '../../lib/engine.js'
import { runDataVerification } from '../../lib/data-engine.js'
import { reviewUml } from '../../lib/uml.js'

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

const machine = (id) => ({
  schemaVersion: 1, init: 's0',
  states: [{ id: 's0' }, { id: 's1', terminal: true }],
  transitions: [{ from: 's0', event: 'go', to: 's1' }],
})

const REPORTS = {
  review: reviewUml({ model: machine() }),
  verify: runVerification(machine()),
  compose: runCompositionVerification([machine(), machine()]),
  // A valid data model: `primaryKey` is an entity-level list of field names, and a field carries `name`, `type` and its constraints.
  data: runDataVerification({ schemaVersion: 1, entities: [{ name: 'A', fields: [{ name: 'id', type: 'int', required: true }], primaryKey: ['id'] }], relationships: [] }),
}

/** Resolve `a.b.c` in one object; a missing step returns undefined rather than throwing. */
const at = (value, path) => path.split('.').reduce((held, key) => (held === null || typeof held !== 'object' ? undefined : held[key]), value)

test('a path the documentation names resolves in the report that carries it', () => {
  // Each entry: the path, and the reports it has to be found in (any one of them is enough when the field is family-specific).
  const PATHS = [
    ['verdict', ['review', 'verify', 'compose', 'data']],
    ['verdictReason', ['review', 'verify', 'compose', 'data']],
    ['nextSteps', ['review', 'verify', 'compose', 'data']],
    ['summary.errors', ['review', 'verify', 'compose', 'data']],
    ['summary.warnings', ['review', 'verify', 'compose', 'data']],
    ['summary.truncated', ['verify', 'compose']],
    ['hashes.modelHash', ['review', 'verify', 'data']],
    ['hashes.hashSpec', ['review', 'verify', 'compose', 'data']],
    ['hashes.machines', ['compose']],
    ['roundTrip.ok', ['review']],
    ['roundTrip.diffs', ['review']],
    ['checks', ['verify', 'compose', 'data']],
    ['findings', ['review']],
  ]
  for (const [path, families] of PATHS) {
    const found = families.some((family) => at(REPORTS[family], path) !== undefined)
    if (!found) throw new Error('`' + path + '` is named in the skills and resolves in ' + families.join('/'))
  }
})

test('a check carries the findings a reader is sent to', () => {
  // `checks[].findings` is the path the report-reading skill points at for the verification families.
  for (const family of ['verify', 'compose', 'data']) {
    const checks = REPORTS[family].checks
    if (!Array.isArray(checks) || checks.length === 0) throw new Error(family + ': no checks')
    for (const check of checks) if (!Array.isArray(check.findings)) throw new Error(family + ': a check without findings')
  }
})

test('the hash a report carries is the hash its payload describes', () => {
  // A reader copies `modelHash` into another tool; it has to be present whenever the report says it verified a model.
  for (const family of ['verify', 'data']) {
    const hash = REPORTS[family].modelHash
    if (typeof hash !== 'string' || hash.length < 32) throw new Error(family + ': no modelHash')
    if (REPORTS[family].hashes.modelHash !== hash) throw new Error(family + ': hashes.modelHash disagrees with modelHash')
  }
})

if (failures > 0) {
  console.log('doc-paths tests failed:', failures)
  process.exit(1)
}
console.log('all doc-paths tests passed')
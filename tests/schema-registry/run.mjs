// The schema registry: one versioned name per report family, and no two names the same.
//
// A `schema` is how a caller decides how to read a payload, so two families sharing a name would be read by one of them, wrongly. And a name no
// family reports is a name nobody uses - the registry is meant to be the list of what this plugin returns.
import { REPORT_SCHEMAS, runCompositionVerification, runVerification } from '../../lib/engine.js'
import { runDataVerification } from '../../lib/data-engine.js'
import { runDesignReview } from '../../lib/design-engine.js'
import { diffReports } from '../../lib/baseline.js'

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

const MACHINE = { schemaVersion: 1, init: 'i', states: [{ id: 'i' }, { id: 'd', terminal: true }], transitions: [{ from: 'i', event: 'go', to: 'd' }] }
const TABLE = { schemaVersion: 1, entities: [{ name: 'A', fields: [{ name: 'id', type: 'int', required: true }], primaryKey: ['id'] }], relationships: [] }
const DESIGN = { schemaVersion: 1, architecture: { nodes: ['a', 'b'], edges: [['a', 'b']] } }

const REPORTS = {
  verify: runVerification(MACHINE),
  compose: runCompositionVerification([MACHINE, MACHINE]),
  datamodel: runDataVerification(TABLE),
  design: runDesignReview(DESIGN),
  baseline: diffReports(runVerification(MACHINE), runVerification(MACHINE)),
}

test('every name in the registry is unique', () => {
  const seen = new Map()
  for (const [key, value] of Object.entries(REPORT_SCHEMAS)) {
    if (seen.has(value)) throw new Error(value + ' is used by ' + String(seen.get(value)) + ' and ' + key)
    seen.set(value, key)
  }
})

test('every name is a versioned identifier of this plugin', () => {
  for (const [key, value] of Object.entries(REPORT_SCHEMAS)) {
    if (!/^model-everything\/[a-z-]+(\/[a-z-]+)?\/v\d+$/.test(String(value))) throw new Error(key + ': ' + String(value))
  }
})

test('each report carries the schema registered for its family', () => {
  for (const [key, report] of Object.entries(REPORTS)) {
    if (report.schema !== REPORT_SCHEMAS[key]) throw new Error(key + ': ' + String(report.schema) + ' against ' + String(REPORT_SCHEMAS[key]))
  }
})

test('a report never carries a schema the registry does not list', () => {
  const known = new Set(Object.values(REPORT_SCHEMAS))
  for (const [key, report] of Object.entries(REPORTS)) {
    if (!known.has(report.schema)) throw new Error(key + ' reports ' + String(report.schema) + ', which is not registered')
  }
})

if (failures > 0) {
  console.log('schema-registry tests failed:', failures)
  process.exit(1)
}
console.log('all schema-registry tests passed')
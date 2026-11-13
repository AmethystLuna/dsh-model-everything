// The datamodel family's four regression inputs, and what each one turns on.
//
// A regression check that cannot run must say `skip`, not `pass` - the difference this repository has had to fix once already. And each optional
// input has to change an answer, or it is a parameter nobody needs.
import { runDataVerification } from '../../lib/data-engine.js'

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

const table = (fields, name = 'A') => ({
  schemaVersion: 1,
  entities: [{ name, fields, primaryKey: ['id'] }],
  relationships: [],
})

const AFTER = table([{ name: 'id', type: 'int', required: true }, { name: 'new_field', type: 'text' }])
const BEFORE = table([{ name: 'id', type: 'int', required: true }, { name: 'old_field', type: 'text' }])

const checkOf = (report, id) => (report.checks ?? []).find((check) => check.id === id)
const codesOf = (report) => [...new Set((report.checks ?? []).flatMap((check) => (check.findings ?? []).map((finding) => finding.code)))]

test('the regression checks join the roster only when beforeModel is supplied', () => {
  // The house convention, shared with `model_verify`: D1-D4 and DD1-DD4 are not on the roster when there is no before model, and the skip is
  // stated where the input would have come from - DA5 for the datamodel family. Asserting a `skip` roster here would have been my own
  // invention; the check is that the reason is said somewhere, not that the list is longer.
  const report = runDataVerification(AFTER)
  const ids = (report.checks ?? []).map((check) => check.id)
  for (const id of ['DD1', 'DD2', 'DD3', 'DD4']) {
    if (ids.includes(id)) throw new Error(id + ' is on the roster with no before model')
  }
  const da5 = checkOf(report, 'DA5')
  if (da5?.status !== 'skip') throw new Error('DA5 is ' + String(da5?.status))
  if (!String(da5?.detail).includes('no beforeModel')) throw new Error('DA5 does not say why: ' + String(da5?.detail))
  const withBefore = runDataVerification(AFTER, { beforeModel: BEFORE })
  const after = (withBefore.checks ?? []).map((check) => check.id)
  for (const id of ['DD1', 'DD2', 'DD3', 'DD4']) {
    if (!after.includes(id)) throw new Error(id + ' did not join the roster with a before model')
  }
})

test('a dropped field with no mapping is an error in DA5 and DD1', () => {
  const report = runDataVerification(AFTER, { beforeModel: BEFORE })
  const codes = codesOf(report)
  for (const code of ['DA5_FIELD_NOT_MIGRATED', 'DD1_FIELD_REMOVED']) {
    if (!codes.includes(code)) throw new Error('missing ' + code + ': ' + codes.join(','))
  }
  if (report.verdict !== 'fail') throw new Error('verdict ' + String(report.verdict))
  const dd1 = checkOf(report, 'DD1')
  if (dd1?.status !== 'fail') throw new Error('DD1 is ' + String(dd1?.status))
})

test('a migration mapping for that field turns the error into a warning', () => {
  const report = runDataVerification(AFTER, {
    beforeModel: BEFORE,
    migrationMappings: [{ from: 'A.old_field', to: 'A.new_field', transform: 'rename' }],
  })
  const codes = codesOf(report)
  if (codes.includes('DA5_FIELD_NOT_MIGRATED')) throw new Error('a mapped field still reads as unmigrated')
  if (codes.includes('DD1_FIELD_REMOVED')) throw new Error('a mapped field still reads as removed')
  // The removal itself is still reported: a mapping says where the data went, not that nothing changed.
  if (!codes.includes('DD3_REMOVED_FIELD')) throw new Error('the removal disappeared from the delta: ' + codes.join(','))
  if (report.verdict === 'fail') throw new Error('a mapped rename still fails the run')
})

test('copy pairs and backup pairs are skips until they are declared', () => {
  const without = runDataVerification(AFTER, { beforeModel: BEFORE })
  const withoutCodes = codesOf(without)
  if (withoutCodes.some((code) => code.startsWith('DA6_') || code.startsWith('DA7_'))) {
    throw new Error('a copy finding appeared with no copy pairs: ' + withoutCodes.join(','))
  }
  const pairs = [{ id: 'p1', sourceEntity: 'A', targetEntity: 'A', mapping: { id: 'id', old_field: 'new_field' } }]
  const withPairs = runDataVerification(AFTER, { beforeModel: BEFORE, copyPairs: pairs })
  const da6 = checkOf(withPairs, 'DA6')
  if (da6 === undefined || da6.status === 'skip') throw new Error('DA6 did not run with a copy pair: ' + String(da6?.status))
})

if (failures > 0) {
  console.log('datamodel-inputs tests failed:', failures)
  process.exit(1)
}
console.log('all datamodel-inputs tests passed')
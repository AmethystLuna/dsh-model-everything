// The model hash: what it promises, and what it must not do.
//
// A hash is used to say "this is the same model", across a run, across a diff, across a re-recorded baseline. So it has to survive key order and
// repeat runs, and it has to move when anything real changes - a hash that did not move would make two different models look like one.
import { runCompositionVerification, runVerification } from '../../lib/engine.js'
import { runDataVerification } from '../../lib/data-engine.js'
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

const MODEL = { schemaVersion: 1, init: 'i', states: [{ id: 'i' }, { id: 'd', terminal: true }], transitions: [{ from: 'i', event: 'go', to: 'd' }] }
/** The same model with every object's keys written in a different order. */
const REORDERED = {
  transitions: [{ to: 'd', event: 'go', from: 'i' }],
  states: [{ id: 'i' }, { terminal: true, id: 'd' }],
  init: 'i',
  schemaVersion: 1,
}
const CHANGED = { ...MODEL, transitions: [{ from: 'i', event: 'stop', to: 'd' }] }

test('the same model hashes the same twice', () => {
  const first = runVerification(MODEL).modelHash
  const second = runVerification(MODEL).modelHash
  if (first !== second) throw new Error('two runs hashed differently')
  if (String(first).length === 0) throw new Error('the hash is empty')
})

test('key order does not change the hash', () => {
  // Canonical JSON, not `JSON.stringify`: otherwise the same model written by two tools would compare as two models.
  const straight = runVerification(MODEL).modelHash
  const shuffled = runVerification(REORDERED).modelHash
  if (straight !== shuffled) throw new Error('reordering the keys changed the hash')
})

test('a changed event changes the hash', () => {
  if (runVerification(MODEL).modelHash === runVerification(CHANGED).modelHash) throw new Error('a changed model kept its hash')
})

test('every report carries the hash spec beside the hash', () => {
  const reports = {
    verify: runVerification(MODEL),
    compose: runCompositionVerification([MODEL, MODEL]),
    datamodel: runDataVerification({ schemaVersion: 1, entities: [{ name: 'A', fields: [{ name: 'id', type: 'int', required: true }], primaryKey: ['id'] }], relationships: [] }),
    diff: diffReports(runVerification(MODEL), runVerification(CHANGED)),
  }
  for (const [name, report] of Object.entries(reports)) {
    const spec = report.hashSpec ?? report.hashes?.hashSpec
    // A diff has no model of its own: its subject is the difference between two reports that each carry their own hash.
    if (spec === undefined && name === 'diff') continue
    if (spec === undefined) throw new Error(name + ' carries no hashSpec')
    if (name === 'compose') {
      // A composition is several models, so there is no single hash: it carries one per machine. That is the design, not a gap.
      const machines = report.hashes?.machines ?? []
      if (machines.length !== 2) throw new Error('compose hashes ' + String(machines.length) + ' machine(s)')
      for (const hash of machines) if (String(hash).length === 0) throw new Error('a machine hash is empty')
      continue
    }
    const hash = report.modelHash ?? report.hashes?.modelHash
    if (hash === undefined && name !== 'diff') throw new Error(name + ' carries no modelHash')
  }
})

if (failures > 0) {
  console.log('model-hash tests failed:', failures)
  process.exit(1)
}
console.log('all model-hash tests passed')
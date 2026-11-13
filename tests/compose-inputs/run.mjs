// The three optional inputs of a composition, each measured by what changes without it.
//
// A parameter that never changes an answer is decoration, and this repository has already found one such parameter once. So each of `rendezvous`,
// `shared` and `accesses` is checked the same way: a composition that passes, then the same composition with the input that makes a check speak.
import { runCompositionVerification } from '../../lib/engine.js'

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

const machine = (event) => ({
  schemaVersion: 1, init: 'i',
  states: [{ id: 'i' }, { id: 'd', terminal: true }],
  transitions: [{ from: 'i', event, to: 'd' }],
})

const codesOf = (report) => [...new Set((report.checks ?? []).flatMap((check) => (check.findings ?? []).map((finding) => finding.code)))]
const codeSet = (report) => codesOf(report).sort().join(',')

test('without the three inputs the composition passes and says nothing', () => {
  const report = runCompositionVerification([machine('go'), machine('go')])
  if (codeSet(report) !== '') throw new Error('a plain composition reported ' + codeSet(report))
  if (report.verdict !== 'pass') throw new Error('verdict ' + String(report.verdict))
})

test('a rendezvous nobody can fire is C2', () => {
  const resolved = runCompositionVerification([machine('go'), machine('go')], { rendezvous: ['go'] })
  if (codeSet(resolved) !== '') throw new Error('an event both machines fire was reported: ' + codeSet(resolved))
  const unresolved = runCompositionVerification([machine('go'), machine('go')], { rendezvous: ['never'] })
  if (!codeSet(unresolved).includes('C2_RENDEZVOUS_UNRESOLVED')) throw new Error('a handshake nobody fires was not C2: ' + codeSet(unresolved))
})

test('an unprotected shared write is C4, and one lock on both sides settles it', () => {
  const shared = [{ id: 'balance', initial: 0 }]
  const withoutLock = runCompositionVerification([machine('write'), machine('write')], {
    shared,
    accesses: [
      { machine: 0, event: 'write', location: 'balance', kind: 'write' },
      { machine: 1, event: 'write', location: 'balance', kind: 'write' },
    ],
  })
  if (!codeSet(withoutLock).includes('C4_SHARED_WRITE_RACE')) throw new Error('two unguarded writes were not C4: ' + codeSet(withoutLock))
  // The lock has to be a declared location: `protectedBy` names a location, not a word.
  const locked = runCompositionVerification([machine('write'), machine('write')], {
    shared: [...shared, { id: 'mutex' }],
    accesses: [
      { machine: 0, event: 'write', location: 'balance', kind: 'write', protectedBy: 'mutex' },
      { machine: 1, event: 'write', location: 'balance', kind: 'write', protectedBy: 'mutex' },
    ],
  })
  if (codeSet(locked) !== '') throw new Error('a guarded write was reported: ' + codeSet(locked))
})

test('a lock that `shared` does not declare is C3, and the message says so', () => {
  const report = runCompositionVerification([machine('write'), machine('write')], {
    shared: [{ id: 'balance', initial: 0 }],
    accesses: [
      { machine: 0, event: 'write', location: 'balance', kind: 'write', protectedBy: 'mutex' },
      { machine: 1, event: 'write', location: 'balance', kind: 'write', protectedBy: 'mutex' },
    ],
  })
  if (!codeSet(report).includes('C3_SHARED_ACCESS_INVALID')) throw new Error('an undeclared lock was not C3: ' + codeSet(report))
  const said = (report.checks ?? []).flatMap((check) => check.findings ?? []).map((finding) => String(finding.message)).join(' ')
  if (!/does not declare/.test(said)) throw new Error('the message does not say the lock is undeclared: ' + said.slice(0, 100))
})

test('a read-modify-write pair left co-enabled is C5', () => {
  const report = runCompositionVerification([machine('write'), machine('write')], {
    shared: [{ id: 'balance', initial: 0 }],
    accesses: [
      { machine: 0, event: 'write', location: 'balance', kind: 'read-write' },
      { machine: 1, event: 'write', location: 'balance', kind: 'read-write' },
    ],
  })
  if (!codeSet(report).includes('C5_NON_ATOMIC_UPDATE')) throw new Error('a lost update was not C5: ' + codeSet(report))
})

test('an access that names a machine the composition does not have is C3', () => {
  const report = runCompositionVerification([machine('write'), machine('write')], {
    shared: [{ id: 'balance', initial: 0 }],
    accesses: [{ machine: 'A', event: 'write', location: 'balance', kind: 'write' }],
  })
  if (!codeSet(report).includes('C3_SHARED_ACCESS_INVALID')) throw new Error('a bad machine reference was not C3: ' + codeSet(report))
})

if (failures > 0) {
  console.log('compose-inputs tests failed:', failures)
  process.exit(1)
}
console.log('all compose-inputs tests passed')
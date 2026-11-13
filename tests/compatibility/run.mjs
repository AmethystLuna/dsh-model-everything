// The compatibility declaration beside the record, which is the pair a release is judged on.
//
// `RELEASE.md` says the runtime range is the gate and the declaration is not - so the declaration must not contradict the gate, and a release it
// calls measured must have a row in the record. Both are drift checks: the two are edited at different times by different steps.
import { readFileSync } from 'node:fs'
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
const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))
const compatibility = pkg.dsh?.compatibility
const record = readFileSync(join(repo, 'DSH-COMPATIBILITY.md'), 'utf8')

test('the declaration carries a range, a release map and a profile list', () => {
  if (compatibility === undefined) throw new Error('package.json declares no dsh.compatibility')
  if (typeof compatibility.dsh !== 'string' || compatibility.dsh.trim() === '') throw new Error('no dsh range')
  if (compatibility.dshReleases === undefined || Object.keys(compatibility.dshReleases).length === 0) throw new Error('no dshReleases')
  if (!Array.isArray(compatibility.profiles) || compatibility.profiles.length === 0) throw new Error('no profiles')
})

test('the declared range is the range the host actually reads', () => {
  // The admission check reads `peerDependencies`; a declaration that disagrees is a sentence nothing enforces.
  if (compatibility.dsh !== pkg.peerDependencies?.dsh) {
    throw new Error('declared ' + String(compatibility.dsh) + ', peer range ' + String(pkg.peerDependencies?.dsh))
  }
})

test('every release the declaration calls measured has a row in the record', () => {
  const missing = Object.keys(compatibility.dshReleases).filter((release) => !record.includes(release))
  if (missing.length > 0) throw new Error('no evidence for ' + missing.join(', '))
})

test('a release status is one of the two words the record uses', () => {
  for (const [release, status] of Object.entries(compatibility.dshReleases)) {
    if (status !== 'compatible' && status !== 'unknown') throw new Error(release + ': ' + String(status))
  }
})

test('the declared profiles are host profiles, not free text', () => {
  for (const profile of compatibility.profiles) {
    if (!/^[a-z][a-z0-9-]*$/.test(String(profile))) throw new Error('not a profile name: ' + String(profile))
  }
})

if (failures > 0) {
  console.log('compatibility tests failed:', failures)
  process.exit(1)
}
console.log('all compatibility tests passed')
// The tarball a release ships: is it the same file when packed twice, and is it named for this manifest?
//
// A package that differs between two packs of one tree cannot be re-derived from a commit, so "this is what was published" becomes a claim nobody
// can re-check. The name matters too: a tarball still carrying the previous version is a release that shipped the old manifest.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

/** Pack once into a fresh directory and return the tarball's path and digest. */
const packOnce = () => {
  const target = mkdtempSync(join(tmpdir(), 'dme-pack-'))
  execFileSync('npm', ['pack', '--pack-destination', target], { cwd: repo, stdio: 'ignore', shell: true })
  const name = readdirSync(target).find((entry) => entry.endsWith('.tgz'))
  if (name === undefined) throw new Error('npm pack produced no tarball')
  const bytes = readFileSync(join(target, name))
  const digest = createHash('sha256').update(bytes).digest('hex')
  rmSync(target, { recursive: true, force: true })
  return { name, digest }
}

const first = packOnce()

test('the tarball is named after this package and this version', () => {
  const expected = String(pkg.name).replace(/^@[^/]+\//, '') + '-' + String(pkg.version) + '.tgz'
  if (first.name !== expected) throw new Error('packed ' + first.name + ', manifest says ' + expected)
})

test('two packs of one tree produce the same file', () => {
  const second = packOnce()
  if (first.digest !== second.digest) throw new Error('two packs differ: ' + first.digest.slice(0, 12) + ' and ' + second.digest.slice(0, 12))
})

if (failures > 0) {
  console.log('tarball tests failed:', failures)
  process.exit(1)
}
console.log('all tarball tests passed')
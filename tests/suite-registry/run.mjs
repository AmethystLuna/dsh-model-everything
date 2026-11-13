// The suites on disk and the suites the gate runs are the same set.
//
// A suite that exists and is not in `test:engine` never runs in CI and says nothing - it is a file, not a check. A listed suite that no longer
// exists fails the gate for the wrong reason. Neither shows up in any other suite, because they are both about the registry rather than about
// the engine.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
const engine = String(pkg.scripts['test:engine'] ?? '')
const listed = [...engine.matchAll(/node (tests\/[^\s&]+)/g)].map((match) => match[1])

/** Every `tests/<suite>/run.mjs` on disk. A root-level `.mjs` is a helper or the combined runner, not a suite. */
const onDisk = readdirSync(join(repo, 'tests'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(repo, 'tests', entry.name, 'run.mjs')))
  .map((entry) => 'tests/' + entry.name + '/run.mjs')

test('the registry was read, so the checks below mean something', () => {
  if (listed.length < 20) throw new Error('the gate lists ' + String(listed.length) + ' suites')
  if (onDisk.length < 20) throw new Error('the tree holds ' + String(onDisk.length) + ' suites')
})

test('every suite on disk runs in the gate', () => {
  const missing = onDisk.filter((suite) => !listed.includes(suite))
  if (missing.length > 0) throw new Error('not in test:engine: ' + missing.join(', '))
})

test('every suite the gate runs exists', () => {
  const phantom = listed.filter((suite) => !existsSync(join(repo, suite)))
  if (phantom.length > 0) throw new Error('listed and absent: ' + phantom.join(', '))
})

test('a suite is listed once', () => {
  const seen = new Set()
  const twice = listed.filter((suite) => {
    if (seen.has(suite)) return true
    seen.add(suite)
    return false
  })
  if (twice.length > 0) throw new Error('listed twice: ' + twice.join(', '))
})

test('the root modules are helpers and the runner, never suites', () => {
  // `full-suite.mjs` runs the combined path and the other two are imported by suites; listing any of them would run it twice or as a suite.
  for (const helper of ['tests/full-suite.mjs', 'tests/svg-document.mjs', 'tests/generated-text.mjs']) {
    if (!existsSync(join(repo, helper))) continue
    if (listed.includes(helper)) throw new Error(helper + ' is listed as a suite')
  }
})

if (failures > 0) {
  console.log('suite-registry tests failed:', failures)
  process.exit(1)
}
console.log('all suite-registry tests passed')
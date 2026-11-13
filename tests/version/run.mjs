// The version a release is cut at: every manifest that declares it, and nothing else in the tree.
//
// `bump --check` is the gate that a release version is stated the same way everywhere, and `--audit` is the one that no other file still carries a
// stale number. Both are run by hand at release time, which is exactly when they are least likely to be re-read - so the suite runs them and
// requires the answer.
import { execFileSync } from 'node:child_process'
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

const run = (flag) => {
  try {
    return { code: 0, output: execFileSync(process.execPath, [join(repo, 'scripts', 'bump-version.mjs'), flag], { cwd: repo, encoding: 'utf8' }) }
  } catch (error) {
    const failure = error
    return { code: failure.status ?? 1, output: String(failure.stdout ?? '') + String(failure.stderr ?? '') }
  }
}

test('the version the manifests declare is one string', () => {
  const { code, output } = run('--check')
  if (code !== 0) throw new Error('the declarations disagree: ' + output.slice(-200))
  if (!output.includes(String(pkg.version))) throw new Error('the report does not name ' + String(pkg.version))
})

test('no file outside the declaration still carries the current version', () => {
  const { code, output } = run('--audit')
  if (code !== 0) throw new Error('an undeclared file carries the version: ' + output.slice(-300))
})

test('the declaration file lists the manifests it holds to one version', () => {
  // A declaration nobody can read is a check nobody can audit: the list is the record of what "in sync" means.
  const declaration = JSON.parse(readFileSync(join(repo, '.version-bump.json'), 'utf8'))
  const files = declaration.files ?? declaration.targets ?? declaration
  const named = JSON.stringify(files)
  if (!named.includes('package.json')) throw new Error('package.json is not in the declaration')
})

if (failures > 0) {
  console.log('version tests failed:', failures)
  process.exit(1)
}
console.log('all version tests passed')
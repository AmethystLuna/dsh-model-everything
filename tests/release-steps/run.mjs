// The release checklist, read as an order rather than as a list of paths.
//
// `tests/docs-paths` already holds that every command and link in these documents exists. What it cannot say is whether the steps are in a workable
// order: a checklist that publishes before it runs the gate reads exactly like one that does not. Three orderings are checkable without interpreting
// the prose, and each of them is one a release has actually got wrong before.
import { readFileSync } from 'node:fs'

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
const text = readFileSync(repo + 'RELEASE.md', 'utf8')
const at = (needle) => {
  const index = text.indexOf(needle)
  if (index < 0) throw new Error('the checklist no longer names ' + JSON.stringify(needle))
  return index
}

test('the gate is run before the publish step', () => {
  // Publishing is the irreversible step: everything that can refuse the artifact has to come first.
  const gate = Math.max(at('npm run test:engine'), at('npm run typecheck'))
  const publish = at('## 3. Publish')
  if (gate > publish) throw new Error('the gate is listed after the publish section')
})

test('the version is bumped before the manifests are checked for agreement', () => {
  // `--check` answers "do the manifests agree", which is only a question after the bump.
  const bump = at('npm run bump -- <x.y.z>')
  const check = at('npm run bump -- --check')
  if (bump > check) throw new Error('the agreement check comes before the bump')
})

test('a clean tree is the first thing the checklist asks for', () => {
  // Every later step rewrites a manifest or the build, so an unclean tree makes the diff unattributable.
  const items = text.split('\n').filter((line) => line.startsWith('- [ ]'))
  if (items.length === 0) throw new Error('the checklist has no items')
  if (!/git status/.test(items[0])) throw new Error('the first item is ' + JSON.stringify(items[0].slice(0, 60)))
})

test('the published artifact is installed and mounted before the release is called done', () => {
  const mount = at('Mount check, in an isolated home')
  const publish = at('## 3. Publish')
  const install = at('install the published artifact into a scratch')
  if (mount > install) throw new Error('the mount check is listed after the install of the published artifact')
  if (publish > install) throw new Error('the install of the artifact comes before the publish')
})

if (failures > 0) {
  console.log('release-steps tests failed:', failures)
  process.exit(1)
}
console.log('all release-steps tests passed')
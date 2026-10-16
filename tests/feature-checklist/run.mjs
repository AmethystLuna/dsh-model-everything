// The checklist has to describe the repository as it is, and it is the document most likely to go stale:
// a gate added tomorrow makes it incomplete, a suite renamed makes it wrong.
//
// So it is generated, and this re-generates it. Beyond the drift check, two things are asserted that a
// generator alone would not catch: that the checklist names every suite CI runs, and that it does not
// restate a rule whose home is elsewhere.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
let failures = 0
const test = (name, fn) => {
  try {
    fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', String(error.message).slice(0, 260))
  }
}

test('the checklist is the one the repository produces now', () => {
  const before = readFileSync(repo + 'docs/feature-checklist.md', 'utf8')
  execFileSync(process.execPath, [repo + 'docs/feature-checklist/generate.mjs'], { encoding: 'utf8', timeout: 300_000 })
  const after = readFileSync(repo + 'docs/feature-checklist.md', 'utf8')
  if (before !== after) {
    throw new Error('the checklist drifted from the repository. Run `node docs/feature-checklist/generate.mjs` and read the diff: a gate, a suite or a path moved.')
  }
})

test('the checklist names every suite the chain runs', () => {
  const pkg = JSON.parse(readFileSync(repo + 'package.json', 'utf8'))
  const suites = pkg.scripts['test:engine']
    .split(' && ')
    .map((step) => step.replace('node ', ''))
    .filter((step) => step.startsWith('tests/'))
    .map((step) => step.split('/')[1])
  const checklist = readFileSync(repo + 'docs/feature-checklist.md', 'utf8')
  const missing = suites.filter((suite) => !checklist.includes('`' + suite + '`'))
  if (missing.length > 0) {
    throw new Error('the checklist does not list: ' + missing.join(', ') + '. A new suite belongs in the reference table so the next change knows it exists.')
  }
})

test('the checklist points at the rules instead of restating them', () => {
  const checklist = readFileSync(repo + 'docs/feature-checklist.md', 'utf8')
  // The rules have homes: AGENTS.md for how to work, tests/AGENTS.md for test methodology, CONTRIBUTING
  // for what to send, RELEASE for versioning. A checklist that copied them would be a fourth copy.
  for (const home of ['AGENTS.md', 'tests/AGENTS.md', 'CONTRIBUTING.md', 'RELEASE.md']) {
    if (!checklist.includes(home)) throw new Error('the checklist does not point at ' + home)
  }
  // And it must be reachable from the guide a contributor reads first.
  const contributing = readFileSync(repo + 'CONTRIBUTING.md', 'utf8')
  if (!contributing.includes('feature-checklist')) {
    throw new Error('CONTRIBUTING.md does not point at the checklist, so a contributor will not find it')
  }
})

test('every literal path the checklist names resolves', () => {
  const checklist = readFileSync(repo + 'docs/feature-checklist.md', 'utf8')
  // A path carrying `<name>` is one the author creates; a literal path has to be on disk. Only paths
  // INTO the repository are checked - `tests/<suite>/run.mjs` style names come from the chain.
  const named = [...checklist.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1])
    .filter((value) => !value.includes('<') && !value.includes(' '))
    .filter((value) => value.startsWith('src/') || value.startsWith('docs/') || value.startsWith('.github/') || value.startsWith('tests/') || value.startsWith('skills/') || value.endsWith('.md') || value.endsWith('.json'))
  if (named.length === 0) throw new Error('the checklist names no paths; this check would pass vacuously')
  const absent = [...new Set(named)].filter((path) => !existsSync(repo + path))
  if (absent.length > 0) throw new Error('the checklist names paths that are not there: ' + absent.join(', '))
})

if (failures > 0) {
  console.log('feature checklist tests failed:', failures)
  process.exit(1)
}
console.log('all feature checklist tests passed')

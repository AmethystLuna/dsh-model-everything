// The documentation stays in step with what ships, and the bibliography stays a bibliography.
//
// The gap this guards is the one that actually happened: a skill, a guide and a routing map shipped
// while the README pair said nothing about them, because nothing compared the two. The check is on a
// REGISTRY of things that must be mentioned, not on prose - a missing mention fails, and adding to the
// registry is a deliberate act.
import { execFileSync } from 'node:child_process'
import { readNormalised } from '../generated-text.mjs'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
let failures = 0
const test = (name, fn) => {
  try {
    fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', String(error.message).slice(0, 240))
  }
}

/** Things a reader of the README should be able to find. Each names where it should be reachable from. */
const MUST_BE_MENTIONED = [
  { what: 'the report-reading skill', marker: 'model-everything-report-reading' },
  { what: 'the contribution guide', marker: 'CONTRIBUTING.md' },
  { what: 'the references list', marker: 'docs/references.md' },
  { what: 'the routing map', marker: 'docs/routing-map.md' },
  { what: 'the compatibility evidence', marker: 'DSH-COMPATIBILITY.md' },
]

test('both READMEs mention everything that must be reachable', () => {
  for (const name of ['README.md', 'README.en-US.md']) {
    const text = readFileSync(repo + name, 'utf8')
    const missing = MUST_BE_MENTIONED.filter((entry) => !text.includes(entry.marker)).map((entry) => entry.what)
    if (missing.length > 0) throw new Error(name + ' does not mention: ' + missing.join(', '))
  }
})

test('both READMEs list every shipped skill', () => {
  const skills = readdirSync(repo + 'skills', { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  for (const name of ['README.md', 'README.en-US.md']) {
    const text = readFileSync(repo + name, 'utf8')
    const missing = skills.filter((skill) => !text.includes(skill))
    if (missing.length > 0) throw new Error(name + ' does not list the skill(s): ' + missing.join(', '))
  }
})

test('the README pair stays in step section by section', () => {
  const headings = (name) => [...readFileSync(repo + name, 'utf8').matchAll(/^#{2,3} /gm)].length
  const zh = headings('README.md')
  const en = headings('README.en-US.md')
  // The pair is maintained together, so a section added to one and not the other is the defect.
  if (zh !== en) throw new Error('the pair has ' + String(zh) + ' and ' + String(en) + ' sections; they move in one commit')
})

test('every relative link in the README pair resolves', () => {
  for (const name of ['README.md', 'README.en-US.md']) {
    const text = readFileSync(repo + name, 'utf8')
    const links = [...text.matchAll(/\]\(([^)#][^)]*)\)/g)].map((match) => match[1]).filter((link) => !link.startsWith('http'))
    if (links.length === 0) throw new Error(name + ' links nothing; this check would pass vacuously')
    const missing = links.filter((link) => !existsSync(repo + link))
    if (missing.length > 0) throw new Error(name + ' links paths that do not exist: ' + missing.join(', '))
  }
})

test('the documentation mind map is the one the repository produces now', () => {
  const before = readNormalised(repo + 'docs/documentation/mindmap.mmd')
  execFileSync(process.execPath, [repo + 'docs/documentation/generate-mindmap.mjs'], { encoding: 'utf8', timeout: 300_000 })
  const after = readNormalised(repo + 'docs/documentation/mindmap.mmd')
  if (before !== after) throw new Error('the map drifted: the README gaps or the provenance list moved')
})

test('the references list is the one the provenance tables produce now', () => {
  const before = readNormalised(repo + 'docs/references.md')
  execFileSync(process.execPath, [repo + 'docs/references/generate.mjs'], { encoding: 'utf8', timeout: 300_000 })
  const after = readNormalised(repo + 'docs/references.md')
  if (before !== after) throw new Error('the references drifted from the provenance tables they are extracted from')
})

test('every reference names where it is cited, and no entry is a fragment', () => {
  const text = readFileSync(repo + 'docs/references.md', 'utf8')
  // Only the bibliography sections: the two sections after them list external checkers and the checks
  // that have no published source, and neither is a citation of a work.
  const bibliography = text.split(/^## /m).slice(1).filter((section) => section.startsWith('Verification,') || section.startsWith('Data models') || section.startsWith('Graph theory'))
  if (bibliography.length !== 3) throw new Error('expected the three bibliography sections, found ' + String(bibliography.length))
  const entries = []
  for (const section of bibliography) for (const match of section.matchAll(/^- (.+)$/gm)) entries.push(match[1])
  if (entries.length === 0) throw new Error('the bibliography is empty')
  for (const section of bibliography) {
    const cited = [...section.matchAll(/^ {2}<br>cited by (.+)$/gm)].length
    const listed = [...section.matchAll(/^- (.+)$/gm)].length
    if (cited < listed) throw new Error('a section lists ' + String(listed) + ' works but says where only ' + String(cited) + ' are cited')
  }
  // A publisher or a venue on its own is not a work: the extraction once produced "Press 2008" and
  // "Wesley (2002)" from truncated names, and this is what would have caught it.
  const fragments = entries.filter((entry) => /^(?:MIT )?(?:Press|Wesley|Wiley|Springer|ACM|IEEE)\b/.test(entry))
  if (fragments.length > 0) throw new Error('the list carries fragments of a citation rather than works: ' + fragments.join(' | '))
})

// The release checklist told the releaser to run `npm ci`, which stops with `ETARGET` before installing anything: this
// package's peer range names a `dsh` the public registry does not have. CI had already learned the flag; the checklist
// had not, and nothing compared them. It does now.
test('the release checklist installs the way CI does', () => {
  const workflow = readFileSync(repo + '.github/workflows/dsh-bundle.yml', 'utf8')
  const ci = /run: (npm ci[^\n]*)/.exec(workflow)?.[1]?.trim()
  if (ci === undefined) throw new Error('the workflow has no npm ci step to compare against')
  const checklist = readFileSync(repo + 'RELEASE.md', 'utf8')
  const install = /^- \[ \] `(npm ci[^`]*)`/m.exec(checklist)?.[1]
  if (install === undefined) throw new Error('the release checklist has no install step')
  if (install !== ci) throw new Error('the checklist says `' + install + '` while CI runs `' + ci + '`')
  // And the half a reader is asked to run first thing is the same one, so the guide cannot drift from either.
  for (const name of ['CONTRIBUTING.md', 'docs/contributing/guide.zh-CN.md']) {
    if (!readFileSync(repo + name, 'utf8').includes(ci)) throw new Error(name + ' does not carry `' + ci + '`')
  }
})

// The compatibility record lists what the installed copy must contain, and that list is a claim about the
// package: it said "7 skills" after the eighth shipped, and it never mentioned the drawing row or its lib file.
// Counted here, so the next one cannot drift.
test('the compatibility record counts what the package ships', () => {
  const text = readFileSync(repo + 'DSH-COMPATIBILITY.md', 'utf8')
  const claim = /#\s+(\d+) skills with SKILL\.md/.exec(text)?.[1]
  if (claim === undefined) throw new Error('the record no longer states a skill count; this check would pass vacuously')
  const skills = readdirSync(repo + 'skills', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(repo + 'skills/' + entry.name + '/SKILL.md')).length
  if (Number(claim) !== skills) throw new Error('the record says ' + claim + ' skills; the package ships ' + String(skills))
  // Every row the bundle inserts, and every lib entry it links to, is named by the record.
  const rows = [...readFileSync(repo + 'cordis.patch.yml', 'utf8').matchAll(/^\s+- id: (.+)$/gm)].map((match) => match[1].trim())
  if (rows.length !== 3) throw new Error('the bundle inserts ' + String(rows.length) + ' rows; the record describes three')
  for (const row of rows) {
    const suffix = row.replace('dsh-model-everything', '').replace(/^-/, '')
    const lib = 'lib/' + (suffix === '' ? 'index' : suffix) + '.js'
    if (!existsSync(repo + lib)) throw new Error('the row ' + row + ' has no ' + lib)
    if (suffix !== '' && !text.includes(lib)) throw new Error('the record does not name ' + lib)
  }
  if (!text.includes(String(rows.length) + ' rows') && !text.includes('three rows')) throw new Error('the record does not say how many rows the bundle inserts')
})

if (failures > 0) {
  console.log('documentation tests failed:', failures)
  process.exit(1)
}
console.log('all documentation tests passed')

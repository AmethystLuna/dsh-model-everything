// Make docs/usage/guide.md a checked document rather than a claim: every number in it, and the two
// host facts it rests on, are re-measured here.
//
// A guide about raising usage is worthless if its counts are stale - the reader would size the wrong
// surface. This is the same discipline the repository applies to its other generated maps.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

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

test('the usage map is the one the plugin and the host produce now', () => {
  const before = readFileSync(repo + 'docs/usage/mindmap.mmd', 'utf8')
  execFileSync(process.execPath, [repo + 'docs/usage/generate-mindmap.mjs'], { encoding: 'utf8', timeout: 300_000 })
  const after = readFileSync(repo + 'docs/usage/mindmap.mmd', 'utf8')
  if (before !== after) throw new Error('the map drifted: a surface cost, a tool count or a host fact moved')
})

test('the guide quotes the numbers the measurement produces', () => {
  const facts = JSON.parse(readFileSync(repo + 'docs/usage/facts.json', 'utf8'))
  // Normalise the guide's whitespace: prose wraps, so a number can straddle a line break.
  const guide = readFileSync(repo + 'docs/usage/guide.md', 'utf8').replace(/\s+/g, ' ')
  const expected = [
    String(facts.surfaces.catalog),
    String(facts.surfaces.toolChars),
    String(facts.surfaces.references),
    String(facts.surfaces.bodies),
    String(facts.surfaces.referenceFiles),
    String(facts.toolsWithWhen),
    String(facts.surfaces.toolCount),
    String(facts.routingFamilies.length),
  ]
  const missing = expected.filter((value) => !guide.includes(value))
  if (missing.length > 0) throw new Error('the guide does not quote these measured values: ' + missing.join(', '))
  // And the two host facts, which are the premise of the whole argument.
  if (!guide.includes(facts.hostFacts.catalogBudget)) throw new Error('the guide does not quote the catalog budget: ' + facts.hostFacts.catalogBudget)
})

test('the guide names the host mechanism behind its central claim', () => {
  const guide = readFileSync(repo + 'docs/usage/guide.md', 'utf8')
  // The claim is that one surface truncates and the other does not; a reader has to be able to check it.
  for (const marker of ['CATALOG_DESCRIPTION_MAX_LENGTH', 'dsh-tool-skill']) {
    if (!guide.includes(marker)) throw new Error('the guide does not name ' + marker + ', so its central claim cannot be checked')
  }
})

test('every surface the guide tabulates is one the plugin actually has', () => {
  const facts = JSON.parse(readFileSync(repo + 'docs/usage/facts.json', 'utf8'))
  const guide = readFileSync(repo + 'docs/usage/guide.md', 'utf8')
  // A surface named in the guide that the generator did not measure would be an invented one.
  for (const key of Object.keys(facts.surfaces)) {
    if (key === 'toolCount' || key === 'referenceFiles') continue
    if (facts.surfaces[key] === 0) continue
  }
  for (const surface of ['catalog', 'bodies', 'references', 'toolChars']) {
    if (facts.surfaces[surface] === undefined) throw new Error('the generator stopped measuring ' + surface)
  }
  if (!guide.includes('5') && !guide.includes('五')) throw new Error('the guide does not state how many surfaces there are')
})

if (failures > 0) {
  console.log('usage guide tests failed:', failures)
  process.exit(1)
}
console.log('all usage guide tests passed')

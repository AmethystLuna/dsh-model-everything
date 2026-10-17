// The report-reading guide is a claim about the engines, so it is tested like one.
//
// Why this suite exists: the first draft of that guide made five false statements - that a failing
// review reports `ok: true` (a composition reports `false`), that the design levels are three (the
// level map carries two, and `facts` is one measurement object), and that every code is prefixed by
// a short check id (the family prefixes are longer). All five read as obviously true and none of them
// was. Prose about a report drifts the moment a field moves, and nothing catches that except a test.
//
// Three things are checked:
//   1. the mind map is the one the engines produce right now (regenerate and compare);
//   2. the same for the measured facts the guide quotes;
//   3. every code the guide names exists, and every field it names is in the report it claims.
import { readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const root = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const guideDir = root + 'docs/report-reading'

let failures = 0
const test = (name, fn) => {
  try {
    fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', String(error.message).slice(0, 220))
  }
}

test('the mind map is the one the engines produce now', () => {
  const before = readFileSync(guideDir + '/mindmap.mmd', 'utf8')
  execFileSync(process.execPath, [guideDir + '/generate-mindmap.mjs'], { encoding: 'utf8', timeout: 300_000 })
  const after = readFileSync(guideDir + '/mindmap.mmd', 'utf8')
  if (before !== after) {
    throw new Error('the map drifted; the guide in docs/report-reading/guide.md describes the old one. Run docs/report-reading/generate-mindmap.mjs and read the diff.')
  }
})

test('the measured facts are the ones the engines produce now', () => {
  const facts = JSON.parse(readFileSync(guideDir + '/facts.json', 'utf8'))
  if (facts.universal.length === 0) throw new Error('the facts file is empty')
  // The fields the guide calls universal must be exactly the ones every family carries.
  const expected = ['ok', 'ran', 'verdict', 'verdictReason', 'schema', 'summary', 'nextSteps']
  if (JSON.stringify(facts.universal) !== JSON.stringify(expected)) {
    throw new Error('the universal skeleton changed: ' + JSON.stringify(facts.universal))
  }
  // The carriers the guide tabulates.
  const carriers = new Set(Object.values(facts.carrier))
  for (const carrier of ['checks[].findings', 'findings', 'none']) {
    if (!carriers.has(carrier)) throw new Error('the guide tabulates a carrier no family uses now: ' + carrier)
  }
})

test('the guide names only codes that exist', () => {
  const guide = readFileSync(guideDir + '/guide.md', 'utf8')
  const srcDir = root + 'src/'
  const declared = new Set()
  for (const file of readdirSync(srcDir)) {
    if (!file.endsWith('.ts')) continue
    const text = readFileSync(srcDir + file, 'utf8')
    for (const match of text.matchAll(/code: '([A-Z][A-Z0-9_]+)'/g)) declared.add(match[1])
    for (const match of text.matchAll(/\b([A-Z]{1,12}\d*_[A-Z0-9_]+)\b/g)) declared.add(match[1])
  }
  const named = new Set()
  for (const match of guide.matchAll(/`([A-Z][A-Z0-9_]*\d*_[A-Z0-9_]+)`/g)) named.add(match[1])
  const missing = [...named].filter((code) => !declared.has(code))
  if (missing.length > 0) throw new Error('the guide names codes nothing declares: ' + missing.join(', '))
  if (named.size === 0) throw new Error('the guide names no codes at all; the check would pass vacuously')
})

test('the guide names only fields the reports carry', () => {
  const guide = readFileSync(guideDir + '/guide.md', 'utf8')
  const facts = JSON.parse(readFileSync(guideDir + '/facts.json', 'utf8'))
  const known = new Set(facts.universal)
  for (const keys of Object.values(facts.extras)) for (const key of keys) known.add(key)
  // Report and finding members the guide names that are not per-family extras.
  for (const extra of [
    'hashes', 'modelHash', 'hashSpec', 'schemaVersion', 'currentVerdict', 'added', 'changed', 'removed',
    'findings', 'checks', 'violations', 'signals', 'facts', 'graph', 'notation', 'roundTrip', 'primary',
    'source', 'warnings', 'summary', 'errorCode', 'severity', 'code', 'message', 'detail', 'evidence',
    'status', 'truncated', 'boundNotes', 'layerViolations', 'checksSkipped', 'checksRun',
    // Members of the design review's `facts` measurement object.
    'density', 'ranks', 'articulationPoints', 'feedbackArcs', 'largestCycle', 'nodes', 'edges',
  ]) known.add(extra)
  // Values, not fields: the guide quotes these as the answer rather than as a member. `warn` is a RENDERED
  // label rather than a report field - the body groups a warning-only check under `warn` while the JSON
  // status for it stays `fail` - and the guide says as much, which is why it belongs here.
  for (const value of ['pass', 'fail', 'true', 'false', 'uml', 'skip', 'pass_with_findings', 'warn']) known.add(value)
  // A backticked lowerCamel identifier that is not a known name is a claim about a field that may not
  // exist. Codes are excluded: they are upper case.
  const named = new Set()
  for (const match of guide.matchAll(/`([a-z][A-Za-z]{2,})`/g)) named.add(match[1])
  const unknown = [...named].filter((field) => !known.has(field))
  if (unknown.length > 0) throw new Error('the guide names fields no report carries: ' + unknown.join(', '))
})

test('the published copies are in step with their sources', () => {
  // The package publishes `skills`, not `docs/`, so the guide has to live inside the skill to ship.
  // The generator writes the source; this asserts the copy the model actually reads matches it.
  execFileSync(process.execPath, [guideDir + '/sync-check.mjs'], { encoding: 'utf8', timeout: 60_000 })
})

test('the skill row fits the catalog budget with its triggers visible', () => {
  const skill = readFileSync(root + 'skills/model-everything-report-reading/SKILL.md', 'utf8')
  const match = /^description:\s*"([\s\S]*?)"\s*$/m.exec(skill)
  if (match === null) throw new Error('the skill has no description')
  const description = match[1]
  // 500 is the catalog budget and the last three characters are the ellipsis, so a trigger has to be
  // inside the first 497 or it is never shown to the model that has to route on it.
  if (description.length > 500) throw new Error('the row is ' + String(description.length) + ' characters; the budget is 500')
  const visible = description.slice(0, 497)
  for (const trigger of ['reading a report', 'verdict', 'not prove', 'reading order']) {
    if (!visible.toLowerCase().includes(trigger)) throw new Error('a trigger falls past the truncation: ' + trigger)
  }
  if (!/^Use when/.test(description)) throw new Error('the row must open with a trigger')
  if (!description.includes('model-everything')) throw new Error('the row must name the sibling skill that produces a model')
})

if (failures > 0) {
  console.log('report-reading tests failed:', failures)
  process.exit(1)
}
console.log('all report-reading tests passed')

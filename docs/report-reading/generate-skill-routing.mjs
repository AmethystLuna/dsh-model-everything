// The mind map behind the report-reading SKILL: where the method lives, and what routes to it.
//
// Generated from the shipped catalog rather than recalled, for the same reason as the reading map:
// a claim about routing is a claim about what is on disk, and this one measures it. The catalog
// budget matters here - a skill row is truncated at 500 characters, so the trigger has to fit.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Resolved from this file, never from a hardcoded checkout: the absolute path this used to
// carry was the only thing in the repository that described one particular machine, and it
// made the generator unrunnable anywhere else.
const root = fileURLToPath(new URL('../../', import.meta.url)).replaceAll('\\', '/').replace(/\/?$/, '/')
const skills = readdirSync(root + 'skills', { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)

const rows = []
for (const name of skills) {
  const text = readFileSync(root + 'skills/' + name + '/SKILL.md', 'utf8')
  const match = /^description:\s*"([\s\S]*?)"\s*$/m.exec(text)
  if (match === null) continue
  rows.push({ name, description: match[1], length: match[1].length })
}

console.log('=== the shipped catalog, as the model sees it ===')
console.log('  the row is truncated at 500 characters; the rest is never shown')
for (const row of rows.sort((a, b) => a.length - b.length)) {
  const over = row.length > 500 ? '  OVER BUDGET' : ''
  console.log('  ' + String(row.length).padStart(3) + '  ' + row.name + over)
}

/** Whether a description would survive the 500-character truncation with `needle` inside it. */
const visible = (description, needle) => description.slice(0, 497).includes(needle)

// The needle is the wording the SHIPPED ROW actually carries, and the right way to get it is to read
// the row rather than guess: a first version of this table probed for `verify`, `schema` and
// `architecture` in rows that word those triggers differently, and reported five false failures. The
// check is literal, so the probe has to be literal.
const questions = [
  { question: 'what does this report mean', needle: 'reading a report', owner: 'model-everything-report-reading' },
  { question: 'why did the verdict come out this way', needle: 'reading order', owner: 'model-everything-report-reading' },
  { question: 'which field do I act on', needle: 'what does the report not prove', owner: 'model-everything-report-reading' },
  { question: 'a document claims something checkable', needle: 'checkable', owner: 'model-everything' },
  { question: 'review this architecture', needle: 'architecture', owner: 'model-everything-structure' },
  { question: 'is this data guarantee sound', needle: 'data guarantee', owner: 'model-everything-datamodel' },
  { question: 'does this design keep its declarations', needle: 'declarations', owner: 'model-everything-design' },
  { question: 'is this thread-safe', needle: 'thread-safe', owner: 'model-everything-interleaving' },
  { question: 'draw this flow as UML', needle: 'UML', owner: 'model-everything-uml' },
]

console.log('')
console.log('=== which question routes where, and whether the trigger is VISIBLE ===')
for (const entry of questions) {
  const owner = rows.find((row) => row.name === entry.owner)
  const ownerText = owner === undefined ? '(a skill that does not exist yet)' : owner.name
  const fits = owner === undefined ? false : visible(owner.description, entry.needle)
  console.log('  ' + (fits ? 'visible' : 'NOT VISIBLE').padEnd(12) + entry.question.padEnd(38) + '-> ' + ownerText)
}

// --------------------------------------------------------------------------- the map --

const BAD = /[[\]{}]|-->/
const nodes = []
const add = (depth, text, root_ = false) => {
  if (!root_ && (BAD.test(text) || /^root\(\(/.test(text))) throw new Error('bad mermaid node text: ' + text)
  if (root_ && !/^root\(\(.*\)\)$/.test(text)) throw new Error('the root must use the root shape: ' + text)
  nodes.push('  '.repeat(depth) + text)
}

add(0, 'root((where the reading method lives))', true)
add(1, 'the question it answers')
add(2, 'what does this report mean')
add(2, 'why did the verdict come out this way')
add(2, 'which field do I act on')
add(2, 'what does it not prove')
add(1, 'why not fold it into the core skill')
add(2, 'the catalog row is truncated at five hundred characters')
add(2, 'the core row already spends its budget on verification triggers')
add(3, 'a reading trigger pushed in would fall past the cut')
add(2, 'a trigger nobody can see routes nowhere')
add(3, 'the match is literal, so wording matters')
add(2, 'the pointer is one way, and deliberately')
add(3, 'this row names the core skill as the producer')
add(3, 'the core row has no budget left for a back pointer')
add(4, 'adding one would push it past the truncation')
add(3, 'the gate needs only one side to name the other')
add(3, 'the corpus decides the boundary, in utterances')
add(1, 'why it is a skill and not a tool')
add(2, 'no field is missing from the reports')
add(3, 'reportView already selects digest or full')
add(3, 'report_diff already compares two of them')
add(2, 'a tool would restate the guidance it is meant to deliver')
add(2, 'the method is prose about fields that already exist')
add(1, 'what it owns')
add(2, 'the reading order')
add(2, 'where each family keeps its findings')
add(2, 'severity before code')
add(2, 'the two easy misreadings')
add(1, 'what it does not own')
add(2, 'how to produce a model, that is the core skill')
add(2, 'any per-domain check, that is the domain skill')
add(2, 'what a check proves about the code')
add(1, 'what it ships with')
add(2, 'the guide as a reference beside it')
add(2, 'the map that structures the guide')
add(2, 'a test that regenerates both and compares')

const map = ['mindmap', ...nodes].join('\n')

/** The same self-check the reading map uses; a malformed diagram is refused, not written. */
function checkMindmap(text) {
  const problems = []
  const lines = text.split('\n')
  if (lines[0] !== 'mindmap') problems.push('the first line must be mindmap')
  let previous = 0
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue
    const indent = line.length - line.trimStart().length
    if (indent % 2 !== 0) problems.push('odd indentation: ' + line)
    const depth = indent / 2
    if (depth > previous + 1) problems.push('a node skips a level: ' + line)
    previous = depth
    const label = line.trim()
    if (/[[\]{}]/.test(label)) problems.push('a shape delimiter in a label: ' + label)
    if (/-->/.test(label)) problems.push('an arrow in a label: ' + label)
  }
  return problems
}

const problems = checkMindmap(map)
console.log('')
console.log('=== the map self-check ===')
if (problems.length > 0) {
  console.log('MALFORMED; not written:')
  for (const problem of problems) console.log('  - ' + problem)
  process.exit(1)
}
console.log('  ' + String(nodes.length) + ' nodes, no malformed line')

const outDir = root + 'docs/report-reading'
mkdirSync(outDir, { recursive: true })
writeFileSync(outDir + '/skill-routing.mmd', map + '\n')
console.log('')
console.log('written: docs/report-reading/skill-routing.mmd')
console.log('')
console.log(map)

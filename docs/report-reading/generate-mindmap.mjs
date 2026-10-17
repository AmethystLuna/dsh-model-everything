// The mind map behind the report-reading guide, generated from live reports.
//
// Why generated: a hand-drawn structure drifts. The routing map in this repository earned its keep
// that way, and it caught a wrong claim about a notation while it was being written. This one reads
// the reports the engines actually produce, so a field that moves shows up as a changed map rather
// than as prose that quietly became wrong.
//
// It also self-checks the Mermaid syntax before emitting, and refuses to write a malformed diagram.
import { mkdirSync, writeFileSync } from 'node:fs'

const base = 'file:///F:/workspace/dsh-plugins/dsh-model-everything/lib/'
const { runVerification, runCompositionVerification, REPORT_SCHEMAS } = await import(base + 'engine.js')
const { runDataVerification } = await import(base + 'data-engine.js')
const { runDesignReview } = await import(base + 'design-engine.js')
const { reviewStructure } = await import(base + 'structure.js')
const { reviewUml } = await import(base + 'uml.js')
const { runConcurrencyScan } = await import(base + 'concurrency.js')
const { diffReports } = await import(base + 'baseline.js')

// One `_`-prefixed key on purpose: the schema ignores it as annotation metadata and the report echoes its path in
// `metadataKeys`. Without a sample that carries one, that field belongs to no measured family and the guide cannot
// name it - which is how it stayed unrendered for so long.
const machine = { schemaVersion: 1, _source: 'report-reading sample', init: 'A', states: [{ id: 'A' }, { id: 'B', terminal: true }], transitions: [{ from: 'A', event: 'go', to: 'B' }] }
const second = { schemaVersion: 1, init: 'P', states: [{ id: 'P', terminal: true }], transitions: [] }

/** Where each family keeps its findings, measured rather than assumed. */
const reports = {
  verify: { report: runVerification(machine), tool: 'model_verify' },
  compose: { report: runCompositionVerification([machine, second]), tool: 'model_compose_verify' },
  datamodel: { report: runDataVerification({ schemaVersion: 1, entities: [{ name: 'U', fields: [{ name: 'id', type: 'uuid' }] }] }), tool: 'model_datamodel_verify' },
  design: { report: runDesignReview({ schemaVersion: 1, architecture: { nodes: ['a', 'b'], edges: [['a', 'b']] } }), tool: 'model_design_review' },
  structure: { report: reviewStructure({ diagram: 'component a\ncomponent b\na --> b\n' }), tool: 'uml_structure_verify' },
  uml: { report: reviewUml({ model: machine, diagramKind: 'state' }), tool: 'uml review' },
  concurrency: { report: runConcurrencyScan('this code is thread-safe'), tool: 'model_concurrency_scan' },
  baseline: { report: diffReports(runVerification(machine), runVerification(machine)), tool: 'report_diff' },
}

/** Where a reader finds the findings, per family. */
const carrier = (report) => {
  if (Array.isArray(report.checks)) return 'checks[].findings'
  if (Array.isArray(report.findings)) return 'findings'
  return 'none'
}

const universal = ['ok', 'ran', 'verdict', 'verdictReason', 'schema', 'summary', 'nextSteps']

console.log('=== where the findings live, per family ===')
for (const [name, entry] of Object.entries(reports)) {
  const report = entry.report
  const counts = []
  if (Array.isArray(report.checks)) counts.push('checks=' + String(report.checks.length))
  if (Array.isArray(report.findings)) counts.push('findings=' + String(report.findings.length))
  for (const key of ['violations', 'signals', 'facts']) {
    if (Array.isArray(report[key])) counts.push(key + '=' + String(report[key].length))
  }
  console.log('  ' + name.padEnd(12) + carrier(report).padEnd(18) + counts.join(' '))
}

console.log('')
console.log('=== does every family carry the universal skeleton? ===')
for (const [name, entry] of Object.entries(reports)) {
  const missing = universal.filter((key) => entry.report[key] === undefined)
  console.log('  ' + name.padEnd(12) + (missing.length === 0 ? 'complete' : 'MISSING ' + missing.join(', ')))
}

// --------------------------------------------------------------------------- the map --

/** Mermaid mindmap node text cannot carry these; the self-check below proves it. */
const BAD_NODE_TEXT = /[[\]{}]|-->|==>/

const nodes = []
const add = (depth, text, shapes = false) => {
  // A node label may not carry a bracket: Mermaid reads those as the node's SHAPE. The root is the
  // one exception, and it carries the shape deliberately.
  if (!shapes && BAD_NODE_TEXT.test(text)) throw new Error('mermaid node text cannot carry brackets or arrows: ' + text)
  if (shapes && !/^root\(\(.*\)\)$/.test(text)) throw new Error('a shaped node must be the root form: ' + text)
  nodes.push('  '.repeat(depth) + text)
}

add(0, 'root((how to read a report))', true)

// 1. The three questions, in order. This is the spine of the guide.
add(1, 'the three questions in order')
add(2, 'did it run')
add(3, 'ran tells a refusal apart from a review')
add(3, 'a refusal carries no verdict to route on')
add(2, 'what did it decide')
add(3, 'verdict is the answer')
add(3, 'ok is not a verdict, see the misreadings')
add(3, 'verdictReason is the one-line why')
add(2, 'what should I do')
add(3, 'nextSteps is never empty')
add(3, 'it is derived from the findings')

// 2. The skeleton every family shares, generated from the reports above.
add(1, 'the skeleton every report shares')
for (const key of universal) add(2, key)
add(2, 'hashes and modelHash')
add(3, 'same input and same spec give the same hash')
add(3, 'a changed hash means the model changed')

// 3. Where the findings are. Measured, so the map cannot claim a shape that is not there.
add(1, 'where the findings are')
/** A field path as a phrase a reader can act on; the literal path belongs in the prose, not a map. */
const phrase = (where) => where === 'checks[].findings' ? 'inside each check' : where === 'none' ? 'nowhere, compare the three lists' : 'at the top level'
const byCarrier = new Map()
for (const [name, entry] of Object.entries(reports)) {
  const where = carrier(entry.report)
  if (!byCarrier.has(where)) byCarrier.set(where, [])
  byCarrier.get(where).push(name)
}
for (const [where, families] of byCarrier) add(2, phrase(where) + ': ' + families.join(' '))

// 4. Read the severity before the code.
add(1, 'read severity before the code')
add(2, 'error decides the verdict')
add(2, 'warning is reported and does not')
add(2, 'info is context')
add(2, 'undecided is not a pass')
add(3, 'truncated says the search stopped early')
add(3, 'an infinite state space is a finding of its own')

// 5. What each family adds beyond the skeleton.
const extras = new Map()
for (const [name, entry] of Object.entries(reports)) {
  const keys = Object.keys(entry.report).filter((key) => !universal.includes(key) && !['hashes', 'modelHash', 'hashSpec', 'schemaVersion'].includes(key))
  extras.set(name, keys.sort())
}
add(1, 'what each family adds')
for (const [name, keys] of extras) {
  if (keys.length === 0) continue
  // A design review's extra keys are three LISTS with different authority, which a bare list of key
  // names would flatten into one thing. Its own branch says which one decides.
  if (name === 'design') {
    add(2, 'design adds the graph numbers and three lists')
    continue
  }
  add(2, name + ' adds ' + keys.join(' '))
}
add(2, 'only violations decide, signals do not, facts are numbers')
add(3, 'no code is in both lists')

// 6. What the report does NOT tell you.
add(1, 'what a report does not tell you')
add(2, 'it is about the model not the code')
add(3, 'a clean verdict is evidence about the drawing')
add(2, 'a truncated search decided nothing')
add(2, 'a skipped check examined nothing')
add(3, 'skip and pass are different answers')

// 7. The two readings that are easy to get backwards. Both were wrong in a first draft of the guide
// and were corrected by measuring them; they earn a branch for that reason.
add(1, 'the two easy misreadings')
add(2, 'ok is not the verdict')
add(3, 'it means no error finding in most families')
add(3, 'a composition sets it false where verify sets it true')
add(2, 'a delta and a run answer different questions')
add(3, 'verdict is the delta, currentVerdict is the run')
add(3, 'an unchanged failing report is pass over fail')

const map = ['mindmap', ...nodes].join('\n')

// ------------------------------------------------------------------ the self-check --

/** Every node line in a mindmap must be indented text whose shape Mermaid accepts. */
function checkMindmap(text) {
  const problems = []
  const lines = text.split('\n')
  if (lines[0] !== 'mindmap') problems.push('the first line must be `mindmap`')
  let previousDepth = 0
  for (const line of lines.slice(1)) {
    if (line.trim() === '') continue
    const indent = line.length - line.trimStart().length
    if (indent % 2 !== 0) problems.push('odd indentation: ' + JSON.stringify(line))
    const depth = indent / 2
    if (depth > previousDepth + 1) problems.push('a node skips a level: ' + JSON.stringify(line))
    previousDepth = depth
    const label = line.trim()
    if (/[[\]{}]/.test(label)) problems.push('bracket in a node label: ' + JSON.stringify(label))
    if (/^-->|-->$/.test(label)) problems.push('arrow in a node label: ' + JSON.stringify(label))
    if (label.startsWith('-')) problems.push('a leading dash reads as a list item: ' + JSON.stringify(label))
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

const outDir = 'F:/workspace/dsh-plugins/dsh-model-everything/docs/report-reading'
mkdirSync(outDir, { recursive: true })
writeFileSync(outDir + '/mindmap.mmd', map + '\n')

// The measured facts the guide rests on, written out so a test can assert them rather than trusting
// prose. A guide is a claim about the engines; this is the claim in a form a machine can check.
const facts = {
  universal,
  verdicts: ['pass', 'pass_with_findings', 'fail'],
  carrier: Object.fromEntries(Object.entries(reports).map(([name, entry]) => [name, carrier(entry.report)])),
  extras: Object.fromEntries([...extras.entries()]),
  okByFamily: Object.fromEntries(Object.entries(reports).map(([name, entry]) => [name, entry.report.ok])),
  tools: Object.fromEntries(Object.entries(reports).map(([name, entry]) => [name, entry.tool])),
}
writeFileSync(outDir + '/facts.json', JSON.stringify(facts, null, 2) + '\n')
console.log('')
console.log('written: docs/report-reading/mindmap.mmd')
console.log('written: docs/report-reading/facts.json')
console.log('')
console.log(map)

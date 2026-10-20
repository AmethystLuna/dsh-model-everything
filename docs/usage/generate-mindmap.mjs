// The mind map behind the usage guide: the surfaces through which dsh exposes a plugin to a model, and
// what each one costs.
//
// Generated from the plugin and from the host, because both are measurable: the surfaces come from what
// dsh actually renders, and the costs come from the shipped text. A guide about raising usage has to
// start from what the model can see, not from what the author wishes it saw.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'

// Resolved from this file, never from a hardcoded checkout: the absolute path this used to carry
// was the only thing in the repository that described one particular machine, and it made the
// generator unrunnable anywhere else.
const repo = fileURLToPath(new URL('../../', import.meta.url)).replaceAll('\\', '/').replace(/\/?$/, '/')
const libUrl = pathToFileURL(join(repo, 'lib')).href + '/'
const host = process.env.APPDATA + '/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/'

const tokens = (text) => {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  return Math.round(cjk + (text.length - cjk) / 4)
}

// ---------------------------------------------------------------- what dsh actually renders --

/** The host facts this guide rests on, read from the installed dsh rather than recalled. */
const hostFacts = {}
// A CI runner has no installed dsh, and a checkout is not the place to demand one: the facts are a
// measurement OF THE HOST, not of this machine, so the recorded values are the right thing to reuse
// when no host is present. A readable host is always re-measured, so a host that changes its budget
// still shows up as drift on a machine that has one.
const previousFacts = existsSync(new URL('./facts.json', import.meta.url))
  ? (JSON.parse(readFileSync(new URL('./facts.json', import.meta.url), 'utf8')).hostFacts ?? {})
  : {}
const readHost = (label, path, pattern) => {
  if (!existsSync(path)) {
    hostFacts[label] = previousFacts[label] ?? 'no host in this checkout'
    return
  }
  try {
    const text = readFileSync(path, 'utf8')
    const match = pattern.exec(text)
    hostFacts[label] = match === null ? 'not found' : match[1]
  } catch { hostFacts[label] = 'unreadable' }
}
readHost('catalogBudget', host + 'dsh-tool-skill/lib/index.js', /CATALOG_DESCRIPTION_MAX_LENGTH\s*=\s*(\d+)/)
readHost('truncation', host + 'dsh-tool-skill/lib/index.js', /slice\(0,\s*([^)]+)\)\s*\+\s*'\.\.\.'/)
readHost('resourceHint', host + 'dsh-skill/lib/index.js', /(Load referenced resources[^`']{0,60})/)
console.log('=== what dsh renders, from the installed host ===')
for (const [label, value] of Object.entries(hostFacts)) console.log('  ' + label.padEnd(16) + value)

// ------------------------------------------------------------------------------- the plugin --

const skills = readdirSync(repo + 'skills', { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
let catalog = 0
let bodies = 0
let references = 0
let referenceFiles = 0
for (const skill of skills) {
  const dir = repo + 'skills/' + skill
  // Line endings are a checkout setting, not a property of the shipped text.
  const body = readFileSync(dir + '/SKILL.md', 'utf8').replaceAll('\r\n', '\n')
  bodies += body.length
  const match = /^description:\s*"([\s\S]*?)"\s*$/m.exec(body)
  const description = match === null ? '' : match[1]
  catalog += (description.length <= 500 ? description.length : 500) + skill.length
  if (!existsSync(dir + '/references')) continue
  for (const name of readdirSync(dir + '/references').filter((entry) => entry.endsWith('.md'))) {
    references += readFileSync(dir + '/references/' + name, 'utf8').replaceAll('\r\n', '\n').length
    referenceFiles += 1
  }
}

// The tool schemas, from the objects rather than the source text.
const modules = ['compose-tool.js', 'concurrency-tool.js', 'data-tool.js', 'design-tool.js', 'export-tool.js', 'report-diff-tool.js', 'structure-tool.js', 'uml-tool.js', 'tool.js']
const tools = []
for (const file of modules) {
  const mod = await import(libUrl + file)
  for (const value of Object.values(mod)) {
    if (value === null || typeof value !== 'object') continue
    if (typeof value.name !== 'string' || typeof value.description !== 'string' || value.parameters === undefined) continue
    // Measure the definition the model actually pays for: name, description and every parameter
    // description. Summing descriptions alone understated the surface by half once parameters
    // carried real text (modelPath, check).
    tools.push({ name: value.name, description: value.description, chars: JSON.stringify({ name: value.name, description: value.description, parameters: value.parameters }).length })
  }
}
const toolChars = tools.reduce((sum, tool) => sum + tool.chars, 0)
const toolsWithWhen = tools.filter((tool) => /\bUse when\b|\bWhen the\b|\bwhen you\b/.test(tool.description)).length

console.log('')
console.log('=== the plugin\'s four surfaces ===')
console.log('  catalog rows    ' + String(catalog).padStart(6) + ' chars  ~' + String(tokens('x'.repeat(catalog))).padStart(5) + ' tokens  every turn, truncated at 500 each')
console.log('  skill bodies    ' + String(bodies).padStart(6) + ' chars  ~' + String(tokens('x'.repeat(bodies))).padStart(5) + ' tokens  on load, one at a time')
console.log('  references      ' + String(references).padStart(6) + ' chars  ~' + String(tokens('x'.repeat(references))).padStart(5) + ' tokens  only if the model follows the hint (' + String(referenceFiles) + ' files)')
console.log('  tool schemas    ' + String(toolChars).padStart(6) + ' chars  ~' + String(tokens('x'.repeat(toolChars))).padStart(5) + ' tokens  every turn, never truncated')
console.log('  ' + String(tools.length) + ' tools, ' + String(toolsWithWhen) + ' of them open with a when clause')

// ---------------------------------------------------------------------------- the outputs --

const { runVerification, runCompositionVerification } = await import(libUrl + 'engine.js')
const { runDataVerification } = await import(libUrl + 'data-engine.js')
const { runDesignReview } = await import(libUrl + 'design-engine.js')
const { reviewStructure } = await import(libUrl + 'structure.js')
const { reviewUml } = await import(libUrl + 'uml.js')

const machine = { schemaVersion: 1, init: 'A', states: [{ id: 'A' }, { id: 'B', terminal: true }], transitions: [{ from: 'A', event: 'go', to: 'B' }] }
const other = { schemaVersion: 1, init: 'X', states: [{ id: 'X' }, { id: 'Y', terminal: true }], transitions: [{ from: 'X', event: 'ping', to: 'Y' }] }
// The probes use inputs that SUCCEED. A first version passed one machine twice to the composition, which
// deduplicates and refuses, so it measured the refusal's single step and reported that the family routes
// nowhere. A probe built on invalid input measures the refusal path, not the report.
const reports = {
  verify: runVerification(machine),
  compose: runCompositionVerification([machine, other]),
  datamodel: runDataVerification({ schemaVersion: 1, entities: [{ name: 'U', fields: [{ name: 'id', type: 'uuid' }] }] }),
  design: runDesignReview({
    schemaVersion: 1,
    architecture: { nodes: ['api', 'store'], edges: [['api', 'store']] },
    declare: { layers: [{ name: 'top', members: ['api'] }, { name: 'bottom', members: ['store'] }] },
    types: [
      { name: 'api', stereotype: 'component', responsibilities: [{ name: 'serve', uses: ['store'] }] },
      { name: 'store', stereotype: 'component' },
    ],
  }),
  structure: reviewStructure({ diagram: 'component a\ncomponent b\na --> b\n' }),
  uml: reviewUml({ model: machine, diagramKind: 'state' }),
}
const routingFamilies = Object.entries(reports).filter(([, report]) => (report.nextSteps ?? []).some((step) => tools.some((tool) => step.includes(tool.name)))).map(([name]) => name)
console.log('')
console.log('=== the fifth surface: what a result says next ===')
console.log('  ' + String(routingFamilies.length) + ' of ' + String(Object.keys(reports).length) + ' families name a sibling tool in nextSteps: ' + (routingFamilies.join(' ') || 'none'))

// --------------------------------------------------------------------------- the map --

const BAD = /[[\]{}]|-->/
const nodes = []
const add = (depth, text, isRoot = false) => {
  if (!isRoot && (BAD.test(text) || /^root\(\(/.test(text))) throw new Error('bad mermaid node text: ' + text)
  if (isRoot && !/^root\(\(.*\)\)$/.test(text)) throw new Error('the root must use the root shape: ' + text)
  nodes.push('  '.repeat(depth) + text)
}

add(0, 'root((how a plugin gets used))', true)

add(1, 'the five surfaces dsh gives a plugin')
add(2, 'the catalog row')
add(3, 'every turn, for every session')
add(3, 'truncated at ' + hostFacts.catalogBudget + ' characters')
add(4, 'the rest is never shown to the model')
add(2, 'the skill body')
add(3, 'only when the skill loads')
add(3, 'the model chooses, from the row alone')
add(2, 'the reference hint')
add(3, 'dsh points the model at the references after loading')
add(3, 'the model decides whether the summary was enough')
add(2, 'the tool schema')
add(3, 'every turn, and never truncated')
add(3, 'the only surface with no ceiling')
add(2, 'the result')
add(3, 'reaches the model only after it already chose')
add(3, 'the one place that can route mid-task')

add(1, 'what each surface costs')
add(2, 'per turn, paid whether or not it is used')
add(3, 'catalog rows, ' + String(catalog) + ' characters')
add(3, 'tool schemas, ' + String(toolChars) + ' characters')
add(2, 'on load, paid once')
add(3, 'a skill body, ' + String(bodies) + ' characters across all of them')
add(2, 'on follow-through')
add(3, 'references, ' + String(references) + ' characters if every hint is taken')

add(1, 'the asymmetry that decides everything')
add(2, 'the truncated surface is the one the model routes on')
add(2, 'the untruncated surface is the one it acts through')
add(3, 'so a when clause belongs in the tool description')
add(4, 'it is the only place with room for one')
add(2, 'and neither surface is read after a tool has run')
add(3, 'so the result has to carry the routing')

add(1, 'what the numbers say is missing')
add(2, String(toolsWithWhen) + ' of ' + String(tools.length) + ' tool descriptions open with a when clause')
add(3, 'the model reads these every turn and acts through them')
add(2, String(routingFamilies.length) + ' of ' + String(Object.keys(reports).length) + ' report families route to a sibling')
add(3, 'a report that says nothing next leaves the model where it was')
add(2, 'the catalog rows all fit, and none can grow')

add(1, 'the routes that do not depend on the model noticing')
add(2, 'a refusal names the sibling that would accept the input')
add(3, 'the model is already holding the wrong tool when it finds out')
add(2, 'nextSteps names the next tool, not the next idea')
add(3, 'a step the model cannot act on is a step it skips')
add(2, 'a finding code carries its domain in the prefix')
add(3, 'so the model can tell which skill explains it')
add(2, 'the report names the schema it follows')
add(3, 'the reading skill exists for exactly that')

add(1, 'where a usage claim is measurable')
add(2, 'the catalog, by the routing corpus')
add(3, 'measured at 93 of 93 on this plugin')
add(2, 'the tool surface, by the same method')
add(3, 'not measured yet: no corpus of tool-selection cases')
add(2, 'the result surface, by whether it names a sibling')
add(3, 'countable, and it is what the numbers above count')

const map = ['mindmap', ...nodes].join('\n')

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
    if (label.startsWith('-')) problems.push('a leading dash reads as a list item: ' + label)
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

const outDir = repo + 'docs/usage'
mkdirSync(outDir, { recursive: true })
writeFileSync(outDir + '/mindmap.mmd', map + '\n')
writeFileSync(outDir + '/facts.json', JSON.stringify({
  hostFacts,
  surfaces: { catalog, bodies, references, referenceFiles, toolChars, toolCount: tools.length },
  toolsWithWhen,
  routingFamilies,
  tools: tools.map((tool) => ({ name: tool.name, chars: tool.description.length })),
}, null, 2) + '\n')
console.log('')
console.log('written: docs/usage/mindmap.mmd')
console.log('written: docs/usage/facts.json')

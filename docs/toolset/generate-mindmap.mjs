// The map behind the toolset summary: how a model learns to use this plugin, in four measured orders of
// magnitude.
//
// Root is the question a reader has, not the inventory they could get from `docs/routing-map.md`. The
// numbers are measured here and written into both the map and facts.json, so the prose that follows the
// map can quote them instead of recalling them.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'

// Resolved from this file, never from a hardcoded checkout: the absolute path this used to carry
// was the only thing in the repository that described one particular machine.
const repo = fileURLToPath(new URL('../../', import.meta.url)).replaceAll('\\', '/').replace(/\/?$/, '/')
const libUrl = pathToFileURL(join(repo, 'lib')).href + '/'
const tokens = (text) => {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  return Math.round(cjk + (text.length - cjk) / 4)
}

// ------------------------------------------------------------------- the catalog, from the rows --

const skills = readdirSync(repo + 'skills', { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
const rows = []
for (const skill of skills) {
  // Line endings are a checkout setting, not a property of the shipped text.
  const body = readFileSync(repo + 'skills/' + skill + '/SKILL.md', 'utf8').replaceAll('\r\n', '\n')
  const description = /^description:\s*"([\s\S]*?)"\s*$/m.exec(body)[1]
  rows.push({ skill, chars: description.length, body: body.length, description })
}
const catalogChars = rows.reduce((sum, row) => sum + row.chars + row.skill.length + 2, 0)

// --------------------------------------------------------------------- the tools, from the objects --

const modules = ['compose-tool.js', 'concurrency-tool.js', 'data-tool.js', 'design-tool.js', 'edit-tool.js', 'export-tool.js', 'report-diff-tool.js', 'structure-tool.js', 'uml-tool.js', 'tool.js']
const tools = []
for (const file of modules) {
  const mod = await import(libUrl + file)
  for (const value of Object.values(mod)) {
    if (value === null || typeof value !== 'object') continue
    if (typeof value.name !== 'string' || typeof value.description !== 'string' || value.parameters === undefined) continue
    tools.push({ name: value.name, chars: value.description.length, description: value.description, definition: JSON.stringify({ name: value.name, description: value.description, parameters: value.parameters }).length })
  }
}
const toolChars = tools.reduce((sum, tool) => sum + tool.chars, 0)
const longest = tools.reduce((a, b) => (a.chars > b.chars ? a : b))

// ------------------------------------------------------- the routing properties, from the text --

// A non-goal can be stated two ways, and the second is stronger: negating the neighbouring job ("does
// not judge the design") or NAMING the sibling that owns it ("State machines: model-everything"). The
// first pattern alone reported `model-everything-datamodel` as lacking one, and reading the row showed
// it routes three neighbours by name.
const NEGATIVE = /\bdoes not\b|\bnot judge\b|\bnot the code\b|\bwithout judging\b|\bnever\b|\bonly reads\b|\bdo not\b|\bis not\b|\bnot a\b/i
const statesNonGoal = (text, siblings) => NEGATIVE.test(text) || siblings.length > 0
const rowsWithSibling = rows.filter((row) => [...row.description.matchAll(/\bmodel-everything[a-z-]*/g)].some((match) => match[0] !== row.skill))
const rowsWithNonGoal = rows.filter((row) => statesNonGoal(row.description, [...new Set([...row.description.matchAll(/\bmodel-everything[a-z-]*/g)].map((match) => match[0]))].filter((entry) => entry !== row.skill)))
const toolsWithSibling = tools.filter((tool) => tools.some((other) => other.name !== tool.name && tool.description.includes(other.name)))
const toolsWithNonGoal = tools.filter((tool) => statesNonGoal(tool.description, tools.filter((o) => o.name !== tool.name && tool.description.includes(o.name)).map((o) => o.name)))
const toolsWithoutSibling = tools.filter((tool) => !toolsWithSibling.includes(tool)).map((tool) => tool.name)

// --------------------------------------------- value routing: what each description decides --

// A description earns its space by answering three questions: what this decides, when it pays, and
// what to use instead. The second is the one a schema cannot carry, and the third is the one that
// keeps two look-alikes from being chosen at random. Both are read out of the description here, so a
// tool that stops stating its boundary shows up in the map rather than in a bad tool call.
const valueRouting = tools.map((tool) => {
  // A boundary is stated either by declining ("do not use it to ...") or by naming the tool that owns
  // the adjacent job ("for two machines, use model_compose_verify instead"). Both count; the second is
  // the stronger one, because it also tells the model where to go.
  const declines = /do not use|does not|is not|never|only (reads|reports)/i.test(tool.description)
  const instead = [...new Set([...tool.description.matchAll(/(model|uml)_[a-z_]+/g)].map((match) => match[0]))].filter((name) => name !== tool.name)
  return { name: tool.name, tokens: tokens('x'.repeat(tool.definition)), instead, statesBoundary: declines || instead.length > 0 }
})
const routingWithoutBoundary = valueRouting.filter((entry) => !entry.statesBoundary).map((entry) => entry.name)

// ----------------------------------------------------- the fifth surface, from real reports --

const { runVerification, runCompositionVerification } = await import(libUrl + 'engine.js')
const { runDataVerification } = await import(libUrl + 'data-engine.js')
const { runDesignReview } = await import(libUrl + 'design-engine.js')
const { reviewStructure } = await import(libUrl + 'structure.js')
const { reviewUml } = await import(libUrl + 'uml.js')

const machine = { schemaVersion: 1, init: 'A', states: [{ id: 'A' }, { id: 'B', terminal: true }], transitions: [{ from: 'A', event: 'go', to: 'B' }] }
const other = { schemaVersion: 1, init: 'X', states: [{ id: 'X' }, { id: 'Y', terminal: true }], transitions: [{ from: 'X', event: 'ping', to: 'Y' }] }
// Inputs that SUCCEED. A probe built on an invalid model measures the refusal path, which returns early
// with one step about the input - that is how the composition was once reported as routing nowhere.
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

console.log('=== measured ===')
console.log('  catalog: ' + String(catalogChars) + ' chars, longest row ' + String(Math.max(...rows.map((row) => row.chars))) + '/500')
console.log('  tools: ' + String(tools.length) + ' descriptions, ' + String(toolChars) + ' chars, longest ' + longest.name + ' at ' + String(longest.chars))
console.log('  rows naming a sibling ' + String(rowsWithSibling.length) + '/' + String(rows.length) + ', with a non-goal ' + String(rowsWithNonGoal.length) + '/' + String(rows.length))
console.log('  tools naming a sibling ' + String(toolsWithSibling.length) + '/' + String(tools.length) + ', with a non-goal ' + String(toolsWithNonGoal.length) + '/' + String(tools.length))
console.log('  families routing onward: ' + String(routingFamilies.length) + '/' + String(Object.keys(reports).length))

// ---------------------------------------------------------------------------------- the map --

const BAD = /[[\]{}]|-->/
const nodes = []
const add = (depth, text, isRoot = false) => {
  if (!isRoot && (BAD.test(text) || /^root\(\(/.test(text))) throw new Error('bad mermaid node text: ' + text)
  if (isRoot && !/^root\(\(.*\)\)$/.test(text)) throw new Error('the root must use the root shape: ' + text)
  nodes.push('  '.repeat(depth) + text)
}

add(0, 'root((how a model learns to use this plugin))', true)

add(1, 'four orders of magnitude, and only two of them are free')
add(2, 'the catalog: about four thousand characters, always visible')
add(3, String(rows.length) + ' rows, the longest at ' + String(Math.max(...rows.map((row) => row.chars))) + ' of 500')
add(4, 'a row past 500 loses its tail to the model, silently')
add(2, 'the tool descriptions: about ten thousand characters, always visible')
add(3, String(tools.length) + ' descriptions, the longest at ' + String(longest.chars) + ' characters')
add(4, 'no ceiling here, so a description grows without anything objecting')
add(2, 'a skill body: about nine thousand characters, on load')
add(3, 'the model chooses it from the row alone')
add(2, 'the references: about thirty-eight thousand characters, on follow-through')
add(3, 'the only part paid for by need rather than by default')

add(1, 'what the always-visible text has to carry')
add(2, 'the words a user would say')
add(3, 'matching is literal, so the phrasing decides')
add(4, 'read a report reaches the row, reading one does not')
add(2, 'the sibling that owns the adjacent case')
add(3, 'a row that names none leaves the model choosing between look-alikes')
add(2, 'the non-goal, beside the scope claim')
add(3, 'without it the neighbouring job gets done here, confidently and wrongly')
add(2, 'and nothing else')
add(3, 'the budget is why: space spent on praise is space not spent on a trigger')

add(1, 'where each property stands today')
add(2, 'skill rows: ' + String(rowsWithSibling.length) + ' of ' + String(rows.length) + ' name a sibling, ' + String(rowsWithNonGoal.length) + ' of ' + String(rows.length) + ' state a non-goal')
add(2, 'tool descriptions: ' + String(toolsWithSibling.length) + ' of ' + String(tools.length) + ' name a sibling, ' + String(toolsWithNonGoal.length) + ' of ' + String(tools.length) + ' state a non-goal')
add(3, 'the ones that name none: ' + toolsWithoutSibling.join(', '))
add(2, 'and the result routes onward in ' + String(routingFamilies.length) + ' of ' + String(Object.keys(reports).length) + ' families')
add(3, 'that is the only channel that can redirect a model mid-task')

add(1, 'the five routes that do not need luck')
add(2, 'a rejection names the tool that would accept the input')
add(3, 'the model is already holding the wrong one when it finds out')
add(2, 'nextSteps names a tool, not an idea')
add(2, 'a finding code carries its domain in the prefix')
add(2, 'the report states which schema it follows')
add(2, 'a description names its neighbour and its edge')

add(1, 'what each description decides, and what it costs to have it')
add(2, 'a description earns its space three ways: what it decides, when that pays, what to use instead')
for (const entry of valueRouting.filter((tool) => tool.statesBoundary)) {
  add(2, entry.name + ' - ' + String(entry.tokens) + ' tokens, ' + (entry.instead.length === 0 ? 'sends you nowhere else' : 'instead: ' + entry.instead.join(', ')))
}
add(2, routingWithoutBoundary.length === 0 ? 'every description states its boundary' : 'no stated boundary: ' + routingWithoutBoundary.join(', '))

add(1, 'why a map rather than a paragraph')
add(2, 'the budget is spatial, so the picture has to be spatial')
add(3, 'a row is a fixed width, and every sentence competes for it')
add(2, 'the reader is deciding what to add and where')
add(3, 'the answer differs by surface, so the surfaces are the branches')
add(2, 'and the numbers move')
add(3, 'a generated map is re-measured; a remembered one is wrong within a release')

add(1, 'what this map does not claim')
add(2, 'not that any input routes correctly')
add(3, 'the corpus measures constructed boundaries, not a distribution')
add(2, 'not that the tool surface has been measured at all')
add(3, 'there is no corpus of tool-selection cases yet')
add(2, 'not that a longer description is better')
add(3, 'it is only unbounded, which makes it the easiest surface to waste')

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

const outDir = repo + 'docs/toolset'
mkdirSync(outDir, { recursive: true })
const mapPath = outDir + '/mindmap.mmd'
const factsPath = outDir + '/facts.json'
const mapText = map + '\n'
const factsText = JSON.stringify({
  catalogChars,
  catalogRows: rows.map((row) => ({ skill: row.skill, chars: row.chars, body: row.body })),
  toolChars,
  tools: tools.map((tool) => ({ name: tool.name, chars: tool.chars })),
  perTurn: { chars: catalogChars + toolChars, tokens: tokens('x'.repeat(catalogChars + toolChars)) },
  routing: {
    rowsWithSibling: rowsWithSibling.length,
    rowsWithNonGoal: rowsWithNonGoal.length,
    rowCount: rows.length,
    toolsWithSibling: toolsWithSibling.length,
    toolsWithNonGoal: toolsWithNonGoal.length,
    toolCount: tools.length,
    toolsWithoutSibling,
    familiesRoutingOnward: routingFamilies.length,
    familyCount: Object.keys(reports).length,
  },
  valueRouting: {
    entries: valueRouting,
    withoutBoundary: routingWithoutBoundary,
  },
}, null, 2) + '\n'

// `--check` compares instead of writing, so a suite can hold this measurement without racing on the
// file. A test that regenerates and compares has to be able to ask "is it current" without mutating.
if (process.argv.includes('--check')) {
  const stale = []
  if (readFileSync(mapPath, 'utf8') !== mapText) stale.push('mindmap.mmd')
  if (readFileSync(factsPath, 'utf8') !== factsText) stale.push('facts.json')
  if (stale.length > 0) {
    console.log('STALE: ' + stale.join(', ') + ' - run `node docs/toolset/generate-mindmap.mjs` and read the diff')
    process.exit(1)
  }
  console.log('current: docs/toolset/mindmap.mmd and facts.json match the measurement')
  process.exit(0)
}

writeFileSync(mapPath, mapText)
writeFileSync(factsPath, factsText)
console.log('')
console.log('written: docs/toolset/mindmap.mmd')
console.log('written: docs/toolset/facts.json')

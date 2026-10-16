// The mind map behind the documentation update.
//
// Generated from the repository for the same reason the other three maps are: the update has to name
// what is actually missing and what actually exists. Two of the branches are measured - which
// capabilities and codes the README pair does not yet mention, and which citations the reference files
// actually carry - because both are easy to guess wrong.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'

const repo = 'F:/workspace/dsh-plugins/dsh-model-everything/'

/** What the README pair covers, and what has shipped since. */
const readme = { 'README.md': readFileSync(repo + 'README.md', 'utf8'), 'README.en-US.md': readFileSync(repo + 'README.en-US.md', 'utf8') }

const shippedSince = {
  'the report-reading skill': 'model-everything-report-reading',
  'the contribution guide': 'CONTRIBUTING',
  'the routing map': 'routing-map',
  'the reading guide': 'report-reading',
}
const mentionGaps = []
for (const [what, marker] of Object.entries(shippedSince)) {
  const missing = Object.entries(readme).filter(([, text]) => !text.includes(marker)).map(([name]) => name)
  if (missing.length > 0) mentionGaps.push({ what, missing })
}

/** Codes this session added, and whether the README pair names them. */
const newCodes = ['MATRIX_NODE_UNLAYERED', 'MATRIX_LAYER_MEMBER_UNKNOWN', 'MATRIX_JUDGES_NOTHING', 'MODEL_UNRESOLVED_EVENT', 'S6_UNBOUNDED_VARIABLE', 'DS5_INVARIANT_ENTITY_MISSING', 'DES12_UNKNOWN_TYPE']
const codeGaps = newCodes.filter((code) => Object.values(readme).every((text) => !text.includes(code)))

/** The citations the reference files carry, by kind. */
const citationFiles = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'lib') continue
    const path = dir + '/' + entry.name
    if (entry.isDirectory()) { walk(path); continue }
    if (!entry.name.endsWith('.md')) continue
    const text = readFileSync(path, 'utf8')
    if (/[Pp]rovenance/.test(text)) citationFiles.push({ path: path.replace(repo, ''), text })
  }
}
walk(repo + 'skills')
walk(repo + '.github/memory')

const referenceFiles = []
for (const skill of readdirSync(repo + 'skills', { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
  const refDir = repo + 'skills/' + skill + '/references'
  if (!existsSync(refDir)) continue
  for (const name of readdirSync(refDir).filter((entry) => entry.endsWith('.md'))) {
    const text = readFileSync(refDir + '/' + name, 'utf8')
    referenceFiles.push({ path: skill + '/references/' + name, hasProvenance: /[Pp]rovenance/.test(text) })
  }
}

const cited = citationFiles.filter((entry) => /\b(?:19|20)\d{2}\b/.test(entry.text)).length
const withoutProvenance = referenceFiles.filter((entry) => !entry.hasProvenance)

console.log('=== measured ===')
console.log('  README pair mention gaps: ' + String(mentionGaps.length) + ' (' + mentionGaps.map((gap) => gap.what).join('; ') + ')')
console.log('  new codes the README pair does not name: ' + String(codeGaps.length) + ' of ' + String(newCodes.length))
console.log('  reference files: ' + String(referenceFiles.length) + ', of which ' + String(referenceFiles.length - withoutProvenance.length) + ' carry a provenance section')
console.log('  files that carry citations: ' + String(cited))

// --------------------------------------------------------------------------- the map --

const BAD = /[[\]{}]|-->/
const nodes = []
const add = (depth, text, isRoot = false) => {
  if (!isRoot && (BAD.test(text) || /^root\(\(/.test(text))) throw new Error('bad mermaid node text: ' + text)
  if (isRoot && !/^root\(\(.*\)\)$/.test(text)) throw new Error('the root must use the root shape: ' + text)
  nodes.push('  '.repeat(depth) + text)
}

add(0, 'root((the documentation update))', true)

add(1, 'what has to be documented')
add(2, 'what shipped since the README was written')
for (const gap of mentionGaps) add(3, gap.what + ' is missing from ' + String(gap.missing.length) + ' of the README pair')
add(2, 'the codes this work added')
add(3, String(codeGaps.length) + ' of ' + String(newCodes.length) + ' are in neither README')
add(3, 'a reader of the README cannot look one up')
add(2, 'the reference material is English only')
add(3, 'the bilingual rule applies to shipped text')

add(1, 'where each fact belongs')
add(2, 'the README pair tells the human story')
add(3, 'a capability gets a sentence and its non-goal')
add(2, 'a reference file carries the domain detail')
add(3, 'the code table for its family')
add(2, 'the memory carries the decisions')
add(3, 'and why the alternative was rejected')
add(2, 'one fact lives in one place')
add(3, 'everything else points at it')

add(1, 'the references section')
add(2, 'extracted from the provenance tables')
add(3, 'not rewritten from memory')
add(4, 'a hand-copied citation drifts from its source')
add(4, 'a scan that truncates a publisher invents a work')
add(2, 'grouped by where the method is used')
add(3, 'verification and model checking')
add(3, 'data, structure and diagrams')
add(3, 'external checkers the plugin translates into')
add(2, 'each entry says which file cites it')
add(3, 'a reader can check the claim in place')
add(2, 'and what is NOT published is named as such')
add(3, 'most checks here are house conventions')
add(4, 'saying so is the point of the distinction')

add(1, 'how the update is kept true')
add(2, 'the maps are regenerated, never hand-drawn')
add(3, 'four of them now, each with a drift test')
add(2, 'a claim about the repository is checked against it')
add(3, 'counts, links, gates and citations')
add(2, 'a document that names a capability names where it lives')

add(1, 'what this update is not')
add(2, 'not a rewrite of the README')
add(3, 'it adds what is missing and leaves the rest')
add(2, 'not a second copy of the reference tables')
add(3, 'the references section points, it does not duplicate')

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

const outDir = repo + 'docs/documentation'
mkdirSync(outDir, { recursive: true })
writeFileSync(outDir + '/mindmap.mmd', map + '\n')
writeFileSync(outDir + '/facts.json', JSON.stringify({
  mentionGaps,
  codeGaps,
  newCodes,
  referenceFiles,
  citedFiles: citationFiles.map((entry) => entry.path),
}, null, 2) + '\n')
console.log('')
console.log('written: docs/documentation/mindmap.mmd')
console.log('written: docs/documentation/facts.json')

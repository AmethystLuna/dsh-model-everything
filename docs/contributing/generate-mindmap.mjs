// The mind map behind the contribution guide.
//
// Generated from the repository rather than drawn, for the reason the other two maps demonstrated:
// the contribution guide has to name entry points that exist. It is a map of what a contributor has
// to cite and pass, so every leaf here is measured - the gates come from package.json and the CI
// workflow, the code tables from src/, and the provenance list from the reference files themselves.
//
// The two shapes are deliberately distinct branches. An academically-guided improvement is a claim
// about a method and has to cite one; a bug report is a claim about behaviour and has to be
// reproducible. The shared branch is what both have to pass.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'

const repo = 'F:/workspace/dsh-plugins/dsh-model-everything/'
const pkg = JSON.parse(readFileSync(repo + 'package.json', 'utf8'))

/** The gates, read from the scripts and the workflow rather than recalled. */
const workflow = readFileSync(repo + '.github/workflows/dsh-bundle.yml', 'utf8')
// The workflow runs as a matrix over the supported Node versions, so the same step appears once per
// job. Deduplicating is not cosmetic: a contributor reading the gate list twice learns nothing, and
// the versions are already their own branch of the map.
const ciSteps = [...new Set([...workflow.matchAll(/^\s+run: (.+)$/gm)].map((match) => match[1].trim()))]
const nodeVersions = [...workflow.matchAll(/node-version: \[([^\]]+)\]/g)].map((match) => match[1])

/** Where a finding code is declared, counted. */
const codeFiles = []
for (const file of readdirSync(repo + 'src').filter((name) => name.endsWith('.ts'))) {
  const found = [...readFileSync(repo + 'src/' + file, 'utf8').matchAll(/code: '([A-Z][A-Z0-9_]+)'/g)]
  if (found.length === 0) continue
  codeFiles.push({ file, count: found.length })
}
codeFiles.sort((a, b) => b.count - a.count)

/** Which reference files separate a published source from a house convention. */
const provenance = []
for (const skill of readdirSync(repo + 'skills', { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
  const refDir = repo + 'skills/' + skill + '/references'
  if (!existsSync(refDir)) continue
  for (const file of readdirSync(refDir).filter((name) => name.endsWith('.md'))) {
    const text = readFileSync(refDir + '/' + file, 'utf8')
    provenance.push({ path: skill + '/references/' + file, hasProvenance: /[Pp]rovenance/.test(text), citesSource: /\b(19|20)\d{2}\b/.test(text) })
  }
}

console.log('=== measured ===')
console.log('  CI gates: ' + ciSteps.map((step) => step.replace('npm run ', '')).filter((step) => step.startsWith('npm') || step.startsWith('git')).join(', '))
console.log('  Node versions: ' + nodeVersions.join(', '))
console.log('  code sites: ' + String(codeFiles.reduce((sum, entry) => sum + entry.count, 0)) + ' across ' + String(codeFiles.length) + ' files')
console.log('  reference files with a provenance section: ' + String(provenance.filter((entry) => entry.hasProvenance).length) + ' of ' + String(provenance.length))

// --------------------------------------------------------------------------- the map --

const BAD = /[[\]{}]|-->/
const nodes = []
const add = (depth, text, isRoot = false) => {
  if (!isRoot && (BAD.test(text) || /^root\(\(/.test(text))) throw new Error('bad mermaid node text: ' + text)
  if (isRoot && !/^root\(\(.*\)\)$/.test(text)) throw new Error('the root must use the root shape: ' + text)
  nodes.push('  '.repeat(depth) + text)
}

add(0, 'root((contributing to this plugin))', true)

// The split itself, first: a contributor has to know which of the two they have.
add(1, 'decide which of the two you have')
add(2, 'a claim about a method')
add(3, 'you have a source and it says the check should work differently')
add(3, 'you found a defect in how a judgement is computed')
add(2, 'a claim about behaviour')
add(3, 'a tool answered something you believe is wrong')
add(3, 'a tool refused, crashed, or took the process down')
add(2, 'if it is both, file the behaviour first')
add(3, 'a method proposal is easier to judge once the behaviour is agreed')

// Branch A: the academically-guided improvement.
add(1, 'an improvement with a source')
add(2, 'what you must cite')
add(3, 'the published method, with its year and venue')
add(3, 'the house convention it would replace')
add(4, 'provenance tables separate the two')
add(5, String(provenance.filter((entry) => entry.hasProvenance).length) + ' of ' + String(provenance.length) + ' reference files carry one today')
add(4, 'most of the shipped checks are house conventions')
add(2, 'what you must say about the judgement')
add(3, 'which check changes, by its code')
add(4, 'codes are declared across ' + String(codeFiles.length) + ' source files')
add(4, 'the ' + String(codeFiles[0].count) + ' in ' + codeFiles[0].file.replace('.ts', '') + ' are the largest group')
add(3, 'whether it changes a verdict or adds a signal')
add(4, 'only violation level decides a verdict')
add(3, 'what it does NOT decide, in words')
add(2, 'what it must come with')
add(3, 'the nearest case that must still pass')
add(4, 'a check that fires on everything proves nothing')
add(3, 'a mutation that makes the new case go red')
add(4, 'a case that cannot fail is not a case')
add(3, 'the far side of the tradeoff, if there is one')
add(4, 'a method that buys precision with runtime needs saying')

// Branch B: the problem report.
add(1, 'a problem you hit while running it')
add(2, 'what to send')
add(3, 'the exact call, with its arguments')
add(4, 'the tool name and the full arguments object')
add(3, 'what you got')
add(4, 'the verdict and the verdict reason')
add(4, 'the finding codes, verbatim')
add(4, 'the schema, since the reading order differs by family')
add(3, 'what you expected instead, and why')
add(4, 'the rule or the source that says so')
add(2, 'the shapes worth reporting first')
add(3, 'a verdict that reads as a pass over nothing')
add(4, 'a check that never ran is not a check that passed')
add(3, 'a refusal where a report was expected')
add(3, 'a raw error with no code to route on')
add(3, 'the process dying or the search not stopping')
add(2, 'what makes it reproducible')
add(3, 'the smallest model or diagram that shows it')
add(4, 'strip it until removing anything makes the effect go away')
add(3, 'the version, and the schema you got')
add(3, 'whether it is stable or intermittent')
add(4, 'a report is deterministic by contract, so say which')

// Shared: what both have to pass.
add(1, 'what both have to pass')
add(2, 'the gates, in the order CI runs them')
for (const version of nodeVersions) add(3, 'Node ' + version)
add(3, 'typecheck')
add(3, 'build')
add(3, 'the regression chain')
add(3, 'the committed build must match the source')
add(4, 'the build output is committed, so it moves with the change')
add(2, 'the house rules a suite follows')
add(3, 'one code per case, no other error beside it')
add(3, 'assert which check carries the finding')
add(3, 'every code gets a near miss that must not fire')
add(3, 'an unreachable code is pinned, not skipped')
add(3, 'no brittle counts, in text or in a test name')
add(2, 'the documents that must move with the change')
add(3, 'the reference file for the domain')
add(3, 'the memory entry, when a decision was made')
add(3, 'the bilingual pair together')

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

const outDir = repo + 'docs/contributing'
mkdirSync(outDir, { recursive: true })
writeFileSync(outDir + '/mindmap.mmd', map + '\n')
writeFileSync(outDir + '/facts.json', JSON.stringify({
  ciGates: ciSteps,
  nodeVersions,
  codeFiles,
  provenance,
  suites: readdirSync(repo + 'tests', { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name),
}, null, 2) + '\n')
console.log('')
console.log('written: docs/contributing/mindmap.mmd')
console.log('written: docs/contributing/facts.json')

// The routing properties of the two always-visible surfaces, held rather than measured once.
//
// A tool description is the one per-turn surface with no character ceiling, which makes it both the best
// place for a routing sentence and the easiest place to forget one: adding a tool costs nothing visible,
// so nothing objects when its description names no neighbour and states no boundary. This is what
// objects. It was written after measuring 8 of 12 tools naming a sibling - the four it found were then
// fixed, and this keeps them fixed.
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
    console.log('FAIL', name, '-', String(error.message).slice(0, 300))
  }
}

/** The tool objects as the model receives them, read from the built output. */
const loadTools = async () => {
  const modules = ['compose-tool.js', 'concurrency-tool.js', 'data-tool.js', 'design-tool.js', 'export-tool.js', 'report-diff-tool.js', 'structure-tool.js', 'uml-tool.js', 'tool.js']
  const tools = []
  for (const file of modules) {
    const mod = await import('file:///' + repo.replace(/\/$/, '') + '/lib/' + file)
    for (const value of Object.values(mod)) {
      if (value === null || typeof value !== 'object') continue
      if (typeof value.name !== 'string' || typeof value.description !== 'string' || value.parameters === undefined) continue
      tools.push({ name: value.name, description: value.description })
    }
  }
  if (tools.length === 0) throw new Error('no tools loaded; this suite would pass vacuously')
  return tools
}

const tools = await loadTools()

/** A description states its boundary either by negating the neighbour or by naming it. */
const NEGATIVE = /\bdoes not\b|\bnot judge\b|\bnot the code\b|\bwithout judging\b|\bnever\b|\bonly reads\b|\bdo not\b|\bis not\b|\bnot a\b/i
const siblingsOf = (tool) => tools.filter((other) => other.name !== tool.name && tool.description.includes(other.name)).map((other) => other.name)

test('every tool description names at least one sibling', async () => {
  const orphans = tools.filter((tool) => siblingsOf(tool).length === 0).map((tool) => tool.name)
  if (orphans.length > 0) {
    throw new Error('these name no other tool, so a model holding the wrong one has nothing to switch to: ' + orphans.join(', ') + '. Name the tool that owns the adjacent case, or the one to use instead.')
  }
})

test('every tool description states what it does not do', async () => {
  const silent = tools.filter((tool) => !NEGATIVE.test(tool.description) && siblingsOf(tool).length === 0).map((tool) => tool.name)
  if (silent.length > 0) {
    throw new Error('these neither negate the neighbouring job nor name the tool that owns it: ' + silent.join(', '))
  }
})

test('no tool description carries a phrase the model reads as a different tool', async () => {
  // The failure this catches is a stale sentence from an earlier wording: `report_diff` carried
  // "The For the first look at a single artefact use the domain tool directly", a stranded fragment that
  // read as an instruction to call nothing in particular.
  const broken = []
  for (const tool of tools) {
    if (/\bThe For\b|\bthe the\b|\bA A\b|\s{2,}\S/.test(tool.description)) broken.push(tool.name)
  }
  if (broken.length > 0) throw new Error('a description carries a stranded or garbled phrase: ' + broken.join(', '))
})

test('every skill row names a sibling and states a boundary', async () => {
  const { readdirSync } = await import('node:fs')
  const skills = readdirSync(repo + 'skills', { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  const offenders = []
  for (const skill of skills) {
    const body = readFileSync(repo + 'skills/' + skill + '/SKILL.md', 'utf8')
    const description = /^description:\s*"([\s\S]*?)"\s*$/m.exec(body)[1]
    const siblings = [...new Set([...description.matchAll(/\bmodel-everything[a-z-]*/g)].map((match) => match[0]))].filter((entry) => entry !== skill)
    // Naming a sibling IS a boundary statement - it says who owns the adjacent case - so either is
    // enough. An earlier version of this check required the negative phrasing and mis-reported a row
    // that routes three neighbours by name.
    if (siblings.length === 0 && !NEGATIVE.test(description)) offenders.push(skill + ' (names no sibling and states no boundary)')
  }
  if (offenders.length > 0) throw new Error(offenders.join(', '))
})

test('the toolset map matches the measurement', () => {
  // The generator in check mode compares instead of writing, so this does not race on the file.
  const output = execFileSync(process.execPath, [repo + 'docs/toolset/generate-mindmap.mjs', '--check'], { encoding: 'utf8', timeout: 300_000 })
  if (!output.includes('current:')) throw new Error('the generator did not report the map as current: ' + output.slice(0, 200))
})

if (failures > 0) {
  console.log('toolset routing tests failed:', failures)
  process.exit(1)
}
console.log('all toolset routing tests passed')

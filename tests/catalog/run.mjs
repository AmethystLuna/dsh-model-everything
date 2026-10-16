// Catalog conformance: the mechanical half of "does the model find the right tool without a
// hook".
//
// There is no injection point here. What the model sees when it decides is fixed by the host:
//
//   - a SKILL row renders `description` ONLY (`whenToUse` is not in the catalog) and is
//     truncated by dsh-tool-skill at DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH = 500;
//   - a TOOL schema is `{ name, description, parameters }` passed through whole by
//     dsh-tools' `schemaOf` - no truncation at all.
//
// So the rules a description has to satisfy are not style. They are what makes the text work at
// the moment it is read. This suite checks the ones that can be checked mechanically, and the
// corpus in tests/skill-routing checks the rest by hand (--print-prompt / --decisions).
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

let failures = 0
function test(name, fn) {
  try {
    fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const skillsRoot = fileURLToPath(new URL('../../skills/', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

/** dsh-tool-skill: DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH. */
const SKILL_BUDGET = 500

/** Truncation as the host applies it to a skill row. */
function catalogDescription(value) {
  const normalized = value.replaceAll(/\s+/g, ' ').trim()
  return normalized.length <= SKILL_BUDGET ? normalized : normalized.slice(0, SKILL_BUDGET - 3) + '...'
}

function skillEntries() {
  const entries = []
  for (const name of readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
    const file = join(skillsRoot, name, 'SKILL.md')
    if (!existsSync(file)) continue
    const text = readFileSync(file, 'utf8')
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
    if (match === null) throw new Error(name + ' has no frontmatter')
    const description = /^description:\s*"([\s\S]*?)"\s*$/m.exec(match[1])
    if (description === null) throw new Error(name + ' has no quoted description')
    const whenToUse = /^whenToUse:\s*"([\s\S]*?)"\s*$/m.exec(match[1])
    entries.push({ name, description: description[1], whenToUse: whenToUse === null ? undefined : whenToUse[1], visible: catalogDescription(description[1]) })
  }
  return entries
}

/** Every tool the entry point registers, read from the built definitions. */
async function toolEntries() {
  const entry = readFileSync(join(repoRoot, 'src/index.ts'), 'utf8')
  const modules = new Set([
    ...[...entry.matchAll(/from '\.\/([a-z-]+)\.js'/g)].map((match) => match[1]).filter((name) => name === 'tool' || name.endsWith('-tool')),
  ])
  const tools = []
  for (const module of modules) {
    const built = await import('file:///' + join(repoRoot, 'lib', module + '.js').replaceAll('\\', '/'))
    for (const value of Object.values(built)) {
      if (value !== null && typeof value === 'object' && typeof value.name === 'string' && typeof value.description === 'string' && value.parameters !== undefined) {
        tools.push({ module, name: value.name, description: value.description, parameters: value.parameters })
      }
    }
  }
  return tools.sort((left, right) => left.name.localeCompare(right.name))
}

const skills = skillEntries()
const tools = await toolEntries()

// ---------------------------------------------------------------- the skill rows --

test('catalog: every skill row fits the budget, so nothing it needs is cut off', () => {
  const over = skills.filter((skill) => skill.description.length > SKILL_BUDGET)
  if (over.length > 0) {
    throw new Error('over budget: ' + over.map((skill) => skill.name + ' (' + String(skill.description.length) + ')').join(', '))
  }
})

test('catalog: every skill row opens with a trigger, not a topic', () => {
  for (const skill of skills) {
    if (!/^Use when/.test(skill.visible)) throw new Error(skill.name + ' does not open with "Use when": ' + JSON.stringify(skill.visible.slice(0, 60)))
    // The first sentence is what a reader acts on; the rest is qualification.
    const firstSentence = skill.visible.split(/(?<=\.)\s/)[0] ?? ''
    if (firstSentence.length > 220) throw new Error(skill.name + ' first sentence is ' + String(firstSentence.length) + ' characters; the trigger is buried')
  }
})

test('catalog: no skill depends on whenToUse, which the catalog does not render', () => {
  // `whenToUse` reaches the model only after the skill is loaded, so it cannot be what makes
  // the skill get loaded. If the two texts say different things, the catalog says less.
  for (const skill of skills.filter((entry) => entry.whenToUse !== undefined)) {
    const words = (text) => new Set(text.toLowerCase().split(/\W+/).filter((word) => word.length > 4))
    const visibleWords = words(skill.visible)
    const onlyInWhenToUse = [...words(skill.whenToUse)].filter((word) => !visibleWords.has(word))
    if (onlyInWhenToUse.length > 3) {
      throw new Error(skill.name + ': ' + String(onlyInWhenToUse.length) + ' substantial words appear only in whenToUse, which the model never sees before choosing: ' + onlyInWhenToUse.slice(0, 8).join(', '))
    }
  }
})

test('catalog: every skill row names its siblings, so the router can tell them apart', () => {
  // A skill row competes with the other rows in the same catalog. Naming the sibling that owns
  // the adjacent case is what makes the boundary legible without a hook.
  const names = skills.map((skill) => skill.name)
  for (const skill of skills) {
    const siblings = names.filter((candidate) => candidate !== skill.name)
    const named = siblings.filter((sibling) => skill.visible.includes(sibling))
    if (named.length === 0 && siblings.length > 1) {
      throw new Error(skill.name + ' names no sibling skill, so nothing in its row says when another skill owns the question')
    }
  }
})

// ---------------------------------------------------------------- the tool rows --

test('catalog: a tool description reaches the model whole, so length is a cost and not a cut', () => {
  // The host passes `{ name, description, parameters }` through unchanged. Assert the shape
  // this suite relies on, so a change in the projection is noticed here rather than assumed.
  for (const tool of tools) {
    if (tool.description.trim() === '') throw new Error(tool.name + ' has an empty description')
    if (tool.description.length !== tool.description.replaceAll(/\s+/g, ' ').trim().length) {
      // Not a failure by itself, but a description with runs of whitespace wastes the reader's
      // budget. Keep it as a warning-level assertion so it does not rot.
      if (/\n\s*\n/.test(tool.description)) throw new Error(tool.name + ' has blank lines in its description, which render as gaps in the schema')
    }
  }
})

test('catalog: every tool opens by saying what question it answers, not what it is called', () => {
  for (const tool of tools) {
    const firstSentence = tool.description.split(/(?<=\.)\s/)[0] ?? tool.description
    if (firstSentence.length > 240) throw new Error(tool.name + ': first sentence is ' + String(firstSentence.length) + ' characters, so the trigger is buried')
    // Repeating the name back tells a model that has already read the name nothing. The rule is
    // exact repetition of the whole name, not word overlap: "Verify one state machine: does it
    // deadlock" earns its place, while "Run state-machine verification" is the name again.
    if (firstSentence.toLowerCase().includes(tool.name.toLowerCase())) {
      throw new Error(tool.name + ': the first sentence repeats the tool name (' + JSON.stringify(firstSentence.slice(0, 80)) + '); say what question it answers')
    }
  }
})

test('catalog: every tool says when NOT to use it, or names the sibling that owns that case', () => {
  // A description that only claims scope gives the model no way to decline. This is the
  // cheapest routing improvement available without a hook: the text that says "purely
  // sequential? do not call this" is doing routing work at the moment of choice.
  //
  // A tool that consumes another tool's output - `report_diff` - is the one exception: its
  // position in the sequence is its scope, and forcing it to name a sibling would add a
  // sentence that does no work.
  const SEQUENCE_TOOLS = new Set(['report_diff'])
  const names = tools.map((tool) => tool.name)
  const offenders = []
  for (const tool of tools) {
    const text = tool.description
    const declines = /do not (call|use)|not for |instead|only after|before (calling|using)|is not |does not |cannot |this one /i.test(text)
    const namesSibling = names.some((sibling) => sibling !== tool.name && text.includes(sibling))
    if (!declines && !namesSibling && !SEQUENCE_TOOLS.has(tool.name)) offenders.push(tool.name)
  }
  if (offenders.length > 0) throw new Error('no scope limit and no sibling named: ' + offenders.join(', '))
})

test('catalog: every tool is owned by a skill that a corpus case routes to', () => {
  // The corpus routes to *skills*, not tools, so this checks the chain rather than the wording:
  // a case routes to the skill, and the skill owns the tool. A tool with no owner is one no
  // question can reach, which is the routing defect this map exists to expose.
  const corpus = JSON.parse(readFileSync(join(repoRoot, 'tests/skill-routing/corpus.json'), 'utf8'))
  const map = readFileSync(join(repoRoot, 'docs/routing-map.md'), 'utf8')
  const routedSkills = new Set(corpus.cases.map((entry) => entry.skill))
  const unowned = tools.filter((tool) => {
    const line = map.split('\n').find((row) => row.startsWith('| `' + tool.name + '` |'))
    if (line === undefined) return true
    const owner = line.split('|')[2].trim().replaceAll('`', '')
    return owner === '(none)' || !routedSkills.has(owner)
  }).map((tool) => tool.name)
  if (unowned.length > 0) throw new Error('these tools answer to no routed skill, so no corpus question reaches them: ' + unowned.join(', '))
})

console.log('')
console.log('catalog rows measured: ' + String(skills.length) + ' skills, ' + String(tools.length) + ' tools')

if (failures > 0) {
  console.log('catalog conformance failed:', failures)
  process.exit(1)
}
console.log('all catalog conformance checks passed')

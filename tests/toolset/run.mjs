// The routing properties of the two always-visible surfaces, held rather than measured once.
//
// A tool description is the one per-turn surface with no character ceiling, which makes it both the best
// place for a routing sentence and the easiest place to forget one: adding a tool costs nothing visible,
// so nothing objects when its description names no neighbour and states no boundary. This is what
// objects. It was written after measuring 8 of 12 tools naming a sibling - the four it found were then
// fixed, and this keeps them fixed.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

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

test('no early text names a code range', async () => {
  // A range like `S1-S8` fails twice at the moment it is read. It asserts how many checks exist - a count
  // a release changes - and it is meaningless before the codes are known, so it teaches nothing to a
  // reader who has not loaded the skill yet. Progressive disclosure means the early text says what the
  // checks DO and the detail arrives with the skill.
  const RANGE = /\b[A-Z]{1,4}\d{1,3}\s*[-–—]\s*[A-Z]{1,4}\d{1,3}\b/g
  const offenders = []
  for (const tool of tools) {
    for (const match of tool.description.matchAll(RANGE)) offenders.push(tool.name + ': ' + match[0])
  }
  // A skill row is early text too: it is what the model routes on before loading anything.
  const { readdirSync } = await import('node:fs')
  for (const skill of readdirSync(repo + 'skills', { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
    const body = readFileSync(repo + 'skills/' + skill + '/SKILL.md', 'utf8')
    const description = /^description:\s*"([\s\S]*?)"\s*$/m.exec(body)[1]
    for (const match of description.matchAll(RANGE)) offenders.push(skill + ' row: ' + match[0])
  }
  if (offenders.length > 0) {
    throw new Error('these assert a count and mean nothing before the skill is loaded: ' + offenders.join(', ') + '. Say what the checks do instead.')
  }
})

test('the README pair leads with content, not with a number', () => {
  // A range is defensible as a label whose content is explained, and indefensible as the thing the
  // sentence is about: "runs S1-S8 and A1-A14 - unreachable states, absorbing cycles" hands the reader six
  // digits and puts the meaning in an aside. This checks the order, not the presence.
  const offenders = []
  for (const name of ['README.md', 'README.en-US.md']) {
    const text = readFileSync(repo + name, 'utf8')
    for (const line of text.split('\n')) {
      const range = /\b[A-Z]{1,4}\d{1,3}\s*[-–—]\s*[A-Z]{1,4}\d{1,3}\b/.exec(line)
      if (range === null) continue
      // The defect is a range followed by an em-dash list: the range is asserted and the content follows.
      const after = line.slice(range.index + range[0].length)
      if (/^\s*[-–—]/.test(after)) offenders.push(name + ': ' + line.trim().slice(0, 90))
    }
  }
  if (offenders.length > 0) {
    throw new Error('a range is carrying the sentence while its content is the aside:\n    ' + offenders.join('\n    '))
  }
})

test('every declared display string states what the plugin does', () => {
  // The surfaces that carry the plugin's own prose, gathered rather than listed: a registry shows
  // `description`, a plugin manager shows `dsh.displayName`, and the GUI shows the locale bundle. All
  // three are read before anyone has seen a report, so a code or a roster count in any of them is the
  // same defect as one in a skill row.
  const declared = []
  const pkg = JSON.parse(readFileSync(repo + 'package.json', 'utf8'))
  if (typeof pkg.description === 'string') declared.push({ where: 'package.json description', text: pkg.description })
  if (typeof pkg.displayName === 'string') declared.push({ where: 'package.json displayName', text: pkg.displayName })
  if (pkg.dsh !== undefined && typeof pkg.dsh.displayName === 'string') declared.push({ where: 'package.json dsh.displayName', text: pkg.dsh.displayName })
  for (const name of readdirSync(repo + 'locale')) {
    const bundle = JSON.parse(readFileSync(repo + 'locale/' + name, 'utf8'))
    for (const key of ['title', 'description']) {
      if (typeof bundle.meta?.[key] === 'string') declared.push({ where: 'locale/' + name + ' meta.' + key, text: bundle.meta[key] })
    }
  }
  if (declared.length === 0) throw new Error('no declared display string was found; this check would pass vacuously')

  const RANGE = /\b[A-Z]{1,4}\d{1,3}\s*[-–—]\s*[A-Z]{1,4}\d{1,3}\b/
  const CODE = /\b[A-Z]{1,4}\d{1,3}\b/
  const ROSTER = /\b(?:\d{1,3}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:checks?|codes?|tools?|skills?|families|suites?)\b/i
  const problems = []
  for (const { where, text } of declared) {
    if (RANGE.test(text)) problems.push(where + ' names a code range')
    else if (CODE.test(text)) problems.push(where + ' names a check code')
    if (ROSTER.test(text)) problems.push(where + ' counts a roster')
  }
  if (problems.length > 0) {
    throw new Error('a reader meets these before any report exists, so a code means nothing here:\n    ' + problems.join('\n    '))
  }
  console.log('      (' + String(declared.length) + ' declared display string(s) checked: ' + declared.map((entry) => entry.where).join(', ') + ')')
})

test('nextSteps leads with a check name, not a bare code', async () => {
  // A model repeats nextSteps to a user more readily than any other field, so the sentence has to be
  // actionable for someone who has never seen a report. `Deadlock (S2)` works; `S2` alone does not.
  const { runVerification, runCompositionVerification } = await import('file:///' + repo.replace(/\/$/, '') + '/lib/engine.js')
  const { runDataVerification } = await import('file:///' + repo.replace(/\/$/, '') + '/lib/data-engine.js')
  const { runDesignReview } = await import('file:///' + repo.replace(/\/$/, '') + '/lib/design-engine.js')

  const machine = { schemaVersion: 1, init: 'A', states: [{ id: 'A' }, { id: 'B', terminal: true }], transitions: [{ from: 'A', event: 'go', to: 'B' }] }
  const other = { schemaVersion: 1, init: 'X', states: [{ id: 'X' }, { id: 'Y', terminal: true }], transitions: [{ from: 'X', event: 'ping', to: 'Y' }] }
  const reports = {
    model_verify: runVerification({ schemaVersion: 1, init: 'A', states: [{ id: 'A' }], transitions: [] }),
    model_compose_verify: runCompositionVerification([machine, other]),
    model_datamodel_verify: runDataVerification({ schemaVersion: 1, entities: [{ name: 'U', fields: [{ name: 'id', type: 'uuid' }] }] }),
    model_design_review: runDesignReview({ schemaVersion: 1, architecture: { nodes: ['a'], edges: [] } }),
  }

  const offenders = []
  for (const [family, report] of Object.entries(reports)) {
    for (const step of report.nextSteps ?? []) {
      // A step that opens with a code and nothing else is the defect. A code inside parentheses after a
      // name is the format this repository chose.
      if (/^\s*[A-Z]{1,4}\d{1,3}([_A-Z0-9]*)?[\s,:]/.test(step)) offenders.push(family + ': ' + step.slice(0, 80))
    }
  }
  if (offenders.length > 0) throw new Error('a step opens with a code, which means nothing before the codes are known:\n    ' + offenders.join('\n    '))

  // And the successful path of each family has to route onward: the result is the only channel that can
  // redirect a model mid-task, because it is the only one read after the model already chose something.
  const NAMES = ['model_verify', 'model_compose_verify', 'model_datamodel_verify', 'model_design_review', 'uml_structure_verify', 'uml_render', 'uml_parse', 'uml_review', 'report_diff', 'model_concurrency_scan']
  const silent = Object.entries(reports).filter(([, report]) => !(report.nextSteps ?? []).some((step) => NAMES.some((name) => step.includes(name)))).map(([family]) => family)
  if (silent.length > 0) throw new Error('these families route nowhere: ' + silent.join(', ') + '. Name the tool that answers the adjacent question.')
})

test('the skipped-check list stays a list of codes', async () => {
  // It became an array of whole check objects in an edit that was meant to change only a sentence, and
  // `facts.checksSkipped` is published: a caller doing `includes('DES2')` broke silently.
  const { runDesignReview } = await import('file:///' + repo.replace(/\/$/, '') + '/lib/design-engine.js')
  const report = runDesignReview({ schemaVersion: 1, architecture: { nodes: ['a'], edges: [] } })
  const skipped = report.facts.checksSkipped
  if (!Array.isArray(skipped)) throw new Error('checksSkipped must be an array')
  const notStrings = skipped.filter((entry) => typeof entry !== 'string')
  if (notStrings.length > 0) throw new Error('checksSkipped must hold codes, not objects: ' + JSON.stringify(notStrings[0]).slice(0, 80))
  if (skipped.length === 0) throw new Error('this design skips checks, so the list must not be empty; the check would pass vacuously')
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

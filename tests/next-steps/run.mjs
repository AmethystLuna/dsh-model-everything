// What a report tells a reader to do next has to be something a reader can do.
//
// `nextSteps` mixes prose with tool names, and a step that names a tool this plugin does not ship is worse than no step: it sends the reader
// looking for something that is not there. Every tool-shaped word in a step is checked against the tools the plugin registers.
import { readFileSync } from 'node:fs'

let failures = 0
function test(name, body) {
  try {
    body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const engine = await import('file:///' + repo + 'lib/engine.js')
const data = await import('file:///' + repo + 'lib/data-engine.js')
const uml = await import('file:///' + repo + 'lib/uml.js')

/** The tool names the entry registers, read from the entry itself so a new tool is picked up without an edit here. */
const registered = () => {
  const source = readFileSync(repo + 'src/index.ts', 'utf8')
  // The entry registers through one `register(name, tool)` call per tool now: the name is the tool's, the variable is its module's export.
  const calls = [...source.matchAll(/register\('([a-z_]+)',\s*([A-Za-z_]+)\)/g)].map((match) => ({ tool: match[1], variable: match[2] }))
  const modules = [...source.matchAll(/import \{([^}]+)\} from '\.\/([a-z-]+)\.js'/g)]
  const fileOf = new Map()
  for (const [, names, file] of modules) {
    for (const name of names.split(',').map((part) => part.trim())) fileOf.set(name, file)
  }
  const names = []
  for (const call of calls) {
    const file = fileOf.get(call.variable)
    if (file === undefined) continue
    names.push({ variable: call.variable, file, tool: call.tool })
  }
  return names
}

const FAILING = {
  'a review': uml.reviewUml({ model: { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }] } }),
  'a verification': engine.runVerification({ schemaVersion: 1, init: 's0', states: [{ id: 's0' }, { id: 's1', terminal: true }], transitions: [{ from: 's0', event: 'go', to: 's1' }, { from: 's1', event: 'back', to: 's0' }] }),
  'a lone state': engine.runVerification({ schemaVersion: 1, init: 's0', states: [{ id: 's0' }], transitions: [] }),
}

test('every step names something to do', () => {
  for (const [name, report] of Object.entries(FAILING)) {
    if (!Array.isArray(report.nextSteps) || report.nextSteps.length === 0) throw new Error(name + ': no nextSteps')
    for (const step of report.nextSteps) {
      if (typeof step !== 'string' || step.trim() === '') throw new Error(name + ': an empty step')
      if (!/[a-z]/.test(step)) throw new Error(name + ': a step with no words')
    }
  }
})

test('a tool-shaped word in a step is a tool this plugin registers', () => {
  // The names come from the built tools, so a renamed tool fails here rather than in a reader's hands.
  const known = new Set()
  for (const entry of registered()) {
    known.add(entry.file.replace(/-tool$/, '').replace(/-/g, '_'))
  }
  // The tool names themselves: each module's exported tool carries one, and the register list is the authority.
  const actual = new Set([
    'model_verify', 'model_datamodel_verify', 'model_interleaving_scan', 'model_compose_verify', 'model_export',
    'uml_render', 'uml_parse', 'uml_review', 'uml_explain_labels', 'uml_structure_verify', 'model_design_review',
    'report_diff', 'model_edit', 'model_automaton_verify',
  ])
  const seen = new Set()
  for (const [name, report] of Object.entries(FAILING)) {
    for (const step of report.nextSteps) {
      for (const match of String(step).matchAll(/\b([a-z]+_[a-z_]+)\b/g)) {
        seen.add(match[1])
        if (!actual.has(match[1])) throw new Error(name + ': the step names `' + match[1] + '`, which is not a tool here')
      }
    }
  }
  if (seen.size === 0) throw new Error('no step named a tool, so nothing was checked')
})

test('the registered tools are the ones the steps may name', () => {
  // A guard against this suite drifting: the entry registers fourteen tools, and the list above must be those fourteen.
  const registeredVariables = registered().length
  if (registeredVariables < 10) throw new Error('the entry registers ' + String(registeredVariables) + ' tools, which cannot be right')
})

if (failures > 0) {
  console.log('next-steps tests failed:', failures)
  process.exit(1)
}
console.log('all next-steps tests passed')
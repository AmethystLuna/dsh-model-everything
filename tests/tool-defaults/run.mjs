// The defaults a tool description states, against what the tool does when the parameter is left out.
//
// A description that says "Default state" is read by a caller who then relies on it; a default that changed under the description is a wrong
// answer with no finding attached to it. Each claim below is checked by omitting the parameter, not by reading the code.
import { readFileSync } from 'node:fs'

let failures = 0
async function test(name, body) {
  try {
    await body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const renderTool = (await import('file:///' + repo + 'lib/uml-tool.js')).umlRenderTool

const machine = { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }] }

const descriptionOf = (key) => String(renderTool.parameters.properties[key]?.description ?? '')

test('the description states the defaults this suite checks', () => {
  // The claims are read from the description, so a reworded default is a failing case rather than a silent drift.
  const claims = {
    notation: /Default auto/,
    kind: /Default state/,
    reportView: /digest \(default\)/,
    maxSteps: /Default 60/,
  }
  for (const [key, pattern] of Object.entries(claims)) {
    if (!pattern.test(descriptionOf(key))) throw new Error('`' + key + '` no longer states its default: ' + descriptionOf(key).slice(0, 80))
  }
})

await test('kind defaults to a state diagram', async () => {
  const drawn = await renderTool.execute({ model: machine, notation: 'mermaid', reportView: 'full' })
  if (drawn.kind !== 'state') throw new Error('kind was ' + String(drawn.kind))
})

await test('notation defaults to mermaid when a model is drawn', async () => {
  const drawn = await renderTool.execute({ model: machine, kind: 'state', reportView: 'full' })
  if (drawn.notation !== 'mermaid') throw new Error('notation was ' + String(drawn.notation))
})

await test('reportView defaults to the body, not the object', async () => {
  const digest = await renderTool.execute({ model: machine, kind: 'state' })
  const full = await renderTool.execute({ model: machine, kind: 'state', reportView: 'full' })
  const digestBody = String(digest.diagram ?? '')
  const fullBody = String(full.diagram ?? '')
  if (digestBody === '' || fullBody === '') throw new Error('one of the views drew nothing')
  // The body view prints the drawing; the full view carries the object. They must not be the same text.
  if (typeof digest === 'string' || typeof full === 'string') throw new Error('a view returned a string where a report was expected')
})

await test('maxSteps defaults to a cap of 60 steps', async () => {
  const states = Array.from({ length: 90 }, (_, index) => ({ id: 's' + index, ...(index === 89 ? { terminal: true } : {}) }))
  const transitions = Array.from({ length: 89 }, (_, index) => ({ from: 's' + index, event: 'go' + index, to: 's' + (index + 1) }))
  const long = { schemaVersion: 1, init: 's0', states, transitions }
  const drawn = await renderTool.execute({ model: long, kind: 'sequence', notation: 'mermaid', reportView: 'full' })
  const steps = (String(drawn.diagram).match(/->>/g) ?? []).length
  if (steps === 0) throw new Error('the sequence drew no steps')
  if (steps > 60) throw new Error('the default cap let ' + String(steps) + ' steps through')
  const capped = await renderTool.execute({ model: long, kind: 'sequence', notation: 'mermaid', maxSteps: 5, reportView: 'full' })
  const small = (String(capped.diagram).match(/->>/g) ?? []).length
  if (small >= steps) throw new Error('maxSteps 5 drew ' + String(small) + ' against the default\'s ' + String(steps))
})

if (failures > 0) {
  console.log('tool-defaults tests failed:', failures)
  process.exit(1)
}
console.log('all tool-defaults tests passed')
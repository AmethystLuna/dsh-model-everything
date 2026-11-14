// What the shipped text says about the bundle has to be what the code does.
//
// Three sentences had drifted: the gate's header said its default was off while the schema said on, the bundle's patch file
// said the drawing row carries no tool beyond one while it registers three, and the drawing row had no card at all - so the
// Plugins page showed it as a bare id. Shipped text that is wrong is worse than missing text: a reader acts on it.
import { existsSync, readFileSync } from 'node:fs'

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
const read = (path) => readFileSync(repo + path, 'utf8').replace(/\r\n/g, '\n')

test('the gate header states the default the schema declares', () => {
  const gate = read('src/gate.ts')
  const header = gate.slice(0, gate.indexOf('export interface Config'))
  const declaresOn = /enabled: live\(z\.boolean\(\)\.default\(true\)\)/.test(gate)
  if (!declaresOn) throw new Error('the schema no longer defaults to on; this check needs rewriting, not the text')
  if (/default is off|`enabled` script default is off/.test(header)) throw new Error('the header says the default is off')
})

test('the patch file counts the drawing tools the component registers', () => {
  const patch = read('cordis.patch.yml')
  const component = read('src/diagram.ts')
  const registered = [...component.matchAll(/ctx\.tools\.register\(/g)].length
  const claimed = /no tools of its own beyond `diagram_render`/.test(patch)
  if (claimed && registered > 1) throw new Error('the patch file says one drawing tool; ' + String(registered) + ' are registered')
})

test('every component row of the bundle has a card in both languages', () => {
  const patch = read('cordis.patch.yml')
  const rows = [...patch.matchAll(/name:\s*'dsh-model-everything(?:\/([a-z-]+))?'/g)].map((match) => match[1])
  if (rows.length < 3) throw new Error('only ' + String(rows.length) + ' rows were read')
  for (const sub of rows) {
    const base = sub === undefined ? 'locale' : sub + '/locale'
    for (const language of ['en', 'zh']) {
      if (!existsSync(repo + base + '/' + language + '.json')) throw new Error(base + '/' + language + '.json is missing')
    }
  }
})

test('the drawing switch is described as read at mount, not as live', () => {
  // The field is projected to the Plugins page, but `apply` reads it once: a sentence promising a restart-free switch
  // would be the same drift this suite exists to catch.
  const patch = read('cordis.patch.yml')
  if (/`enabled` is live: the Plugins page switch turns it off without a restart/.test(patch)) {
    throw new Error('the patch file still promises a restart-free switch')
  }
})

if (failures > 0) {
  console.log('component-claims tests failed:', failures)
  process.exit(1)
}
console.log('all component-claims tests passed')
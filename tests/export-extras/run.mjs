// The second file an export hands back: the properties a checker reads beside the model.
//
// Every format returns its own `extras`, and an empty object is the right answer when there is nothing to state - a filler file would be a
// property nobody wrote. What the file does say has to name things the model declares, and the one case where the two files contradict each other
// has to be reported rather than shipped.
import { exportModel } from '../../lib/exporters.js'

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

const MODEL = {
  schemaVersion: 1, init: 'i',
  states: [{ id: 'i' }, { id: 'd', terminal: true }],
  transitions: [{ from: 'i', event: 'go', to: 'd' }],
}

const withNever = {
  ...MODEL,
  states: [{ id: 'i' }, { id: 'd', terminal: true }, { id: 'bad' }],
  transitions: [...MODEL.transitions, { from: 'i', event: 'trip', to: 'bad' }],
  invariants: [{ id: 'never-bad', description: 'never bad', kind: 'never-states', states: ['bad'] }],
}

test('a model with nothing to state gets an empty properties file, not a filler', () => {
  for (const format of ['tla', 'prism', 'spin']) {
    const extras = exportModel(MODEL, format).extras ?? {}
    if (Object.keys(extras).length !== 0) throw new Error(format + ': ' + JSON.stringify(extras).slice(0, 80))
  }
})

test('a never-state becomes a property in every format that has one', () => {
  const expectations = {
    uppaal: (extras) => /A\[\] not ModelEverything\.bad/.test(String(extras.queries)),
    tla: (extras) => /bad/.test(String(extras.properties)),
    prism: (extras) => /forbidden/.test(String(extras.properties)),
    spin: (extras) => /ltl safety/.test(String(extras.properties)),
  }
  for (const [format, holds] of Object.entries(expectations)) {
    const extras = exportModel(withNever, format).extras ?? {}
    if (!holds(extras)) throw new Error(format + ': ' + JSON.stringify(extras).slice(0, 120))
  }
})

test('the UPPAAL queries name only states the model declares', () => {
  const extras = exportModel(withNever, 'uppaal').extras ?? {}
  const names = [...String(extras.queries ?? '').matchAll(/ModelEverything\.(\w+)/g)].map((match) => match[1])
  if (names.length === 0) throw new Error('no query names a state: ' + JSON.stringify(extras))
  for (const name of names) {
    if (!['i', 'd', 'bad'].includes(name)) throw new Error('a query names ' + name + ', which the model does not declare')
  }
})

test('PRISM declares the label its property uses', () => {
  // `P>=1 [ G !"forbidden" ]` is meaningless unless the model file defines that label.
  const out = exportModel(withNever, 'prism')
  if (!/label "forbidden" =/.test(String(out.primary))) throw new Error('the label is used but never declared')
  if (!/"forbidden"/.test(String(out.extras?.properties ?? ''))) throw new Error('the property does not use the label')
})

test('a state that is terminal and forbidden at once is reported', () => {
  // The two files then ask whether it is reachable and require that it is not: one of them is guaranteed to fail, and the cause is the model.
  const contradictory = { ...MODEL, invariants: [{ id: 'never-d', description: 'never d', kind: 'never-states', states: ['d'] }] }
  const warnings = exportModel(contradictory, 'uppaal').warnings ?? []
  if (!warnings.some((line) => /terminal and forbidden/.test(String(line)))) {
    throw new Error('warnings: ' + JSON.stringify(warnings).slice(0, 160))
  }
  if ((exportModel(MODEL, 'uppaal').warnings ?? []).length !== 0) throw new Error('the clean model warns about nothing')
})

if (failures > 0) {
  console.log('export-extras tests failed:', failures)
  process.exit(1)
}
console.log('all export-extras tests passed')
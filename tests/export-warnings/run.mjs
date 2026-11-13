// An export must not silently drop what the target cannot express.
//
// Each target is a different language with a different reach: PRISM has probabilities, UPPAAL has clocks, SPIN has never-claims, TLA+ has a state
// relation. Whatever a format cannot carry has to appear in `warnings`, named by kind - a dropped invariant that says nothing is a property the
// reader believes was checked and was not.
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

const FORMATS = ['uppaal', 'tla', 'prism', 'spin']

const MODEL = {
  schemaVersion: 1, init: 's0',
  states: [{ id: 's0' }, { id: 's1', terminal: true }],
  transitions: [{ from: 's0', event: 'go', to: 's1' }, { from: 's0', event: 'stay', to: 's0' }],
  invariants: [
    { id: 'cost', description: 'at most three steps', kind: 'budget', budget: 3 },
    { id: 'likely', description: 'usually ends', kind: 'probability', target: 's1', op: '>=', p: 0.5 },
    { id: 'leads', description: 'leads to the end', kind: 'leads-to', from: 's0', to: 's1' },
  ],
}

const warningsOf = (format, model = MODEL) => (exportModel(model, format).warnings ?? []).map((warning) => String(warning))

test('every invariant a format cannot translate is named in its warnings', () => {
  for (const format of FORMATS) {
    const warnings = warningsOf(format).join('\n')
    for (const kind of ['budget', 'leads-to']) {
      if (!warnings.includes(kind)) throw new Error(format + ' dropped `' + kind + '` without a word')
    }
  }
})

test('PRISM carries a probability and the others say they do not', () => {
  // The asymmetry is the point: a warning on every format would say nothing about which one can do the job.
  const prism = warningsOf('prism').join('\n')
  if (prism.includes('probability')) throw new Error('PRISM warned about a probability it can express')
  for (const format of ['uppaal', 'tla', 'spin']) {
    if (!warningsOf(format).join('\n').includes('probability')) throw new Error(format + ' dropped a probability without a word')
  }
})

test('a model the export cannot read is refused, and the reason names the field', () => {
  const broken = { ...MODEL, invariants: [{ id: 'x', description: 'x', kind: 'probability', target: 'nope', op: '>=', p: 0.5 }] }
  for (const format of FORMATS) {
    // The engine throws at this boundary rather than returning a report: an invalid model is not a finding about the export.
    let thrown
    let result
    try {
      result = exportModel(broken, format)
    } catch (error) {
      thrown = error
    }
    if (thrown === undefined) {
      if (result?.ok) throw new Error(format + ': an invalid model was exported')
      if (!JSON.stringify(result).includes('nope')) throw new Error(format + ': the refusal does not name the bad target')
      continue
    }
    const said = String(thrown.message)
    if (!said.includes('nope')) throw new Error(format + ': the refusal does not name the bad target: ' + said.slice(0, 70))
    if (!/invalid/.test(said)) throw new Error(format + ': the refusal does not say the model is invalid: ' + said.slice(0, 70))
  }
})

if (failures > 0) {
  console.log('export-warnings tests failed:', failures)
  process.exit(1)
}
console.log('all export-warnings tests passed')
import { exportModel } from '../../lib/exporters.js'
import { runVerification } from '../../lib/engine.js'

let failures = 0
function test(name, fn) { try { fn(); console.log('PASS', name) } catch (error) { failures += 1; console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error)) } }

const model = {
  schemaVersion: 1, init: 'A',
  states: [{ id: 'A' }, { id: 'B', terminal: true }],
  variables: [{ name: 'retry', kind: 'integer', init: 0, min: 0, max: 3 }],
  transitions: [
    { from: 'A', event: 'go', to: 'B', guard: { variable: 'retry', op: '<', value: 2 }, updates: [{ variable: 'retry', op: 'inc' }], weight: 3 },
    { from: 'A', event: 'skip', to: 'B', weight: 1 },
  ],
  invariants: [
    { id: 'never-b', description: 'never in B', kind: 'never-states', states: ['B'] },
    { id: 'reach-b', description: '90% reach B', kind: 'probability', target: 'B', op: '>=', p: 0.9 },
  ],
}

test('source model still verifies (sanity)', () => { const r = runVerification(model); if (!r.ok) throw new Error('baseline model invalid') })

test('uppaal export shape', () => {
  const out = exportModel(model, 'uppaal')
  for (const needle of ['<?xml version=', '<nta>', '<template>', '<name x=', '<init ref=', '<transition id=', 'kind="guard"', 'kind="assignment"', 'kind="comments"', 'system ModelEverything;']) {
    if (!out.primary.includes(needle)) throw new Error('missing ' + needle)
  }
  // A single machine is one template, so an `e!` synchronisation has no partner to meet: every transition would
  // block forever, and the channel was never declared either, so UPPAAL would not even load the file. The event name
  // is a comment now, and nothing waits on a channel this export does not contain.
  if (out.primary.includes('synchronisation')) throw new Error('a single-template export must not declare a rendezvous')
  const q = out.extras?.queries ?? ''
  if (!q.includes('E<> ModelEverything.B') || !q.includes('A[] not ModelEverything.B')) throw new Error('queries missing')
  if (!out.warnings.some((w) => w.includes('probability'))) throw new Error('probability must be a warning in UPPAAL export')
})

test('a field no target carries is reported, not dropped', () => {
  // `cost` and `maxTicks` were simply absent from every export: a reader who ran the exported file trusted it as the
  // model, and the budget and deadline the checks decided were not in what the target verified.
  const carrying = {
    ...model,
    transitions: model.transitions.map((transition) => ({ ...transition, cost: 3 })),
    states: model.states.map((state) => ({ ...state, maxTicks: 4 })),
  }
  for (const format of ['uppaal', 'tla', 'spin']) {
    const out = exportModel(carrying, format)
    const dropped = out.warnings.filter((warning) => warning.includes('EXPORT_FIELD_DROPPED'))
    if (dropped.length !== 2) throw new Error(format + ': expected one warning per dropped field, got ' + JSON.stringify(out.warnings))
    if (!dropped.some((warning) => warning.includes('cost'))) throw new Error(format + ': the cost must be named')
    if (!dropped.some((warning) => warning.includes('maxTicks'))) throw new Error(format + ': the deadline must be named')
  }
  // The near miss: a model that declares neither gets no warning about them.
  for (const format of ['uppaal', 'tla', 'spin', 'prism']) {
    const out = exportModel(model, format)
    if (out.warnings.some((warning) => warning.includes('EXPORT_FIELD_DROPPED'))) throw new Error(format + ': nothing was dropped, so nothing may say it was')
  }
})

test('a model too large for the PRISM encoding is not called invalid', () => {
  // The tool mapped every throw onto MODEL_INVALID, so a limit of the encoder came back as a claim about the model.
  const wide = {
    schemaVersion: 1,
    init: 'A',
    states: [{ id: 'A' }, { id: 'B', terminal: true }],
    transitions: [{ from: 'A', event: 'go', to: 'B' }],
    variables: [
      { name: 'x', kind: 'integer', init: 0, min: 0, max: 200 },
      { name: 'y', kind: 'integer', init: 0, min: 0, max: 200 },
    ],
  }
  let refusal
  try { exportModel(wide, 'prism') } catch (error) { refusal = error }
  if (!(refusal instanceof Error)) throw new Error('the enumeration limit must refuse')
  if (refusal.code !== 'EXPORT_TOO_LARGE') throw new Error('with its own code, got ' + String(refusal.code) + ': ' + refusal.message)
  if (!/valid/.test(refusal.message)) throw new Error('and say the model is valid: ' + refusal.message)
})

test('tla export shape', () => {
  const out = exportModel(model, 'tla')
  for (const needle of ['---- MODULE ModelEverything ----', 'VARIABLES pc, retry', 'pc = "A"', 'retry = 0', 'Next ==', 'CheckSafety', 'notin']) {
    if (!out.primary.includes(needle)) throw new Error('missing ' + needle)
  }
})

test('prism export shape', () => {
  const out = exportModel(model, 'prism')
  const all = out.primary + (out.extras?.properties ?? '')
  for (const needle of ['dtmc', 'module ModelEverything', 'endmodule', 'label "target"', 'label "forbidden"', "(pc' = 1)", 'P>=0.9 [ F "target" ]']) {
    if (!all.includes(needle)) throw new Error('missing ' + needle)
  }
})

test('spin export shape', () => {
  const out = exportModel(model, 'spin')
  for (const needle of ['active proctype ModelEverything()', 'pc == 0', 'retry = retry + 1', 'pc = 1', 'goto done', 'done: skip']) {
    if (!out.primary.includes(needle)) throw new Error('missing ' + needle)
  }
  if (!(out.extras?.properties ?? '').includes('ltl safety')) throw new Error('never-states property missing from promela')
})

test('tla guard equality/inequality mapping', () => {
  const eq = { schemaVersion: 1, init: 'A', states: [{ id: 'A' }, { id: 'B', terminal: true }], variables: [{ name: 'k', kind: 'integer', init: 0, min: 0, max: 2 }], transitions: [{ from: 'A', event: 'go', to: 'B', guard: { variable: 'k', op: '==', value: 1 } }] }
  const outEq = exportModel(eq, 'tla')
  if (outEq.primary.includes(' == 1')) throw new Error('TLA guard must not use == (got: k == 1)')
  if (!outEq.primary.includes('k = 1')) throw new Error('TLA guard must use = for equality')
  const ne = { schemaVersion: 1, init: 'A', states: [{ id: 'A' }, { id: 'B', terminal: true }], variables: [{ name: 'k', kind: 'integer', init: 0, min: 0, max: 2 }], transitions: [{ from: 'A', event: 'go', to: 'B', guard: { variable: 'k', op: '!=', value: 1 } }] }
  const outNe = exportModel(ne, 'tla')
  if (!outNe.primary.includes('k /= 1')) throw new Error('TLA guard must use /= for inequality')
  for (const def of ['TypeOK ==', 'States ==', 'Init ==', 'Next ==']) {
    if (!outEq.primary.includes(def)) throw new Error('definition operator must keep == : missing ' + def)
  }
  if (outEq.primary.includes('CheckSafety') && !outEq.primary.includes('CheckSafety ==')) {
    throw new Error('CheckSafety definition must keep ==')
  }
})

test('invalid model rejected', () => {
  let thrown = false
  try { exportModel({ schemaVersion: 1, init: 'X', states: [], transitions: [] }, 'tla') } catch (error) { thrown = String(error).includes('model invalid') }
  if (!thrown) throw new Error('expected model invalid error')
})

if (failures > 0) { console.log('exporters tests failed:', failures); process.exit(1) }
console.log('all exporter tests passed')

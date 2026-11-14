// The gate's three settings, and where a deployment's own sentence lands.
//
// `enabled` is read on every inject, so a deployment can turn the gate off without a restart; `gateContent` replaces the text outright; and
// `extraGuidance` is appended after the refusal rule and before the closing restatement - last, so it is read after the routing it modifies.
// Those three are the whole surface, and the placement is the part that is easy to move without noticing.
const { Config, DEFAULT_GATE_TEXT, renderGateText } = await import('../../lib/gate.js')

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

test('the gate is on unless a deployment says otherwise, and the switch is live', () => {
  // Live means the value read at inject time is consulted, not a boolean captured at mount.
  const on = Config({})
  if (on.enabled.get() !== true) throw new Error('the default is off')
  const off = Config({ enabled: false })
  if (off.enabled.get() !== false) throw new Error('the switch does not read false')
})

test('the default text is the one the renderer produces', () => {
  const config = Config({})
  if (config.gateContent !== DEFAULT_GATE_TEXT) throw new Error('the default text is not the rendered one')
  if (config.gateContent.length === 0) throw new Error('the default text is empty')
  if (config.extraGuidance !== '') throw new Error('the default guidance is not empty')
})

test('a deployment can replace the text outright', () => {
  const config = Config({ gateContent: 'one line' })
  if (config.gateContent !== 'one line') throw new Error('the replacement was ignored: ' + String(config.gateContent).slice(0, 40))
})

test('a deployment sentence lands after the refusal rule and before the closing restatement', () => {
  const text = renderGateText(undefined, 'Deployment rule: x.')
  const at = text.indexOf('Deployment rule: x.')
  if (at < 0) throw new Error('the sentence is not in the text')
  const refusal = text.indexOf('**When a tool refuses or is absent.**')
  const closing = text.indexOf('The rule again')
  if (refusal < 0 || closing < 0) throw new Error('the text lost a section')
  if (!(refusal < at && at < closing)) throw new Error('the sentence is not between the refusal rule and the restatement')
  if (!text.includes('\n\nDeployment rule: x.\n\n')) throw new Error('the sentence is not on its own paragraph')
})

test('no guidance leaves the text as the shipped one', () => {
  // The control: a renderer that always appended something would pass the case above.
  const plain = renderGateText(undefined, '   ')
  if (plain !== DEFAULT_GATE_TEXT) throw new Error('blank guidance changed the text')
})

if (failures > 0) {
  console.log('gate-config tests failed:', failures)
  process.exit(1)
}
console.log('all gate-config tests passed')
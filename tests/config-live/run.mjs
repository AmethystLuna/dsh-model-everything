// The two switches this plugin shows on the Plugins page, and the one helper both of them ask.
//
// A plain boolean is not projected to that page at all, so a row that means to offer a switch and declares a plain one
// offers nothing. The diagram row probed a `.live` name schemastery does not have and fell back to the plain boolean;
// measured, its `enabled` came back as `true`, while the gate's came back as an object answering `get()`. Both rows ask
// `live()` now, and this suite is what keeps them the same shape.
import { Config as GateConfig } from '../../lib/gate.js'
import { Config as DiagramConfig, enabledOf } from '../../lib/diagram.js'
import { live, switchOf } from '../../lib/live-config.js'

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

const reads = (value) => typeof value === 'object' && value !== null && typeof value.get === 'function'

test('both switches are projected, so each row offers a switch on the settings page', () => {
  const gate = GateConfig({})
  const diagram = DiagramConfig({})
  if (!reads(gate.enabled)) throw new Error('the gate switch is a plain value: ' + String(gate.enabled))
  if (!reads(diagram.enabled)) throw new Error('the diagram switch is a plain value: ' + String(diagram.enabled))
})

test('the two switches are the same shape, so one reader serves both', () => {
  const gate = GateConfig({})
  const diagram = DiagramConfig({})
  if (reads(gate.enabled) !== reads(diagram.enabled)) throw new Error('the rows disagree about their shape')
})

test('a switch reads as the value a deployment set', () => {
  if (enabledOf(DiagramConfig({})) !== true) throw new Error('the diagram switch is off by default')
  if (enabledOf(DiagramConfig({ enabled: false })) !== false) throw new Error('the diagram switch does not read false')
  if (switchOf(false) !== false) throw new Error('a plain false reads as true')
  if (switchOf({ get: () => false }) !== false) throw new Error('a projected false reads as true')
  if (switchOf(true) !== true || switchOf({ get: () => true }) !== true) throw new Error('a true reads as false')
})

test('a host without the volatile wrapper gets the field unchanged', () => {
  // The fallback is what keeps this plugin loadable on a host that predates `.volatile()`.
  const plain = { default: () => 'x' }
  if (live(plain) !== plain) throw new Error('a field without volatile was replaced')
  const volatile = { default: () => 'x', volatile: () => 'wrapped' }
  if (live(volatile) !== 'wrapped') throw new Error('a volatile field was not wrapped')
})

if (failures > 0) {
  console.log('config-live tests failed:', failures)
  process.exit(1)
}
console.log('all config-live tests passed')
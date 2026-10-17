// The gate: one routing message, injected once per session, behind a switch.
//
// What is under test is not "does cordis deliver messages" - that is the host's job. It is
// the decisions this component makes: whether to inject, whether it already did, and
// whether the switch is read per step (which is what makes flipping it live possible).
//
// The text is tested against the skills on disk, because its whole value is naming them: a
// skill added without a line here is a routing hole no other suite can see.
import { readFileSync, readdirSync } from 'node:fs'

const skillsRoot = new URL('../../skills/', import.meta.url)

let failures = 0
async function check(name, fn) {
  try {
    await fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const shipped = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

let gate
try {
  gate = await import(new URL('../../lib/gate.js', import.meta.url))
} catch (error) {
  // Not a SKIP: every dependency here is a devDependency of the repository, so an import
  // failure is a real failure - and a skipped gate is a gate nobody checked.
  console.log('FAIL the gate module loads -', error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const GATE_KIND = 'plugin:dsh-model-everything-gate'

/** Mount the component over a context that records the listener and mounts nothing else. */
function mountWith(config) {
  const listeners = new Map()
  const ctx = {
    on(event, handler) {
      listeners.set(event, handler)
    },
    // No inspect registry: the component must work in a headless assembly without one.
    get() {
      return undefined
    },
    effect() {},
  }
  gate.apply(ctx, config)
  const handler = listeners.get('agent/pre-step')
  if (handler === undefined) throw new Error('no agent/pre-step listener')
  return handler
}

const mount = (enabled) => mountWith({ enabled, gateContent: gate.DEFAULT_GATE_TEXT })

/** One pre-step pass over a session whose log is `events`. */
function pass(handler, events = []) {
  return handler({ agent: { session: { snapshotEvents: () => events } } }, async () => ({ kind: 'enter', messages: [] }))
}

await check('the package exposes the gate as its own entry point', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
  const entry = pkg.exports?.['./gate']
  if (entry === undefined) throw new Error('package.json has no "./gate" export')
  if (entry.default !== './lib/gate.js') throw new Error('./gate points at ' + String(entry.default))
})

await check('the loader patch mounts the gate as a separate row, switched off', () => {
  const patch = readFileSync(new URL('../../cordis.patch.yml', import.meta.url), 'utf8')
  const rows = [...patch.matchAll(/^ {4}- id: (.+)$/gm)].map((match) => match[1].trim())
  if (!rows.includes('dsh-model-everything')) throw new Error('the main row is gone; rows are ' + rows.join(', '))
  if (!rows.includes('dsh-model-everything-gate')) throw new Error('no gate row; one component per row, rows are ' + rows.join(', '))
  if (!/name: 'dsh-model-everything\/gate'/.test(patch)) throw new Error('the gate row does not name the subpath entry point')
  const gateRow = patch.slice(patch.indexOf('dsh-model-everything-gate'))
  if (!/enabled: false/.test(gateRow)) throw new Error('the gate row does not mount it off, so every install would pay for it')
})

await check('the default text names every shipped skill, and nothing else', () => {
  const text = gate.DEFAULT_GATE_TEXT
  // Read the skill names out of the text as whole backticked tokens: `model-everything` is a
  // prefix of every other skill name, so a substring test would find the entry point inside
  // each sibling and call that a second mention.
  const tokens = [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1])
  const skillLike = tokens.filter((token) => token === 'model-everything' || token.startsWith('model-everything-'))
  const count = (skill) => skillLike.filter((token) => token === skill).length
  const missing = shipped.filter((skill) => count(skill) === 0)
  if (missing.length > 0) throw new Error('a shipped skill has no line in the gate: ' + missing.join(', '))
  // The reverse direction: a name for a skill that does not exist sends the model nowhere.
  const stale = skillLike.filter((token) => !shipped.includes(token))
  if (stale.length > 0) throw new Error('the gate names skills that are not shipped: ' + [...new Set(stale)].join(', '))
  const twice = shipped.filter((skill) => count(skill) > (skill === 'model-everything' ? 2 : 1))
  if (twice.length > 0) {
    // The entry skill is named twice on purpose: once as the thing to load when it is unclear
    // whether a check applies, once in the routing list. That is the shape the sibling
    // plugin's gate uses, and the first mention is the one that answers "where do I start".
    throw new Error('the gate names a skill more often than its line: ' + twice.join(', '))
  }
})

await check('the default text stays inside its cost ceiling', () => {
  // A cost ceiling, not a catalogue count: the message lands in every session that enables
  // the gate, so its growth is a per-session price. Raising the ceiling is a decision, which
  // is why the number is written down here rather than derived. It carries the routing, the
  // tool inventory with what each does not prove, and how to read a report - the same four
  // parts the sibling plugin's gate carries.
  const limit = 2800
  const length = gate.DEFAULT_GATE_TEXT.length
  if (length > limit) throw new Error('the gate text is ' + String(length) + ' characters, over the ' + String(limit) + ' ceiling')
})

await check('the component is off, and pointed at the default text, unless configured', async () => {
  // `Config()` resolves the switch to whatever this host's schemastery produces - a Volatile
  // here, a plain boolean on an older host. Assert the behaviour the default produces, not
  // the shape it arrives in: that is also what the host does.
  const defaults = gate.Config()
  if (defaults.gateContent !== gate.DEFAULT_GATE_TEXT) throw new Error('gateContent default is not the default text')
  const decision = await pass(mountWith(defaults))
  if (decision.messages.length !== 0) throw new Error('the default configuration injects ' + String(decision.messages.length) + ' message(s)')
})

await check('a switched-off gate injects nothing', async () => {
  const decision = await pass(mount(false))
  if (decision.kind !== 'enter') throw new Error('decision kind is ' + String(decision.kind))
  if (decision.messages.length !== 0) throw new Error('appended ' + String(decision.messages.length) + ' message(s) while off')
})

await check('a switched-on gate appends one message that carries its own source kind', async () => {
  const decision = await pass(mount(true))
  if (decision.kind !== 'enter') throw new Error('decision kind is ' + String(decision.kind))
  if (decision.messages.length !== 1) throw new Error('appended ' + String(decision.messages.length) + ' message(s)')
  const serialised = JSON.stringify(decision.messages[0])
  if (!serialised.includes(GATE_KIND)) throw new Error('the message does not carry ' + GATE_KIND)
  // Read the text back out of the message rather than matching escaped JSON: the point is
  // that the configured text is what rides along, character for character.
  const parts = decision.messages[0]?.content ?? []
  const text = (Array.isArray(parts) ? parts : [parts])
    .map((part) => (typeof part === 'string' ? part : part?.text ?? ''))
    .join('')
  if (text !== gate.DEFAULT_GATE_TEXT) {
    throw new Error('the injected text is not the configured text (' + String(text.length) + ' of ' + String(gate.DEFAULT_GATE_TEXT.length) + ' characters)')
  }
})

const handler = mount(true)

const second = await pass(handler, [{ type: 'user/message', data: { source: { kind: GATE_KIND } } }])
await check('a session that already carries the gate gets no second copy', () => {
  if (second.messages.length !== 0) throw new Error('injected again over its own history: ' + String(second.messages.length))
})

const otherHistory = await pass(handler, [{ type: 'user/message', data: { source: { kind: 'user' } } }])
await check('an unrelated message in the history does not count as the gate', () => {
  if (otherHistory.messages.length !== 1) throw new Error('a session with other messages was suppressed')
})

const rejected = await handler({ agent: { session: { snapshotEvents: () => [] } } }, async () => ({ kind: 'reject' }))
await check('a rejected step is returned unchanged', () => {
  if (rejected.kind !== 'reject') throw new Error('the decision was rewritten to ' + String(rejected.kind))
})

// The live switch: one mount, the value behind it changes between steps.
let live = false
const liveHandler = mount({ get: () => live })
const whileOff = await pass(liveHandler)
live = true
const whileOn = await pass(liveHandler)
await check('the switch is read per step, so it can be flipped inside a running host', () => {
  if (whileOff.messages.length !== 0) throw new Error('injected while the switch was off')
  if (whileOn.messages.length !== 1) throw new Error('did not inject after the switch turned on (' + String(whileOn.messages.length) + ')')
})

if (failures > 0) {
  console.log('gate checks failed:', failures)
  process.exit(1)
}
console.log('all gate checks passed')

// The `intent` parameter is a guard, not a report modifier: it refuses a request whose declared purpose the view cannot serve.
//
// So the matrix is what matters. An intent that is served changes nothing - the same review with `present`, `verify` and `fidelity` has to
// produce the same findings, or the parameter would be quietly editing the answer. An intent that is not served has to be refused with its code
// before any work.
import { checkUmlIntent } from '../../lib/uml.js'

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

const refusal = (intent, action, view) => {
  try {
    checkUmlIntent(intent, action, view)
    return undefined
  } catch (error) {
    return error
  }
}

/** The cells each action serves, as the engine's tables state them. */
const SERVED = {
  render: ['present', 'verify'],
  parse: ['verify'],
  review: ['present', 'verify', 'fidelity'],
  labels: [],
}

test('an intent an action serves is accepted', () => {
  for (const [action, intents] of Object.entries(SERVED)) {
    for (const intent of intents) {
      const refused = refusal(intent, action, { notation: 'mermaid', diagram: 'state' })
      if (refused !== undefined) throw new Error(action + '/' + intent + ' was refused: ' + String(refused.message).slice(0, 60))
    }
  }
})

test('an intent an action does not serve is refused with UML_INTENT_MISMATCH, and the message names what to do', () => {
  for (const [action, intents] of Object.entries(SERVED)) {
    for (const intent of ['present', 'verify', 'fidelity']) {
      if (intents.includes(intent)) continue
      const refused = refusal(intent, action, { notation: 'mermaid', diagram: 'state' })
      if (refused === undefined) throw new Error(action + '/' + intent + ' was accepted')
      if (refused.code !== 'UML_INTENT_MISMATCH') throw new Error(action + '/' + intent + ': ' + String(refused.code))
      // The message has to say what the action returns and what it does serve, or a reader cannot fix the request.
      if (!/returns/.test(refused.message)) throw new Error(action + '/' + intent + ': ' + refused.message.slice(0, 80))
    }
  }
})

test('a sequence view serves a presentation and nothing that needs a machine', () => {
  if (refusal('present', 'render', { notation: 'mermaid', diagram: 'sequence' }) !== undefined) {
    throw new Error('presenting a sequence diagram was refused')
  }
  for (const intent of ['verify', 'fidelity']) {
    const refused = refusal(intent, 'review', { notation: 'mermaid', diagram: 'sequence' })
    if (refused === undefined) throw new Error(intent + ' accepted a sequence view')
    if (refused.code !== 'UML_INTENT_UNSERVABLE') throw new Error(intent + ': ' + String(refused.code))
  }
})

test('a view the notation cannot draw is refused before the intent is considered', () => {
  // PlantUML has no faithful activity view; the refusal is about the view, not about the purpose.
  const refused = refusal('present', 'render', { notation: 'plantuml', diagram: 'activity' })
  if (refused === undefined) throw new Error('plantuml activity was accepted')
  if (refused.code === 'UML_INTENT_MISMATCH') throw new Error('the intent was blamed for a view that cannot be drawn')
})

test('no intent changes nothing at all', () => {
  // The parameter is opt-in: without it this check does nothing, which is what keeps every existing caller working. The view check is a
  // separate entry point (`assertUmlView`) that each action calls on its own.
  if (refusal(undefined, 'render', { notation: 'plantuml', diagram: 'activity' }) !== undefined) {
    throw new Error('the intent check ran without an intent')
  }
  if (refusal(undefined, 'review', { notation: 'mermaid', diagram: 'sequence' }) !== undefined) {
    throw new Error('a sequence review was refused without an intent')
  }
  // With an intent the same pairing is refused, which is the whole difference the parameter makes.
  if (refusal('present', 'render', { notation: 'plantuml', diagram: 'activity' }) === undefined) {
    throw new Error('an intent did not trigger the view check')
  }
})

if (failures > 0) {
  console.log('intent tests failed:', failures)
  process.exit(1)
}
console.log('all intent tests passed')
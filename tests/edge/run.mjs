// What an arrow does once its ends are read: an edge, or the machine's exit.
//
// The exit marker is the decision worth pinning: `X --> [*]` leaves the machine, and read as a plain endpoint it would draw a box called
// `*` and an edge into it.
import { planArrow } from '../../lib/render/plantuml-edge.js'

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

const arrow = (from, to, extra = {}) => ({ from: { id: from }, to: { id: to }, label: '', dashed: false, arrow: 'association', ...extra })

test('an arrow between two elements is an edge with its two ends', () => {
  const effect = planArrow(arrow('a', 'b', { label: 'uses' }))
  if (effect.from.id !== 'a' || effect.to.id !== 'b') throw new Error(JSON.stringify(effect))
  if (effect.label !== 'uses') throw new Error('label: ' + effect.label)
  if (effect.exit) throw new Error('an ordinary edge was read as leaving')
  if (effect.arrow !== 'association') throw new Error('kind: ' + String(effect.arrow))
})

test('a dotted arrow stays dotted', () => {
  const effect = planArrow(arrow('a', 'b', { dashed: true, arrow: 'dependency' }))
  if (effect.dashed !== true || effect.arrow !== 'dependency') throw new Error(JSON.stringify(effect))
})

test('an arrow into the exit marker closes on its own source and is labelled', () => {
  const effect = planArrow(arrow('closed', '*'))
  if (!effect.exit) throw new Error('the marker was read as an endpoint')
  if (effect.from.id !== 'closed' || effect.to.id !== 'closed') throw new Error(JSON.stringify([effect.from, effect.to]))
  if (effect.label !== 'end') throw new Error('label: ' + effect.label)
  // Leaving is drawn dashed, the same statement the Mermaid adapter makes for its end marker.
  if (effect.dashed !== true) throw new Error('the exit is drawn solid')
  if (effect.arrow !== undefined) throw new Error('the exit carries an arrow head kind')
})

test('an exit marker keeps the label the source wrote', () => {
  const effect = planArrow(arrow('closed', '*', { label: 'done' }))
  if (effect.label !== 'done') throw new Error('label: ' + effect.label)
})

if (failures > 0) {
  console.log('edge tests failed:', failures)
  process.exit(1)
}
console.log('all edge tests passed')
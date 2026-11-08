// Lifting the short stub that ends a route: which length the arrival takes, and when none is taken.
//
// The rule is the ladder and the two refusals - a length that folds the route onto the point before the corner, and a
// length whose line the caller refuses. Both are asserted here because the drawing suites only see the result.
import { applyLift, liftedSpan, STUB_LADDER, tailOf, WHOLE_STUB } from '../../lib/render/lift.js'

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

const route = (...pairs) => pairs.map(([x, y]) => ({ x, y }))
const free = () => true
const refused = () => false

test('the last leg is read, and a route too short has none', () => {
  const tail = tailOf(route([0, 0], [40, 0], [40, 4]))
  if (tail === undefined) throw new Error('no tail')
  if (!tail.down) throw new Error('a vertical arrival was read as horizontal')
  if (tail.along !== 4) throw new Error('along: ' + String(tail.along))
  if (tailOf(route([0, 0], [40, 40])) !== undefined) throw new Error('a two-point route has a tail')
})

test('a leg already long enough is left alone', () => {
  if (liftedSpan(route([0, 0], [40, 0], [40, WHOLE_STUB]), free) !== undefined) throw new Error('a whole stub was lifted')
})

test('a short leg takes the longest length that is free', () => {
  const span = liftedSpan(route([0, 0], [40, 0], [40, 4]), free)
  if (span !== STUB_LADDER[0]) throw new Error('span: ' + String(span))
})

test('a refused length falls to the next one', () => {
  const asked = []
  const span = liftedSpan(route([0, 0], [40, 0], [40, 4]), (_line, candidate) => {
    asked.push(candidate)
    return candidate < STUB_LADDER[0]
  })
  if (span !== STUB_LADDER[1]) throw new Error('span: ' + String(span))
  if (asked.length !== 2) throw new Error('the ladder was not walked: ' + JSON.stringify(asked))
})

test('no length at all leaves the stub as it is', () => {
  if (liftedSpan(route([0, 0], [40, 0], [40, 4]), refused) !== undefined) throw new Error('a refused lift was taken')
})

test('a length that would fold the route back on itself is skipped', () => {
  // The route comes in at y=20 and drops to a port at y=4, so a lift of sixteen from the port lands exactly on the row the
  // route arrived on: taking it would fold the line back onto itself.
  const points = route([0, 20], [40, 20], [40, 4])
  const span = liftedSpan(points, free)
  if (span === STUB_LADDER[0]) throw new Error('the fold was taken')
})

test('applying a lift moves the corner and the point before it, and the leg ends at the port', () => {
  const points = route([0, 0], [40, 0], [40, 4])
  const span = liftedSpan(points, free)
  if (span === undefined) throw new Error('nothing to apply')
  if (!applyLift(points, span)) throw new Error('the lift was refused')
  const [head, corner, port] = points
  if (port.y !== 4) throw new Error('the port moved: ' + String(port.y))
  if (corner.y !== head.y) throw new Error('the line is not level: ' + JSON.stringify(points))
  if (port.y - corner.y < 8) throw new Error('the arrival is still a ledge: ' + String(port.y - corner.y))
})

if (failures > 0) {
  console.log('lift tests failed:', failures)
  process.exit(1)
}
console.log('all lift tests passed')
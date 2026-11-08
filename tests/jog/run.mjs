// The jog snap, as arithmetic on points: no canvas, no boxes, one predicate.
//
// What is checked is the shape of the rule: a kink a couple of pixels wide is removed, a real corner is not, and a
// candidate the caller refuses is left alone.
import { snapJogs, SNAP_JOG } from '../../lib/render/jog.js'

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

const allowed = () => false

test('a two-pixel step between two parallel legs is removed', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 2.5 },
    { x: 80, y: 2.5 },
  ]
  const snapped = snapJogs(points, allowed)
  if (snapped === undefined) throw new Error('the kink was left in')
  // Two points left: the corner and the point before it are collinear with the leg that moved.
  if (snapped.length !== 2) throw new Error('the kink was not collapsed: ' + String(snapped.length))
  const ys = snapped.map((point) => point.y)
  if (Math.max(...ys) - Math.min(...ys) > 0.01) throw new Error('the route still steps: ' + JSON.stringify(ys))
})

test('a leg as long as a real corner is left alone', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: SNAP_JOG + 10 },
    { x: 80, y: SNAP_JOG + 10 },
  ]
  if (snapJogs(points, allowed) !== undefined) throw new Error('a corner was snapped away')
})

test('a candidate the caller refuses is left in place', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 2.5 },
    { x: 80, y: 2.5 },
  ]
  const refused = snapJogs(points, () => true)
  if (refused !== undefined) throw new Error('a refused move was taken')
})

test('a step whose neighbours do not cross it is an L, not a kink', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 2.5 },
    { x: 40, y: 80 },
  ]
  if (snapJogs(points, allowed) !== undefined) throw new Error('an L was treated as a kink')
})

test('a route with no jog is returned as it came', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0, y: 40 },
    { x: 40, y: 40 },
  ]
  if (snapJogs(points, allowed) !== undefined) throw new Error('a clean route was rewritten')
})

if (failures > 0) {
  console.log('jog tests failed:', failures)
  process.exit(1)
}
console.log('all jog tests passed')
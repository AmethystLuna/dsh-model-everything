// Avoidance is caused by the obstacle, not produced by chance.
//
// `tests/render` already asserts that no rendered drawing carries an edge through a box, on a fixed corpus. That says the drawings it tried were
// clean; it does not say the router bent *because* something was in the way. These four cases do: the same pair of boxes, and a third one moved
// in and out of the corridor between them.
import { crossesBox, routeEdge } from '../../lib/render/route.js'

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

const A = { x: 0, y: 0, width: 100, height: 40, label: 'a' }
const B = { x: 400, y: 0, width: 100, height: 40, label: 'b' }

/** Every segment of a route, as pairs. */
const segments = (points) => points.slice(1).map((point, index) => [points[index], point])

const crossings = (points, box) => segments(points).filter(([from, to]) => crossesBox(from.x, from.y, to.x, to.y, box))

test('with nothing between them the route is a straight line and says so', () => {
  const route = routeEdge(A, B, [A, B])
  if (route.routed) throw new Error('a clear corridor was reported as routed')
  if (route.points.length !== 2) throw new Error('points: ' + String(route.points.length))
})

test('a box in the corridor makes the route bend, and the bend clears it', () => {
  const wall = { x: 180, y: -40, width: 80, height: 120, label: 'wall' }
  const route = routeEdge(A, B, [A, B, wall])
  if (!route.routed) throw new Error('a wall in the corridor did not make the route bend')
  if (route.points.length < 4) throw new Error('points: ' + String(route.points.length))
  const through = crossings(route.points, wall)
  if (through.length > 0) throw new Error('the route crosses the wall: ' + JSON.stringify(through))
})

test('the same box moved out of the corridor leaves the route straight again', () => {
  // The control: without it, a router that bent everything would pass the case above.
  const wall = { x: 180, y: -40, width: 80, height: 120, label: 'wall' }
  const moved = { ...wall, y: 400 }
  const route = routeEdge(A, B, [A, B, moved])
  if (route.routed) throw new Error('a box out of the corridor still made the route bend')
  if (route.points.length !== 2) throw new Error('points: ' + String(route.points.length))
})

test('a narrow box in the corridor is cleared by every segment, not only the first', () => {
  const narrow = { x: 180, y: -10, width: 20, height: 50, label: 'narrow' }
  const route = routeEdge(A, B, [A, B, narrow])
  if (!route.routed) throw new Error('a narrow box did not make the route bend')
  const through = crossings(route.points, narrow)
  if (through.length > 0) throw new Error('a segment crosses the box: ' + JSON.stringify(through))
})

if (failures > 0) {
  console.log('route-causality tests failed:', failures)
  process.exit(1)
}
console.log('all route-causality tests passed')
// Where an edge's label sits: which run it takes, and what it accepts when nothing is clear.
//
// The label names a transition, so it may not leave its own edge; the rest is a search that trades a longer run for a clear
// rectangle and, failing that, for the fewest things covered.
import { placeLabel } from '../../lib/render/labels.js'

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
const nowhere = () => []

test('a label with nothing in the way sits on its longest run', () => {
  const points = route([0, 100], [40, 100], [40, 0])
  const placed = placeLabel('go', points, nowhere(), [], [])
  if (placed.run !== 0) throw new Error('run: ' + String(placed.run))
  if (placed.collisions !== 0) throw new Error('collisions: ' + String(placed.collisions))
  // The vertical run is longer than the horizontal one, so the label sits on it.
  if (Math.abs(placed.x - 40) > 0.01) throw new Error('not on the vertical run: ' + String(placed.x))
})

test('a label never leaves its own edge', () => {
  const points = route([0, 0], [100, 0])
  const placed = placeLabel('a long label here', points, nowhere(), [], [])
  if (placed.y !== 0) throw new Error('the label left the line: ' + String(placed.y))
  if (placed.x < 0 || placed.x > 100) throw new Error('the label ran off the run: ' + String(placed.x))
})

test('a crowded run is given up for a clear shorter one', () => {
  const points = route([0, 0], [200, 0], [200, 40])
  // Another route lies along the whole of the long run; the short run is clear.
  const other = [[{ x1: -20, y1: 0, x2: 220, y2: 0 }]]
  const placed = placeLabel('go', points, nowhere(), [], other)
  if (placed.run !== 1) throw new Error('it stayed on the blocked run: ' + String(placed.run))
})

test('with nothing clear, text over an edge is preferred to text over a box', () => {
  const points = route([0, 0], [200, 0])
  // A box covers the whole run except where the case's own edge sits, and another route covers the rest.
  const boxes = [{ x: -10, y: -40, width: 220, height: 30 }]
  const other = [[{ x1: 0, y1: 0, x2: 200, y2: 0 }]]
  const placed = placeLabel('go', points, boxes, [], other)
  if (placed.boxes > placed.edges) throw new Error('it covered a box when an edge would do')
  if (placed.collisions === 0) throw new Error('a crowded drawing reported a clear placement')
})

if (failures > 0) {
  console.log('labels tests failed:', failures)
  process.exit(1)
}
console.log('all labels tests passed')
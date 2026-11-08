// Where an edge's label sits: which run it takes, and what it accepts when nothing is clear.
//
// The label names a transition, so it may not leave its own edge; the rest is a search that trades a longer run for a clear
// rectangle and, failing that, for the fewest things covered. What a candidate covers is the caller's answer, so the fixtures
// here count it the same way the painter does.
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
const PAD = 2

const covers = ({ boxes = [], labels = [], routes = [] } = {}) => (spot) => {
  const overlaps = (other) =>
    spot.x - spot.width / 2 < other.x + other.width + PAD && spot.x + spot.width / 2 > other.x - PAD &&
    spot.y - spot.height / 2 < other.y + other.height + PAD && spot.y + spot.height / 2 > other.y - PAD
  const overSegment = (segment) =>
    spot.x + spot.width / 2 > Math.min(segment.x1, segment.x2) - PAD && spot.x - spot.width / 2 < Math.max(segment.x1, segment.x2) + PAD &&
    spot.y + spot.height / 2 > Math.min(segment.y1, segment.y2) - PAD && spot.y - spot.height / 2 < Math.max(segment.y1, segment.y2) + PAD
  const boxHits = boxes.filter((box) => overlaps(box)).length
  const labelHits = labels.filter((label) => overlaps({ x: label.x - label.width / 2, y: label.y - label.height / 2, width: label.width, height: label.height })).length
  const edgeHits = routes.filter((segments) => segments.some(overSegment)).length
  return { boxes: boxHits, labels: labelHits, edges: edgeHits }
}

test('a label with nothing in the way sits on its longest run', () => {
  const points = route([0, 100], [40, 100], [40, 0])
  const placed = placeLabel('go', points, covers())
  if (placed.run !== 0) throw new Error('run: ' + String(placed.run))
  if (placed.collisions !== 0) throw new Error('collisions: ' + String(placed.collisions))
  if (Math.abs(placed.x - 40) > 0.01) throw new Error('not on the vertical run: ' + String(placed.x))
})

test('a label never leaves its own edge', () => {
  const points = route([0, 0], [100, 0])
  const placed = placeLabel('a long label here', points, covers())
  if (placed.y !== 0) throw new Error('the label left the line: ' + String(placed.y))
  if (placed.x < 0 || placed.x > 100) throw new Error('the label ran off the run: ' + String(placed.x))
})

test('a crowded run is given up for a clear shorter one', () => {
  const points = route([0, 0], [200, 0], [200, 40])
  const placed = placeLabel('go', points, covers({ routes: [[{ x1: -20, y1: 0, x2: 220, y2: 0 }]] }))
  if (placed.run !== 1) throw new Error('it stayed on the blocked run: ' + String(placed.run))
})

test('with nothing clear, text over an edge is preferred to text over a box', () => {
  const points = route([0, 0], [200, 0])
  const placed = placeLabel('go', points, covers({
    boxes: [{ x: -10, y: -40, width: 220, height: 30 }],
    routes: [[{ x1: -10, y1: 0, x2: 210, y2: 0 }]],
  }))
  if (placed.boxes > placed.edges) throw new Error('it covered a box when an edge would do')
  if (placed.collisions === 0) throw new Error('a crowded drawing reported a clear placement')
})

if (failures > 0) {
  console.log('labels tests failed:', failures)
  process.exit(1)
}
console.log('all labels tests passed')
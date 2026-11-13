// Which side an edge leaves from, and where on the box it attaches.
//
// `tests/ports` covers packing several ports along one side; this covers the decision that comes first - which side - and the point it lands on.
// A route that attached at the box centre would still look like a connection at a glance, and it would still clear the boxes, so nothing else here
// notices it.
import { anchor, approachSides } from '../../lib/render/route.js'
import { render } from '../../lib/render/index.js'

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

const BOX = { x: 0, y: 0, width: 100, height: 40, label: 'a' }

test('an anchor is the middle of the side it names', () => {
  const expected = { top: { x: 50, y: 0 }, bottom: { x: 50, y: 40 }, left: { x: 0, y: 20 }, right: { x: 100, y: 20 } }
  for (const [side, point] of Object.entries(expected)) {
    const got = anchor(BOX, side)
    if (got.x !== point.x || got.y !== point.y) throw new Error(side + ': ' + JSON.stringify(got) + ' against ' + JSON.stringify(point))
  }
})

test('the side follows the direction of travel', () => {
  const below = { x: 0, y: 200, width: 100, height: 40, label: 'below' }
  const right = { x: 300, y: 0, width: 100, height: 40, label: 'right' }
  const vertical = approachSides(BOX, below)
  if (vertical.exit !== 'bottom' || vertical.entry !== 'top') throw new Error('vertical: ' + JSON.stringify(vertical))
  const horizontal = approachSides(BOX, right)
  if (horizontal.exit !== 'right' || horizontal.entry !== 'left') throw new Error('horizontal: ' + JSON.stringify(horizontal))
})

/** The one link of a two-box drawing, as its two endpoints. */
const linkOf = (source) => {
  const shapes = render({ source }).canvas.shapes
  const boxes = shapes.filter((shape) => shape.kind === 'box')
  const link = shapes.find((shape) => shape.kind === 'link')
  if (boxes.length !== 2) throw new Error('boxes: ' + String(boxes.length))
  if (link === undefined) throw new Error('no link was drawn')
  return { from: boxes[0], to: boxes[1], start: { x: link.x1, y: link.y1 }, end: { x: link.x2, y: link.y2 } }
}

test('a vertical drawing attaches on the facing edges, not at the centres', () => {
  const { from, to, start, end } = linkOf('graph TD\n  a[Top] --> b[Below]')
  if (Math.abs(start.y - (from.y + from.height)) > 0.5) throw new Error('the link does not start on the bottom edge: ' + JSON.stringify(start))
  if (Math.abs(end.y - to.y) > 0.5) throw new Error('the link does not end on the top edge: ' + JSON.stringify(end))
  const centre = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  if (Math.abs(start.y - centre.y) < 1) throw new Error('the link starts at the box centre')
})

test('a horizontal drawing attaches on the facing edges, not at the centres', () => {
  const { from, to, start, end } = linkOf('graph LR\n  a[Left] --> b[Right]')
  if (Math.abs(start.x - (from.x + from.width)) > 0.5) throw new Error('the link does not start on the right edge: ' + JSON.stringify(start))
  if (Math.abs(end.x - to.x) > 0.5) throw new Error('the link does not end on the left edge: ' + JSON.stringify(end))
  const centre = { x: from.x + from.width / 2, y: from.y + from.height / 2 }
  if (Math.abs(start.x - centre.x) < 1) throw new Error('the link starts at the box centre')
})

if (failures > 0) {
  console.log('ports-sides tests failed:', failures)
  process.exit(1)
}
console.log('all ports-sides tests passed')
// What a bigger label does to the drawing, and what two runs of the same source have to agree on.
//
// A snapshot cannot see either: it records one drawing at one size, and it would happily record a layout that overlapped its boxes or that moved
// between runs. These are the two properties a reader notices without measuring anything.
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

const boxesOf = (source) => render({ source }).canvas.shapes.filter((shape) => shape.kind === 'box')

const DRAWING = [
  'graph TD',
  '  a[Gateway] --> b[Auth service]',
  '  a --> c[Order service]',
  '  a --> d[Stock service]',
  '  c --> e[(Orders)]',
  '  d --> e',
].join('\n')

test('a longer label grows its box and pushes the next rank down by the difference', () => {
  // The spacing between ranks is a constant; what has to absorb a taller box is the position of everything below it, or the drawing overlaps.
  const small = boxesOf('graph TD\n  a[Short] --> b[Short]')
  const big = boxesOf('graph TD\n  a[A considerably longer label for the first node] --> b[A considerably longer label for the second node]')
  if (big[0].height <= small[0].height) throw new Error('the label did not make the box taller: ' + String(big[0].height) + ' against ' + String(small[0].height))
  const smallGap = small[1].y - (small[0].y + small[0].height)
  const bigGap = big[1].y - (big[0].y + big[0].height)
  if (Math.abs(smallGap - bigGap) > 0.01) throw new Error('the gap between ranks changed with the label: ' + String(smallGap) + ' against ' + String(bigGap))
  if (big[1].y <= big[0].y + big[0].height) throw new Error('the second box starts before the first ends')
})

test('no two boxes in a drawing overlap', () => {
  const boxes = boxesOf(DRAWING)
  if (boxes.length < 4) throw new Error('the drawing lost its boxes: ' + String(boxes.length))
  const overlaps = []
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]
      const b = boxes[j]
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
        overlaps.push(a.label + ' / ' + b.label)
      }
    }
  }
  if (overlaps.length > 0) throw new Error('overlapping boxes: ' + overlaps.join(', '))
})

test('the same source renders byte-identically twice', () => {
  // A layout that reads a set or a clock leaks that into the markup, and every snapshot of it would drift.
  const first = render({ source: DRAWING }).markup
  const second = render({ source: DRAWING }).markup
  if (first !== second) throw new Error('two runs of one source produced different markup')
  if (first.length === 0) throw new Error('the markup is empty')
})

test('the drawing keeps every shape it was asked to draw', () => {
  // `dropped` is the count the SVG writer reports for shapes it had no case for; a non-zero value is a silently missing part of the picture.
  const out = render({ source: DRAWING })
  if (out.dropped !== 0) throw new Error('shapes were dropped: ' + String(out.dropped))
  if (out.refused.length > 0) throw new Error('lines were refused: ' + out.refused.join(' | ').slice(0, 100))
})

if (failures > 0) {
  console.log('layout-growth tests failed:', failures)
  process.exit(1)
}
console.log('all layout-growth tests passed')
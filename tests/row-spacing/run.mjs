// Two boxes in one rank: how far apart they sit, and what a wider neighbour does to that.
//
// A drawing where two boxes touch reads as one box with a line through it, and no snapshot reports that as wrong - the shapes and the links are all
// there. So the gap is measured, and the case that matters is the second one: widening a box has to move its neighbour rather than eat the gap.
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

/** The two boxes of the second rank, left to right. */
const rowOf = (source) => {
  const boxes = boxesOf(source)
  const row = boxes[1]
  const pair = boxes.filter((box) => Math.abs(box.y - row.y) < 12)
  if (pair.length !== 2) throw new Error('the second rank holds ' + String(pair.length) + ' boxes')
  return pair.sort((a, b) => a.x - b.x)
}

const NARROW = 'graph TD\n  r[Root] --> a[A]\n  r --> b[B]'
const WIDE = 'graph TD\n  r[Root] --> a[A label that is quite a lot longer than the other one]\n  r --> b[B]'

test('two boxes in one rank keep a gap', () => {
  const [first, second] = rowOf(NARROW)
  const gap = second.x - (first.x + first.width)
  if (gap < 1) throw new Error('the boxes touch: ' + String(gap))
})

test('widening one box moves its neighbour instead of eating the gap', () => {
  // The property a snapshot cannot see: the gap is the same in both drawings, and the neighbour has moved by exactly the width that was added.
  const [narrowFirst, narrowSecond] = rowOf(NARROW)
  const [wideFirst, wideSecond] = rowOf(WIDE)
  const narrowGap = narrowSecond.x - (narrowFirst.x + narrowFirst.width)
  const wideGap = wideSecond.x - (wideFirst.x + wideFirst.width)
  if (Math.abs(narrowGap - wideGap) > 0.01) throw new Error('the gap changed: ' + String(narrowGap) + ' against ' + String(wideGap))
  const grew = wideFirst.width - narrowFirst.width
  const moved = wideSecond.x - narrowSecond.x
  if (grew <= 0) throw new Error('the label did not widen the box')
  if (Math.abs(moved - grew) > 0.5) throw new Error('the neighbour moved ' + String(moved) + ' for ' + String(grew) + ' of width')
})

test('a short box in a rank with a tall one is centred, not top-aligned', () => {
  const [, tall] = rowOf(WIDE)
  const boxes = boxesOf(WIDE)
  const short = boxes.find((box) => box.label === 'B')
  if (short === undefined) throw new Error('the short box is missing')
  const tallCentre = tall.y + tall.height / 2
  const shortCentre = short.y + short.height / 2
  if (Math.abs(tallCentre - shortCentre) > 1) throw new Error('centres: ' + String(tallCentre) + ' and ' + String(shortCentre))
})

if (failures > 0) {
  console.log('row-spacing tests failed:', failures)
  process.exit(1)
}
console.log('all row-spacing tests passed')
// The two decompositions, asserted on their own terms: a graph splits into its weakly connected pieces, and a pile
// of rectangles becomes a page close to the shape a screen has.
//
// Packing is the part worth pinning to a measurement rather than to an impression: two tall components side by side
// must come out closer to the page aspect than the single column they would form if they were merely stacked.
import { aspectOf, packRectangles, weakComponents } from '../../lib/render/components.js'

let failures = 0
const test = (name, body) => {
  try {
    body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', String(error.message).slice(0, 240))
  }
}

test('a drawing splits into the pieces that share no edge', () => {
  const components = weakComponents(
    ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })),
    [
      { from: 'a', to: 'b' },
      { from: 'd', to: 'e' },
    ],
  )
  if (JSON.stringify(components) !== JSON.stringify([['a', 'b'], ['c'], ['d', 'e']])) throw new Error('components: ' + JSON.stringify(components))
})

test('an isolated node is a component of its own, not noise', () => {
  const components = weakComponents([{ id: 'a' }, { id: 'b' }], [])
  if (components.length !== 2) throw new Error('components: ' + JSON.stringify(components))
})

test('an edge to a node the drawing does not have joins nothing', () => {
  const components = weakComponents([{ id: 'a' }, { id: 'b' }], [{ from: 'a', to: 'ghost' }])
  if (JSON.stringify(components) !== JSON.stringify([['a'], ['b']])) throw new Error('components: ' + JSON.stringify(components))
})

test('a self loop does not split its node off', () => {
  const components = weakComponents([{ id: 'a' }], [{ from: 'a', to: 'a' }])
  if (JSON.stringify(components) !== JSON.stringify([['a']])) throw new Error('components: ' + JSON.stringify(components))
})

test('packing nothing is an empty page', () => {
  const packed = packRectangles([])
  if (packed.placements.length !== 0 || packed.width !== 0 || packed.height !== 0) throw new Error('an empty pile became a page')
})

test('one rectangle stands at the origin', () => {
  const packed = packRectangles([{ width: 100, height: 60 }])
  if (packed.placements.length !== 1) throw new Error('placements: ' + String(packed.placements.length))
  if (packed.placements[0].x !== 0 || packed.placements[0].y !== 0) throw new Error('the rectangle moved: ' + JSON.stringify(packed.placements[0]))
  if (packed.width !== 100 || packed.height !== 60) throw new Error('bounds: ' + JSON.stringify(packed))
})

test('two tall components stand side by side instead of forming one column', () => {
  // Stacking them gives 100 x 630 (aspect 6.3); the page is 1.6, so the packer has to put them next to each other.
  const packed = packRectangles([
    { width: 100, height: 300 },
    { width: 100, height: 300 },
  ])
  const [first, second] = packed.placements
  if (first.y !== second.y) throw new Error('the two components were stacked: ' + JSON.stringify(packed.placements))
  if (first.x === second.x) throw new Error('the two components occupy the same column')
  const packedAspect = aspectOf(packed.width, packed.height)
  const columnAspect = aspectOf(100, 630)
  if (Math.abs(Math.log(packedAspect / 1.6)) >= Math.abs(Math.log(columnAspect / 1.6))) {
    throw new Error('packing is no closer to the page than a column: ' + String(packedAspect))
  }
})

test('packed rectangles never overlap and keep the gap', () => {
  const packed = packRectangles([
    { width: 100, height: 300 },
    { width: 120, height: 200 },
    { width: 80, height: 80 },
    { width: 140, height: 140 },
  ])
  for (let left = 0; left < packed.placements.length; left += 1) {
    const a = packed.placements[left]
    if (a.x + a.width > packed.width + 0.5 || a.y + a.height > packed.height + 0.5) throw new Error('a rectangle left the page')
    for (let right = left + 1; right < packed.placements.length; right += 1) {
      const b = packed.placements[right]
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
      if (!apart) throw new Error('two rectangles overlap: ' + JSON.stringify(a) + ' ' + JSON.stringify(b))
    }
  }
})

test('an empty box has a defined aspect rather than a division by zero', () => {
  if (aspectOf(0, 0) !== 1) throw new Error('aspect: ' + String(aspectOf(0, 0)))
})

if (failures > 0) {
  console.log(String.fromCharCode(10) + 'component tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all component tests passed')

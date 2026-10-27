// Coordinate assignment. Its contract is four properties, and each one has a case here:
//
//   (a) a box sits at the mean of its neighbours' centres where that does not force an overlap,
//   (b) a long edge's dummies share one x - one lane, one variable,
//   (c) two boxes in a layer never overlap,
//   (d) two layers are separated by the same gap.
//
// There is a fifth that the drawing depends on and that is easy to lose: a lane must not run through a box in a
// layer it crosses, because the edge is drawn straight down that lane. The last case is the graph that found this
// defect while the module was being written.
import { assignCoordinates } from '../../lib/render/coords.js'
import { breakCycles } from '../../lib/render/cycle-break.js'
import { addDummies } from '../../lib/render/dummy.js'
import { layer } from '../../lib/render/layer.js'
import { order } from '../../lib/render/order.js'

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

const WIDTH = 80
const HEIGHT = 20
const GAP = 20
const LAYER_GAP = 40

const coordinatesFor = (ids, pairs) => {
  const parsed = {
    nodes: ids.map((id) => ({ id, width: WIDTH, height: HEIGHT })),
    edges: pairs.map(([from, to], index) => ({ index, from, to })),
  }
  const broken = breakCycles(parsed)
  const layering = layer(parsed, broken.edges)
  const augmented = addDummies(layering, broken.edges)
  const ordered = order(augmented.layers, augmented.chains)
  const sizes = new Map(ids.map((id) => [id, { width: WIDTH, height: HEIGHT }]))
  const coordinates = assignCoordinates(
    {
      layers: ordered.layers,
      chains: augmented.chains,
      sizeOf: (id) => sizes.get(id) ?? { width: 0, height: 0 },
      chainOf: augmented.chainOf,
    },
    { gap: GAP, layerGap: LAYER_GAP },
  )
  return { coordinates, augmented, ordered, layering }
}

const boxOf = (id, x) => ({ id, x, width: WIDTH })

test('a box with one parent sits under it, and two of them straddle it evenly', () => {
  const { coordinates } = coordinatesFor(['a', 'b', 'c'], [['a', 'b'], ['a', 'c']])
  const a = coordinates.x.get('a')
  const b = coordinates.x.get('b')
  const c = coordinates.x.get('c')
  if (a === undefined || b === undefined || c === undefined) throw new Error('a box has no x')
  if (Math.abs(b - a - (a - c)) > 1) throw new Error('not centred on the parent: ' + String(b) + ', ' + String(a) + ', ' + String(c))
  if (Math.min(b, c) > a || Math.max(b, c) < a) throw new Error('both children are on one side of the parent')
})

test('a long edge keeps one lane, not one x per layer', () => {
  const { coordinates, augmented } = coordinatesFor(
    ['a', 'b', 'c', 'd', 'e'],
    [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['a', 'e']],
  )
  const chain = augmented.chains.find((entry) => entry.path.length > 2)
  if (chain === undefined) throw new Error('the graph produced no long edge')
  const instances = chain.path.filter((id) => augmented.chainOf.has(id))
  if (instances.length === 0) throw new Error('the long edge has no dummies')
  const lane = augmented.chainOf.get(instances[0])
  if (lane === undefined || coordinates.x.get(lane) === undefined) throw new Error('the lane has no x')
  for (const instance of instances) {
    if (coordinates.x.has(instance)) throw new Error('a dummy instance got an x of its own: ' + instance)
  }
})

test('two boxes in a layer never overlap', () => {
  const { coordinates, augmented } = coordinatesFor(
    ['a', 'b', 'c', 'd', 'e'],
    [['a', 'b'], ['a', 'c'], ['a', 'd'], ['a', 'e']],
  )
  for (const row of augmented.layers) {
    const boxes = row
      .filter((id) => !augmented.chainOf.has(id))
      .map((id) => boxOf(id, coordinates.x.get(id)))
      .sort((left, right) => left.x - right.x)
    for (let index = 1; index < boxes.length; index += 1) {
      const space = boxes[index].x - boxes[index - 1].x - WIDTH
      if (space < GAP - 0.5) throw new Error('two boxes overlap: ' + String(space) + ' < ' + String(GAP))
    }
  }
})

test('two layers are separated by the same gap', () => {
  const { coordinates } = coordinatesFor(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']])
  for (let index = 1; index < coordinates.layerY.length; index += 1) {
    const gap = coordinates.layerY[index] - coordinates.layerY[index - 1] - coordinates.layerHeight[index - 1]
    if (Math.abs(gap - LAYER_GAP) > 0.5) throw new Error('layer gap ' + String(index) + ' is ' + String(gap))
  }
})

test('a lane never runs through a box in a layer it crosses', () => {
  // a fans out to b, c and e; b and c meet at d; e points back at b. The long edges reserve lanes through the
  // middle row, and the row must keep its boxes clear of them.
  const { coordinates, augmented } = coordinatesFor(
    ['a', 'b', 'c', 'd', 'e'],
    [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['d', 'e'], ['e', 'b'], ['a', 'e']],
  )
  augmented.layers.forEach((row, depth) => {
    const lanes = row
      .filter((id) => augmented.chainOf.has(id))
      .map((id) => coordinates.x.get(augmented.chainOf.get(id)))
    if (lanes.length === 0) return
    for (const id of row) {
      if (augmented.chainOf.has(id)) continue
      const centre = coordinates.x.get(id)
      if (centre === undefined) continue
      for (const lane of lanes) {
        if (lane === undefined) throw new Error('a lane has no x')
        if (lane > centre - WIDTH / 2 && lane < centre + WIDTH / 2) {
          throw new Error('the lane at ' + String(lane) + ' runs through "' + id + '" in layer ' + String(depth))
        }
      }
    }
  })
})

test('the reported width and height cover every box', () => {
  const { coordinates } = coordinatesFor(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']])
  let right = 0
  for (const [, value] of coordinates.x) right = Math.max(right, value + WIDTH / 2)
  if (coordinates.width < right - 0.5) throw new Error('width ' + String(coordinates.width) + ' < ' + String(right))
  const bottom = coordinates.layerY[coordinates.layerY.length - 1] + coordinates.layerHeight[coordinates.layerHeight.length - 1]
  if (coordinates.height !== bottom) throw new Error('height: ' + String(coordinates.height) + ' vs ' + String(bottom))
})

if (failures > 0) {
  console.log(String.fromCharCode(10) + 'coordinate tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all coordinate tests passed')

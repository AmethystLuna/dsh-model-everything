// Coordinate assignment. Its contract is four properties, and each one has a case here:
//
//   (a) a box sits over what it is connected to, and a parent with two children is centred over them,
//   (b) a long edge's dummies share one x - one lane, one variable,
//   (c) two boxes in a layer never overlap, and the order the ordering settled is the order on the page,
//   (d) two layers are separated by the same gap.
//
// The method is Brandes-Kopf: four passes (down and up, each read left to right and right to left), aligned into
// blocks and averaged. That is why the cases below are written as *shapes* rather than as numbers - the four passes
// only agree on a shape that is symmetric, and the average is what has to be centred.
//
// A fifth property used to live here: a lane must not run through a box in a layer it crosses. A lane is a routing
// artifact, and this module no longer places one - it proposes an x, and `channels.ts` moves the lane into a corridor
// that is free. The case moved with the property, to `tests/channels`.
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

const coordinatesFor = (ids, pairs, sizes) => {
  const parsed = {
    nodes: ids.map((id) => ({ id, width: sizes?.get(id)?.width ?? WIDTH, height: sizes?.get(id)?.height ?? HEIGHT })),
    edges: pairs.map(([from, to], index) => ({ index, from, to })),
  }
  const broken = breakCycles(parsed)
  const layering = layer(parsed, broken.edges)
  const augmented = addDummies(layering, broken.edges)
  const ordered = order(augmented.layers, augmented.chains)
  const sizeOf = (id) => sizes?.get(id) ?? { width: WIDTH, height: HEIGHT }
  const coordinates = assignCoordinates(
    {
      layers: ordered.layers,
      chains: augmented.chains,
      sizeOf,
      chainOf: augmented.chainOf,
    },
    { gap: GAP, layerGap: LAYER_GAP },
  )
  return { coordinates, augmented, ordered, layering, sizeOf }
}

const boxOf = (id, x, width = WIDTH) => ({ id, x, width })

/** Every pair of boxes in a row is apart by the gap, in the order the ordering gave them. */
const assertApart = (coordinates, augmented, sizeOf) => {
  for (const row of augmented.layers) {
    const boxes = row
      .filter((id) => !augmented.chainOf.has(id))
      .map((id) => boxOf(id, coordinates.x.get(id), sizeOf(id).width))
      .sort((left, right) => left.x - right.x)
    for (let index = 1; index < boxes.length; index += 1) {
      const space = boxes[index].x - boxes[index - 1].x - (boxes[index].width + boxes[index - 1].width) / 2
      if (space < GAP - 0.5) throw new Error('two boxes overlap: ' + String(space) + ' < ' + String(GAP) + ' (' + boxes[index - 1].id + '/' + boxes[index].id + ')')
    }
  }
}

test('a box with one parent sits under it, and two of them straddle it evenly', () => {
  const { coordinates } = coordinatesFor(['a', 'b', 'c'], [['a', 'b'], ['a', 'c']])
  const a = coordinates.x.get('a')
  const b = coordinates.x.get('b')
  const c = coordinates.x.get('c')
  if (a === undefined || b === undefined || c === undefined) throw new Error('a box has no x')
  if (Math.abs(b - a - (a - c)) > 1) throw new Error('not centred on the parent: ' + String(b) + ', ' + String(a) + ', ' + String(c))
  if (Math.min(b, c) > a || Math.max(b, c) < a) throw new Error('both children are on one side of the parent')
})

test('a box hangs straight under its only parent, row after row', () => {
  // A chain is the shape the vertical alignment exists for: every box has one neighbour, and the four passes agree, so
  // the column is one x. This is the property that makes a state-machine chain read as a line rather than a staircase.
  const { coordinates } = coordinatesFor(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'd']])
  const line = ['a', 'b', 'c', 'd'].map((id) => coordinates.x.get(id))
  for (const value of line) if (value === undefined) throw new Error('a box has no x')
  for (const value of line) if (Math.abs(value - line[0]) > 0.5) throw new Error('the column is not straight: ' + JSON.stringify(line))
})

test('a parent with two children stays centred when a long edge crosses its row', () => {
  // The shape that motivated the rule that a lane is not a neighbour: `a` points at `b`, `b` at `c` and `d`, and
  // `a -> d` spans a row, so a lane runs through the row `b` sits in. `b` has to stay over the middle of `c` and `d`
  // and `a` has to stay over `b`; a lane that pulled either of them aside would draw the decision as a staircase.
  const { coordinates, augmented } = coordinatesFor(
    ['a', 'b', 'c', 'd'],
    [
      ['a', 'b'],
      ['b', 'c'],
      ['b', 'd'],
      ['d', 'a'],
    ],
  )
  const a = coordinates.x.get('a')
  const b = coordinates.x.get('b')
  const c = coordinates.x.get('c')
  const d = coordinates.x.get('d')
  if (a === undefined || b === undefined || c === undefined || d === undefined) throw new Error('a box has no x')
  if (Math.abs(b - (c + d) / 2) > 1) throw new Error('the parent is not centred over its children: ' + String(b) + ' vs ' + String((c + d) / 2))
  if (Math.abs(a - b) > 1) throw new Error('the parent is not under its own parent: ' + String(a) + ' vs ' + String(b))
  if (Math.min(c, d) > b || Math.max(c, d) < b) throw new Error('both children are on one side of the parent')
  // The long edge does keep one lane, and the lane is the only place its placeholders are written.
  const chain = augmented.chains.find((entry) => entry.path.length > 2)
  if (chain === undefined) throw new Error('the graph produced no long edge')
  const instances = chain.path.filter((id) => augmented.chainOf.has(id))
  const lane = augmented.chainOf.get(instances[0])
  if (lane === undefined || coordinates.x.get(lane) === undefined) throw new Error('the lane has no x')
  for (const instance of instances) if (coordinates.x.has(instance)) throw new Error('a dummy instance got an x of its own: ' + instance)
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
  const { coordinates, augmented, sizeOf } = coordinatesFor(
    ['a', 'b', 'c', 'd', 'e'],
    [['a', 'b'], ['a', 'c'], ['a', 'd'], ['a', 'e']],
  )
  assertApart(coordinates, augmented, sizeOf)
})

test('rows of mixed widths keep their order and the gap', () => {
  // Text decides the width, so a row of real boxes is rarely one width. The compaction can only hold if the blocks
  // clear each other by the half widths they actually have.
  const sizes = new Map([
    ['a', { width: 120, height: 20 }],
    ['b', { width: 40, height: 20 }],
    ['c', { width: 88, height: 20 }],
    ['d', { width: 60, height: 20 }],
    ['e', { width: 100, height: 20 }],
    ['f', { width: 52, height: 20 }],
  ])
  const { coordinates, augmented } = coordinatesFor(
    ['a', 'b', 'c', 'd', 'e', 'f'],
    [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'e'], ['d', 'f'], ['e', 'f']],
    sizes,
  )
  assertApart(coordinates, augmented, (id) => sizes.get(id))
  for (const row of augmented.layers) {
    const boxes = row.filter((id) => !augmented.chainOf.has(id))
    for (let index = 1; index < boxes.length; index += 1) {
      if ((coordinates.x.get(boxes[index]) ?? 0) < (coordinates.x.get(boxes[index - 1]) ?? 0) - 0.5) {
        throw new Error('the row changed its order: ' + boxes[index - 1] + ' is left of ' + boxes[index])
      }
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

test('the layer gap stays exact when the rows are different heights', () => {
  const sizes = new Map([
    ['a', { width: 80, height: 46 }],
    ['b', { width: 80, height: 20 }],
    ['c', { width: 80, height: 74 }],
  ])
  const { coordinates } = coordinatesFor(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']], sizes)
  if (JSON.stringify(coordinates.layerHeight) !== JSON.stringify([46, 20, 74])) {
    throw new Error('the row heights are not the tallest box in each: ' + JSON.stringify(coordinates.layerHeight))
  }
  for (let index = 1; index < coordinates.layerY.length; index += 1) {
    const gap = coordinates.layerY[index] - coordinates.layerY[index - 1] - coordinates.layerHeight[index - 1]
    if (Math.abs(gap - LAYER_GAP) > 0.5) throw new Error('layer gap ' + String(index) + ' is ' + String(gap))
  }
})

test('the reported width and height cover every box', () => {
  const { coordinates } = coordinatesFor(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']])
  let right = 0
  for (const [id, value] of coordinates.x) right = Math.max(right, value + (id.startsWith('#') ? 0 : WIDTH) / 2)
  if (coordinates.width < right - 0.5) throw new Error('width ' + String(coordinates.width) + ' < ' + String(right))
  const bottom = coordinates.layerY[coordinates.layerY.length - 1] + coordinates.layerHeight[coordinates.layerHeight.length - 1]
  if (coordinates.height !== bottom) throw new Error('height: ' + String(coordinates.height) + ' vs ' + String(bottom))
})

test('an empty drawing has no coordinates rather than a broken one', () => {
  const coordinates = assignCoordinates({ layers: [], chains: [], sizeOf: () => ({ width: WIDTH, height: HEIGHT }), chainOf: new Map() }, { gap: GAP, layerGap: LAYER_GAP })
  if (coordinates.x.size !== 0) throw new Error('an empty drawing produced coordinates')
  if (coordinates.width !== 0 || coordinates.height !== 0) throw new Error('an empty drawing has a size: ' + String(coordinates.width) + 'x' + String(coordinates.height))
})

if (failures > 0) {
  console.log(String.fromCharCode(10) + 'coordinate tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all coordinate tests passed')

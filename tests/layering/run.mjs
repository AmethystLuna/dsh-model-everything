// The layering stage and the dummy nodes it makes room for.
//
// What a layered drawing needs from this stage is a promise about every edge: it spans at least one layer, so it
// always travels downwards, and it is shortened to one layer whenever a tight tree allows it. The cases below check
// the promise on the shapes that break naive versions of it - a diamond, a dangling source far from its only
// successor, a cycle that had to be broken first, and the initial state that must not move.
//
// Dummy insertion is asserted next door to it because the two are one decision: a span decides how many
// placeholders an edge needs, and a drawing with the wrong number of them has a lane through a box.
import { breakCycles } from '../../lib/render/cycle-break.js'
import { addDummies } from '../../lib/render/dummy.js'
import { layer } from '../../lib/render/layer.js'

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

const graph = (ids, pairs, init) => ({
  nodes: ids.map((id) => ({ id, width: 80, height: 30 })),
  edges: pairs.map(([from, to], index) => ({ index, from, to })),
  ...(init === undefined ? {} : { init }),
})

/** Break first: the layering stage is only defined on a DAG. */
const pipeline = (ids, pairs, init) => {
  const parsed = graph(ids, pairs, init)
  const broken = breakCycles(parsed)
  return { graph: { ...parsed, edges: broken.edges }, broken, layering: layer(parsed, broken.edges) }
}

test('a chain is one row per box', () => {
  const { layering } = pipeline(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']])
  if (JSON.stringify(layering.layers) !== JSON.stringify([['a'], ['b'], ['c']])) throw new Error('layers: ' + JSON.stringify(layering.layers))
})

test('a diamond puts both middle boxes on one layer', () => {
  const { layering } = pipeline(['a', 'b', 'c', 'd'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']])
  if (layering.layerOf.get('a') !== 0) throw new Error('a: ' + String(layering.layerOf.get('a')))
  if (layering.layerOf.get('b') !== 1 || layering.layerOf.get('c') !== 1) throw new Error('b/c: ' + JSON.stringify(layering.layers))
  if (layering.layerOf.get('d') !== 2) throw new Error('d: ' + String(layering.layerOf.get('d')))
})

test('every edge spans at least one layer', () => {
  const { layering } = pipeline(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['a', 'c']])
  for (const [from, to] of [['a', 'b'], ['b', 'c'], ['a', 'c']]) {
    const top = layering.layerOf.get(from)
    const bottom = layering.layerOf.get(to)
    if (top === undefined || bottom === undefined) throw new Error('an endpoint was not layered')
    if (bottom - top < 1) throw new Error('edge ' + from + ' -> ' + to + ' spans ' + String(bottom - top))
  }
})

test('a free source is pulled down until one of its edges is tight', () => {
  // p -> q -> r is a two-step path; s points straight at r. Longest paths alone leave s in row zero with a
  // three-layer edge; the tight-tree pass puts it in row one, where s -> r spans exactly one layer.
  const { layering } = pipeline(['p', 'q', 'r', 's'], [['p', 'q'], ['q', 'r'], ['s', 'r']])
  if (layering.layerOf.get('p') !== 0) throw new Error('p: ' + String(layering.layerOf.get('p')))
  if (layering.layerOf.get('q') !== 1) throw new Error('q: ' + String(layering.layerOf.get('q')))
  if (layering.layerOf.get('r') !== 2) throw new Error('r: ' + String(layering.layerOf.get('r')))
  if (layering.layerOf.get('s') !== 1) throw new Error('the free source was not shortened: ' + String(layering.layerOf.get('s')))
})

test('the initial state stays on layer zero after a cycle was broken', () => {
  const { layering } = pipeline(['i', 'a', 'b'], [['i', 'a'], ['a', 'b'], ['b', 'i']], 'i')
  if (layering.layerOf.get('i') !== 0) throw new Error('the initial state moved to ' + String(layering.layerOf.get('i')))
  if (layering.layerOf.get('a') !== 1 || layering.layerOf.get('b') !== 2) throw new Error('layers: ' + JSON.stringify(layering.layers))
})

test('a self loop does not make its box unreachable', () => {
  const { layering } = pipeline(['a', 'b'], [['a', 'a'], ['a', 'b']])
  if (layering.layerOf.get('a') !== 0 || layering.layerOf.get('b') !== 1) throw new Error('layers: ' + JSON.stringify(layering.layers))
})

test('an edge to a state the graph does not have is ignored by the layering', () => {
  const { layering } = pipeline(['a'], [['a', 'ghost']])
  if (JSON.stringify(layering.layers) !== JSON.stringify([['a']])) throw new Error('layers: ' + JSON.stringify(layering.layers))
})

test('a long edge gets one dummy per layer it crosses, and no more', () => {
  // a -> b -> c -> d -> e with a -> e: the long edge crosses layers 1, 2 and 3, so it needs three placeholders.
  const { graph: parsed, broken, layering } = pipeline(
    ['a', 'b', 'c', 'd', 'e'],
    [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['a', 'e']],
  )
  const augmented = addDummies(layering, broken.edges)
  const chain = augmented.chains.find((entry) => entry.index === 4)
  if (chain === undefined) throw new Error('the long edge has no chain')
  if (chain.path.length !== 5) throw new Error('chain: ' + JSON.stringify(chain.path))
  if (chain.path[0] !== 'a' || chain.path[chain.path.length - 1] !== 'e') throw new Error('chain ends: ' + JSON.stringify(chain.path))
  for (const layerIndex of [1, 2, 3]) {
    const dummies = augmented.layers[layerIndex].filter((id) => augmented.chainOf.has(id))
    if (dummies.length !== 1) throw new Error('layer ' + String(layerIndex) + ' holds ' + String(dummies.length) + ' dummies')
  }
  const lane = augmented.laneOf.get(4)
  if (lane === undefined) throw new Error('the long edge has no lane')
  for (const id of chain.path) {
    if (id === 'a' || id === 'e') continue
    if (augmented.chainOf.get(id) !== lane) throw new Error('a dummy belongs to another lane')
  }
  void parsed
})

test('an edge that spans one layer needs no dummy', () => {
  const { broken, layering } = pipeline(['a', 'b'], [['a', 'b']])
  const augmented = addDummies(layering, broken.edges)
  const chain = augmented.chains[0]
  if (chain.path.length !== 2) throw new Error('chain: ' + JSON.stringify(chain.path))
  if (augmented.laneOf.size !== 0) throw new Error('a short edge claimed a lane')
})

test('a self loop is a chain of its own and needs no dummy', () => {
  const { broken, layering } = pipeline(['a', 'b'], [['a', 'a'], ['a', 'b']])
  const augmented = addDummies(layering, broken.edges)
  const loop = augmented.chains.find((entry) => entry.index === 0)
  if (loop === undefined || loop.path.length !== 2) throw new Error('the self loop is not its own chain')
})

if (failures > 0) {
  console.log(String.fromCharCode(10) + 'layering tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all layering tests passed')

// The layering stage and the dummy nodes it makes room for.
//
// What a layered drawing needs from this stage is a promise about every edge: it spans at least one layer, so it
// always travels downwards, and it is shortened to one layer whenever a tight tree allows it. The cases below check
// the promise on the shapes that break naive versions of it - a diamond, a dangling source far from its only
// successor, a cycle that had to be broken first, and the initial state that must not move.
//
// The second half is about *length*: the stage solves the layer-assignment program exactly, so its answer has to be
// the best one, and the way to say "the best one" without trusting the solver is to search every ranking of a small
// graph and compare. A wrong cut-value sign or a missed exchange shows up there and nowhere else: the drawing still
// looks plausible, it is just a layer longer than it had to be.
//
// Dummy insertion is asserted next door to it because the two are one decision: a span decides how many
// placeholders an edge needs, and a drawing with the wrong number of them has a lane through a box.
import { breakCycles } from '../../lib/render/cycle-break.js'
import { addDummies } from '../../lib/render/dummy.js'
import { layer } from '../../lib/render/layer.js'
import { minimumLength } from '../../lib/render/network-simplex.js'

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

/** The layers every edge spans beyond the one it has to: what the ranking program minimises. */
const totalSlack = (layering, edges) => {
  let total = 0
  for (const edge of edges) {
    const top = layering.layerOf.get(edge.from)
    const bottom = layering.layerOf.get(edge.to)
    if (top === undefined || bottom === undefined) throw new Error('an endpoint was not layered')
    if (bottom - top < 1) throw new Error('edge ' + edge.from + ' -> ' + edge.to + ' spans ' + String(bottom - top))
    total += bottom - top - 1
  }
  return total
}

/**
 * The smallest total span any ranking of this graph can have, by searching them all.
 *
 * A ranking never needs a layer past the node count, so the search box is `count` layers wide and holds the optimum.
 */
const shortestPossible = (ids, edges) => {
  const rank = new Array(ids.length).fill(0)
  const links = edges.map((edge) => [ids.indexOf(edge.from), ids.indexOf(edge.to)])
  let best = Infinity
  const walk = (at) => {
    if (at === ids.length) {
      let total = 0
      for (const [from, to] of links) {
        const span = rank[to] - rank[from]
        if (span < 1) return
        total += span - 1
      }
      if (total < best) best = total
      return
    }
    for (let depth = 0; depth < ids.length; depth += 1) {
      rank[at] = depth
      walk(at + 1)
    }
  }
  walk(0)
  return best
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

test('a node with more edges leaving than entering moves down until one of them is tight', () => {
  // `check` is reached from `start` and points at `ship` and `fix`, which are pinned below `review` by the two edges
  // `review` sends them. Longest paths leave `check` on row one with two edges spanning two layers; the shortest
  // ranking puts it on row two, where they span one. Nothing else can move: every other node is already tight.
  const ids = ['start', 'plan', 'review', 'check', 'ship', 'fix']
  const pairs = [
    ['start', 'plan'],
    ['plan', 'review'],
    ['start', 'check'],
    ['check', 'ship'],
    ['check', 'fix'],
    ['review', 'ship'],
    ['review', 'fix'],
  ]
  const { broken, layering } = pipeline(ids, pairs)
  if (layering.layerOf.get('check') !== 2) throw new Error('check stayed on row ' + String(layering.layerOf.get('check')))
  const slack = totalSlack(layering, broken.edges)
  if (slack !== 1) throw new Error('total slack ' + String(slack) + ', wanted 1')
  const possible = shortestPossible(ids, broken.edges)
  if (slack !== possible) throw new Error('the stage left ' + String(slack) + ' where ' + String(possible) + ' is possible')
})

test('the length of the layering is the minimum over every ranking, on the shapes that test it', () => {
  // One case per shape the program is easy to get wrong: a chain, a diamond, the unshortened source, the node that
  // has to move down, two sources with an edge into the same box, and a graph whose cycle had to be broken first.
  const shapes = [
    { ids: ['a', 'b', 'c'], pairs: [['a', 'b'], ['b', 'c']] },
    { ids: ['a', 'b', 'c', 'd'], pairs: [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd']] },
    { ids: ['p', 'q', 'r', 's'], pairs: [['p', 'q'], ['q', 'r'], ['s', 'r']] },
    {
      ids: ['start', 'plan', 'review', 'check', 'ship', 'fix'],
      pairs: [
        ['start', 'plan'],
        ['plan', 'review'],
        ['start', 'check'],
        ['check', 'ship'],
        ['check', 'fix'],
        ['review', 'ship'],
        ['review', 'fix'],
      ],
    },
    { ids: ['a', 'b', 'c', 'd', 'e'], pairs: [['a', 'b'], ['b', 'c'], ['d', 'c'], ['c', 'e'], ['a', 'e']] },
    { ids: ['i', 'a', 'b'], pairs: [['i', 'a'], ['a', 'b'], ['b', 'i']], init: 'i' },
  ]
  for (const shape of shapes) {
    const { broken, layering } = pipeline(shape.ids, shape.pairs, shape.init)
    const slack = totalSlack(layering, broken.edges)
    const possible = shortestPossible(shape.ids, broken.edges)
    if (slack !== possible) {
      throw new Error(JSON.stringify(shape.pairs) + ' left ' + String(slack) + ' where ' + String(possible) + ' is possible')
    }
    // The rows are the drawing's rows: no empty layer above the last box, and every box in one.
    for (const [depth, row] of layering.layers.entries()) {
      if (row.length === 0) throw new Error('layer ' + String(depth) + ' is empty')
    }
    if (layering.layers[0].length === 0) throw new Error('the drawing starts with an empty row')
    if (layering.layers.flat().length !== shape.ids.length) throw new Error('a box was layered twice or not at all')
  }
})

test('the initial state stays on layer zero even when the shortest ranking would put it lower', () => {
  // `i` points at `x`, and `a -> b -> x` reaches the same box from its own source. The free optimum puts `a` on row
  // zero and `i` on row one, because only the edge `i -> x` then has to stretch. The initial state is first by
  // definition, so the stage pays that layer and puts `i` on row zero.
  const { layering } = pipeline(['i', 'a', 'b', 'x'], [['i', 'x'], ['a', 'b'], ['b', 'x']], 'i')
  if (layering.layerOf.get('i') !== 0) throw new Error('the initial state is on row ' + String(layering.layerOf.get('i')))
  if (layering.layerOf.get('a') !== 0) throw new Error('the other source is on row ' + String(layering.layerOf.get('a')))
  if (layering.layerOf.get('x') !== 2) throw new Error('x is on row ' + String(layering.layerOf.get('x')))
})

test('an initial state something points at cannot be on the top row, and the stage says so', () => {
  // The pipeline breaks cycles first, so this cannot happen in a drawing: `breakCycles` turns every edge into the
  // initial state around. A caller that hands the stage itself a graph with an edge into the initial state is asking
  // for a ranking that keeps the predecessor above it and the state on row zero, and no ranking does both, so the pin
  // is dropped and the state lands where the edge puts it.
  const parsed = graph(['p', 'i', 'x'], [['p', 'i'], ['i', 'x']], 'i')
  const layering = layer(parsed, parsed.edges)
  if (layering.layerOf.get('p') !== 0) throw new Error('p is on row ' + String(layering.layerOf.get('p')))
  if (layering.layerOf.get('i') !== 1) throw new Error('i is on row ' + String(layering.layerOf.get('i')))
  if (layering.layerOf.get('x') !== 2) throw new Error('x is on row ' + String(layering.layerOf.get('x')))
})

test('a graph the pipeline has already made acyclic keeps every box', () => {
  // Two states pointing at each other: cycle breaking turns one around, and both boxes are still placed.
  const { layering } = pipeline(['a', 'b'], [['a', 'b'], ['b', 'a']])
  if (layering.layers.flat().length !== 2) throw new Error('a box was dropped: ' + JSON.stringify(layering.layers))
  if (layering.layerOf.get('a') === layering.layerOf.get('b')) throw new Error('both boxes stayed on one row')
})

test('an initial state the graph does not have pins nothing', () => {
  // `init` names a state the level does not draw, which a hand-written model can do. There is no box to pin, so the
  // layering is the ordinary one and nothing is left unplaced.
  const parsed = graph(['a', 'b'], [['a', 'b']], 'ghost')
  const layering = layer(parsed, parsed.edges)
  if (layering.layerOf.get('a') !== 0 || layering.layerOf.get('b') !== 1) throw new Error('layers: ' + JSON.stringify(layering.layers))
})

test('a box the model writes twice is one box, on one layer', () => {
  // A model is data: the same node may be listed twice. The layer must hold one box and the edge must not add a
  // second row for the copy.
  const parsed = graph(['a', 'a', 'b'], [['a', 'b']])
  const layering = layer(parsed, parsed.edges)
  if (JSON.stringify(layering.layers) !== JSON.stringify([['a'], ['b']])) throw new Error('layers: ' + JSON.stringify(layering.layers))
  if (layering.layerOf.get('a') !== 0 || layering.layerOf.get('b') !== 1) throw new Error('ranks: ' + JSON.stringify([...layering.layerOf]))
})

test('an edge the layering did not rank downwards gets no placeholders', () => {
  // A caller can hand the stage a graph that arrived cyclic: `layer` lays out what it can, and an edge that still
  // runs upwards (or names a box this level does not have) has no row to cross, so it needs no dummy.
  const layering = { layers: [['a'], ['b']], layerOf: new Map([['a', 1], ['b', 0]]) }
  const augmented = addDummies(layering, [
    { index: 0, from: 'a', to: 'b' },
    { index: 1, from: 'b', to: 'ghost' },
  ])
  if (augmented.layers.flat().join(',') !== 'a,b') throw new Error('a dummy was inserted: ' + JSON.stringify(augmented.layers))
  for (const chain of augmented.chains) if (chain.path.length !== 2) throw new Error('a chain got a placeholder: ' + JSON.stringify(chain))
  if (augmented.laneOf.size !== 0) throw new Error('a lane was claimed')
})

/** The objective the solver minimises: the weight of every layer an edge spans beyond its minimum. */
const totalLength = (rank, edges) => {
  let total = 0
  for (const edge of edges) {
    const slack = rank[edge.to] - rank[edge.from] - edge.minLength
    if (slack < 0) return Infinity
    total += slack * edge.weight
  }
  return total
}

/** The smallest total any ranking of this program can have, by trying every ranking in the only layers it needs. */
const shortestLength = (count, edges) => {
  const rank = new Array(count).fill(0)
  let best = Infinity
  const walk = (at) => {
    if (at === count) {
      const total = totalLength(rank, edges)
      if (total < best) best = total
      return
    }
    for (let depth = 0; depth < count; depth += 1) {
      rank[at] = depth
      walk(at + 1)
    }
  }
  walk(0)
  return best
}

test('the ranking solver reaches the optimum on the programs that make it exchange, not only on chains', () => {
  // One row per decision the exchange loop can take: a constraint edge pointing backwards (the tree has to slide
  // its outside nodes the other way), a zero-weight edge (no leaving bound to stop the slide), two negative cut
  // values (the worse one wins), an entering scan that has to skip an edge that is not a candidate, and a swap
  // whose head side is the tree edge's tail. Each is asserted against the optimum found by search, so the row says
  // the answer is the shortest one and not merely a feasible one.
  const programs = [
    {
      name: 'a backwards constraint edge',
      count: 3,
      start: [0, 1, 0],
      edges: [
        { from: 0, to: 1, minLength: 0, weight: 1 },
        { from: 2, to: 1, minLength: 1, weight: 1 },
      ],
    },
    {
      name: 'a zero-weight edge',
      count: 3,
      start: [0, 0, 1],
      edges: [
        { from: 0, to: 2, minLength: 1, weight: 0 },
        { from: 1, to: 2, minLength: 0, weight: 1 },
      ],
    },
    {
      name: 'two negative cuts',
      count: 4,
      start: [0, 1, 0, 0],
      edges: [
        { from: 0, to: 1, minLength: 1, weight: 1 },
        { from: 0, to: 2, minLength: 0, weight: 0 },
        { from: 2, to: 1, minLength: 1, weight: 1 },
        { from: 3, to: 1, minLength: 1, weight: 1 },
      ],
    },
    {
      name: 'an edge that is not a candidate',
      count: 5,
      start: [1, 0, 1, 1, 2],
      edges: [
        { from: 0, to: 4, minLength: 1, weight: 0 },
        { from: 1, to: 0, minLength: 1, weight: 1 },
        { from: 1, to: 2, minLength: 1, weight: 0 },
        { from: 1, to: 3, minLength: 1, weight: 1 },
        { from: 1, to: 4, minLength: 1, weight: 0 },
        { from: 2, to: 4, minLength: 1, weight: 1 },
      ],
    },
    {
      name: 'a swap on the head side',
      count: 4,
      start: [0, 1, 1, 0],
      edges: [
        { from: 0, to: 1, minLength: 1, weight: 1 },
        { from: 2, to: 1, minLength: 0, weight: 0 },
        { from: 3, to: 1, minLength: 1, weight: 1 },
        { from: 3, to: 2, minLength: 1, weight: 1 },
      ],
    },
    {
      name: 'a second negative cut value',
      count: 6,
      start: [0, 0, 1, 1, 0, 0],
      edges: [
        { from: 0, to: 1, minLength: 0, weight: 0 },
        { from: 0, to: 3, minLength: 1, weight: 1 },
        { from: 1, to: 2, minLength: 1, weight: 0 },
        { from: 1, to: 3, minLength: 1, weight: 0 },
        { from: 4, to: 2, minLength: 1, weight: 0 },
        { from: 4, to: 3, minLength: 1, weight: 1 },
        { from: 4, to: 5, minLength: 0, weight: 1 },
        { from: 5, to: 2, minLength: 1, weight: 0 },
      ],
    },
    {
      // Without the exchange loop this one comes out one layer longer than the optimum: the start ranking is
      // feasible but leaves the last edge stretched.
      name: 'a ranking the exchange loop has to shorten',
      count: 6,
      start: [0, 0, 1, 1, 2, 3],
      edges: [
        { from: 0, to: 2, minLength: 1, weight: 1 },
        { from: 0, to: 3, minLength: 1, weight: 1 },
        { from: 0, to: 4, minLength: 1, weight: 1 },
        { from: 1, to: 2, minLength: 1, weight: 1 },
        { from: 1, to: 4, minLength: 1, weight: 1 },
        { from: 2, to: 5, minLength: 1, weight: 1 },
        { from: 3, to: 4, minLength: 1, weight: 1 },
        { from: 4, to: 5, minLength: 1, weight: 1 },
      ],
    },
  ]
  for (const program of programs) {
    const rank = minimumLength({ count: program.count, edges: program.edges, start: program.start })
    const total = totalLength(rank, program.edges)
    if (!Number.isFinite(total)) throw new Error(program.name + ': the answer is not a feasible ranking: ' + JSON.stringify(rank))
    const possible = shortestLength(program.count, program.edges)
    if (total !== possible) throw new Error(program.name + ': total ' + String(total) + ' where ' + String(possible) + ' is possible: ' + JSON.stringify(rank))
  }
})

if (failures > 0) {
  console.log(String.fromCharCode(10) + 'layering tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all layering tests passed')

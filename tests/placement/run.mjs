// The composer: nesting, wrapping, lanes, and the page a drawing becomes.
//
// `place.ts` is the only module allowed to know the pipeline order, so what it is asserted on is the geometry a
// reader sees: a boundary contains its own contents and nothing else, a tall chain wraps into columns, a long edge
// reserves one lane, and an edge that crosses a wrapped column is read across rather than down.
import { place, placementAspect } from '../../lib/render/place.js'
import { planBands } from '../../lib/render/wrap.js'

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

const node = (id) => ({ id, role: 'normal' })
const chainOf = (count, label) => {
  const nodes = []
  const edges = []
  for (let index = 0; index < count; index += 1) nodes.push(node('n' + String(index)))
  for (let index = 0; index + 1 < count; index += 1) {
    edges.push({ from: 'n' + String(index), to: 'n' + String(index + 1), label: label === undefined ? '' : label })
  }
  return { kind: 'graph', title: 't', nodes, edges, caption: 'graph' }
}

const contains = (inner, outer) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5

test('a boundary contains its own contents and only its own', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [node('a'), node('b'), node('c')],
    edges: [
      { from: 'a', to: 'b', label: '' },
      { from: 'b', to: 'c', label: '' },
    ],
    groups: [{ id: 'g', label: 'G', members: ['a', 'b'] }],
    caption: 'graph',
  }
  const placement = place(diagram, 20)
  const group = placement.groupRects.get('g')
  if (group === undefined) throw new Error('the boundary was not placed')
  if (!contains(placement.boxes.get('a'), group)) throw new Error('a is outside its boundary')
  if (!contains(placement.boxes.get('b'), group)) throw new Error('b is outside its boundary')
  if (contains(placement.boxes.get('c'), group)) throw new Error('a non-member is inside the boundary')
})

test('a nested boundary sits inside its parent and the parent is sized for it', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [node('a'), node('b')],
    edges: [
      { from: 'a', to: 'b', label: '' },
    ],
    groups: [
      { id: 'outer', label: 'Outer', members: ['a', 'b'] },
      { id: 'inner', label: 'Inner', members: ['a'] },
    ],
    caption: 'graph',
  }
  // Membership alone says `inner` is the tighter set, so containment is inferred without the parser saying so.
  const placement = place(diagram, 20)
  const outer = placement.groupRects.get('outer')
  const inner = placement.groupRects.get('inner')
  if (outer === undefined || inner === undefined) throw new Error('a boundary is missing')
  if (!contains(inner, outer)) throw new Error('the tighter boundary was not nested in the looser one')
})

test('a boundary is a node in its parent layer, so it travels with the flow', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [node('top'), node('a')],
    edges: [{ from: 'top', to: 'a', label: '' }],
    groups: [{ id: 'g', label: 'G', members: ['a'] }],
    caption: 'graph',
  }
  const placement = place(diagram, 20)
  const top = placement.boxes.get('top')
  const group = placement.groupRects.get('g')
  if (top === undefined || group === undefined) throw new Error('a box is missing')
  if (!(group.y > top.y)) throw new Error('the boundary carrying the target was placed above its source: ' + String(group.y) + ' vs ' + String(top.y))
})

test('a chain of twelve wraps into columns instead of one endless drop', () => {
  const diagram = chainOf(12)
  const placement = place(diagram, 20)
  const columns = new Set()
  for (const box of placement.boxes.values()) columns.add(Math.round(box.x))
  if (columns.size < 2) throw new Error('the chain is still one column')
  if (placementAspect(placement) > 3) throw new Error('the wrapped drawing is still a strip: ' + String(placementAspect(placement)))
})

test('a chain of three is left as one column, because a short stack reads better stacked', () => {
  const placement = place(chainOf(3), 20)
  const columns = new Set()
  for (const box of placement.boxes.values()) columns.add(Math.round(box.x))
  if (columns.size !== 1) throw new Error('a three-row drawing was wrapped')
})

test('the wrapping plan gives three rows one band and twelve rows several', () => {
  const short = planBands([100, 100, 100], [20, 20, 20], 40)
  if (short.bands.length !== 1) throw new Error('a three-layer drawing was split into ' + String(short.bands.length))
  const tall = planBands(
    new Array(12).fill(100),
    new Array(12).fill(20),
    40,
  )
  if (tall.bands.length < 2) throw new Error('a twelve-layer drawing was not wrapped')
  for (let index = 1; index < tall.bands.length; index += 1) {
    if (!(tall.bands[index].offsetX > tall.bands[index - 1].offsetX)) throw new Error('band offsets do not increase')
  }
  if (!(tall.height < 3 * 20 + 11 * 40)) throw new Error('the wrapped drawing is as tall as the column')
})

test('a long edge reserves one lane per crossed layer, and a reversed edge says so', () => {
  // a -> b -> c -> d -> e, plus both a -> e and e -> a: the second is a back edge, laid out as a -> e, and the
  // painter has to walk its lane backwards to draw the arrow where the source put it.
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: ['a', 'b', 'c', 'd', 'e'].map(node),
    edges: [
      { from: 'a', to: 'b', label: '' },
      { from: 'b', to: 'c', label: '' },
      { from: 'c', to: 'd', label: '' },
      { from: 'd', to: 'e', label: '' },
      { from: 'a', to: 'e', label: '' },
      { from: 'e', to: 'a', label: '' },
    ],
    caption: 'graph',
  }
  const placement = place(diagram, 20)
  const forward = placement.lanes.get(4)
  const back = placement.lanes.get(5)
  if (forward === undefined) throw new Error('the long edge reserved no lane')
  // Four layers crossed means four corridors - one between each pair of layers, whatever the dummy count.
  if (forward.points.length !== 4) throw new Error('four crossed layers need four corridor points, got ' + String(forward.points.length))
  if (forward.reversed) throw new Error('a forward edge was reported as reversed')
  if (back === undefined) throw new Error('the back edge reserved no lane, so it has no backwards drawing direction')
  if (!back.reversed) throw new Error('the back edge was not reported as reversed')
})

test('an edge that crosses a wrapped column is marked as read across, and reserves no lane', () => {
  const placement = place(chainOf(12), 20)
  if (placement.across.size === 0) throw new Error('no edge crossed a column boundary')
  for (const index of placement.across) {
    if ((placement.lanes.get(index)?.points.length ?? 0) > 0) throw new Error('a cross-column edge also claimed a lane')
  }
})

test('every node is placed exactly once, even when the model repeats an id', () => {
  const diagram = {
    kind: 'machine',
    title: 't',
    nodes: [node('a'), node('a'), node('b')],
    edges: [{ from: 'a', to: 'b', label: '' }],
    caption: 'pass',
  }
  const placement = place(diagram, 20)
  if (placement.boxes.size !== 2) throw new Error('boxes: ' + String(placement.boxes.size))
})

test('no layers is not a page, and a zero-width layer is still planned rather than rejected', () => {
  const empty = planBands([], [], 40)
  if (empty.bands.length !== 0 || empty.width !== 0 || empty.height !== 0) throw new Error('an empty plan: ' + JSON.stringify(empty))
  const zero = planBands([0, 0, 0, 0], [20, 20, 20, 20], 40)
  if (zero.bands.length === 0) throw new Error('a zero-width drawing got no bands')
  if (!Number.isFinite(zero.width) || !Number.isFinite(zero.height)) throw new Error('a zero-width drawing has no size: ' + JSON.stringify(zero))
})

test('an edge naming a boundary the drawing does not show reserves no geometry', () => {
  // The boundary around an empty nested block is not drawn, so an edge aimed at it has no rectangle to reach. It
  // must not be laid out at all: a run reserved for it would be a corridor in a gap with no edge in it.
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [node('a'), node('b')],
    edges: [
      { from: 'b', to: 'a', label: '' },
      { from: 'b', to: 'hollow', label: '' },
    ],
    groups: [
      { id: 'outer', label: 'Outer', members: ['a'] },
      { id: 'hollow', label: 'Hollow', members: [], parent: 'outer' },
    ],
    caption: 'graph',
  }
  const placement = place(diagram, 20)
  if (!placement.runs.has(0)) throw new Error('the edge the drawing does show reserved no run')
  if (placement.runs.has(1)) throw new Error('the edge into the empty boundary was laid out')
  if (placement.lanes.has(1)) throw new Error('the edge into the empty boundary claimed a lane')
})

if (failures > 0) {
  console.log(String.fromCharCode(10) + 'placement tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all placement tests passed')

// Channel assignment: the space between two rows, which no single edge may decide on its own.
//
// The stages before this one place boxes; the painter draws edges. What is left are the two free choices inside a
// gap - where a long edge's vertical lane runs, and at what height a horizontal run crosses - and an edge that picks
// its own collides with the next one. So the cases here are the properties a reader sees: two lanes in one gap keep
// distinct x's in the order their dummies have, a lane never runs through a box, the runs in a gap sit inside it at
// heights of their own, and the drawn edge actually follows the lane the stage gave it.
import { assignChannels } from '../../lib/render/channels.js'
import { breakCycles } from '../../lib/render/cycle-break.js'
import { assignCoordinates } from '../../lib/render/coords.js'
import { addDummies } from '../../lib/render/dummy.js'
import { render } from '../../lib/render/index.js'
import { layer } from '../../lib/render/layer.js'
import { order } from '../../lib/render/order.js'
import { paintWith } from '../../lib/render/paint.js'
import { place } from '../../lib/render/place.js'

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

const NL = String.fromCharCode(10)
const WIDTH = 88
const HEIGHT = 27
const GAP = 30
const LAYER_GAP = 44
const CLEARANCE = 12
const SPACING = 14

// The graph that measured the defect: `a` reaches `e` past the whole drawing and `e` points back at `b`, so two long
// edges cross the middle rows together. Every fixture here is this shape or the mesh without one of the two.
const mesh = {
  ids: ['a', 'b', 'c', 'd', 'e'],
  pairs: [
    ['a', 'b'],
    ['a', 'c'],
    ['b', 'd'],
    ['c', 'd'],
    ['d', 'e'],
    ['e', 'b'],
    ['a', 'e'],
  ],
}
const meshSource = [
  'graph TD',
  '  a[A] --> b[B]',
  '  a --> c[C]',
  '  b -->|side| d[D]',
  '  c --> d',
  '  d -->|on| e[E]',
  '  e -->|loop| b',
  '  a -->|skip| e',
].join(NL)

/** Run the pipeline up to the channel stage, and report what it was given. */
const channelsFor = ({ ids, pairs }) => {
  const graph = {
    nodes: ids.map((id) => ({ id, width: WIDTH, height: HEIGHT })),
    edges: pairs.map(([from, to], index) => ({ index, from, to })),
  }
  const broken = breakCycles(graph)
  const layered = layer(graph, broken.edges)
  const augmented = addDummies(layered, broken.edges)
  const ordered = order(augmented.layers, augmented.chains)
  const coordinates = assignCoordinates(
    {
      layers: ordered.layers,
      chains: augmented.chains,
      sizeOf: () => ({ width: WIDTH, height: HEIGHT }),
      chainOf: augmented.chainOf,
    },
    { gap: GAP, layerGap: LAYER_GAP },
  )
  const layerY = []
  let top = 0
  for (const height of coordinates.layerHeight) {
    layerY.push(top)
    top += height + LAYER_GAP
  }
  const boxes = new Map()
  ordered.layers.forEach((row, depth) => {
    for (const id of row) {
      if (augmented.chainOf.has(id)) continue
      const centre = coordinates.x.get(id) ?? 0
      boxes.set(id, {
        x: centre - WIDTH / 2,
        y: layerY[depth] + (coordinates.layerHeight[depth] - HEIGHT) / 2,
        width: WIDTH,
        height: HEIGHT,
      })
    }
  })
  const plan = assignChannels(
    {
      layers: ordered.layers,
      chains: augmented.chains,
      chainOf: augmented.chainOf,
      boxes,
      layerY,
      layerHeight: coordinates.layerHeight,
      laneX: coordinates.x,
    },
    { clearance: CLEARANCE, spacing: SPACING },
  )
  // What each lane joins, and the rows it passes through: what an assertion about a lane needs to know.
  const lanes = [...plan.lanes.entries()].map(([edge, lane]) => {
    const chain = augmented.chains.find((entry) => entry.index === edge)
    const from = layered.layerOf.get(chain.path[0])
    const to = layered.layerOf.get(chain.path[chain.path.length - 1])
    const dummies = chain.path.filter((id) => augmented.chainOf.has(id))
    return { edge, lane, chain, dummies, from, to }
  })
  return { plan, ordered, augmented, layered, coordinates, boxes, layerY, lanes }
}

/** Where a lane's dummy sits in the row both of these lanes end on: the order the lanes have to keep. */
const dummyOrder = (built, lane) => {
  const row = built.ordered.layers[2]
  return row.findIndex((id) => lane.dummies.includes(id) && row.includes(id))
}

test('two long edges crossing one gap get one lane each, in the order of their dummies', () => {
  const built = channelsFor(mesh)
  if (built.lanes.length !== 2) throw new Error('lanes: ' + String(built.lanes.length))
  const [left, right] = [...built.lanes].sort((first, second) => first.lane.x - second.lane.x)
  if (right.lane.x - left.lane.x < SPACING - 0.001) throw new Error('two lanes share an x: ' + String(left.lane.x) + ' and ' + String(right.lane.x))
  // A lane is ordered by the dummy it has in the lower row of the gap: the left one in the ordering is the left one
  // on the page, which is what keeps the drawn edge consistent with the crossing count the ordering settled.
  const first = dummyOrder(built, left)
  const second = dummyOrder(built, right)
  if (first === -1 || second === -1) throw new Error('a lane lost its dummy')
  if (first >= second) throw new Error('the lanes are ordered against their dummies: ' + String(first) + ' >= ' + String(second))
})

test('two lanes that want the same x are separated, and the box stays between them', () => {
  // Two long edges with the same two ends: every row proposes one x for both of them, and the free corridor they
  // can use is the one left of the box in the middle row. One lane keeps the corridor and the other is pushed to
  // the next free one, because two lanes on one x draw one line.
  const boxes = new Map([
    ['a', { x: 0, y: 0, width: WIDTH, height: HEIGHT }],
    ['b', { x: 20, y: 71, width: WIDTH, height: HEIGHT }],
    ['c', { x: 0, y: 142, width: WIDTH, height: HEIGHT }],
  ])
  const plan = assignChannels(
    {
      layers: [['a'], ['b', '#d0_1', '#d1_1'], ['c']],
      chains: [
        { index: 0, path: ['a', '#d0_1', 'c'] },
        { index: 1, path: ['a', '#d1_1', 'c'] },
      ],
      chainOf: new Map([
        ['#d0_1', '#e0'],
        ['#d1_1', '#e1'],
      ]),
      boxes,
      layerY: [0, 71, 142],
      layerHeight: [HEIGHT, HEIGHT, HEIGHT],
      laneX: new Map([
        ['#e0', 60],
        ['#e1', 60],
      ]),
    },
    { clearance: CLEARANCE, spacing: SPACING },
  )
  const lanes = [...plan.lanes.values()].sort((left, right) => left.x - right.x)
  if (lanes.length !== 2) throw new Error('lanes: ' + String(lanes.length))
  if (lanes[1].x - lanes[0].x < SPACING - 0.001) throw new Error('two lanes stayed on one x: ' + JSON.stringify(lanes.map((lane) => lane.x)))
  // The first keeps the corridor it asked for; the second is moved past the box, not into it.
  if (Math.abs(lanes[0].x - 8) > 0.5) throw new Error('the first lane did not take the corridor left of the box: ' + String(lanes[0].x))
  const box = boxes.get('b')
  for (const lane of lanes) {
    if (lane.x > box.x - CLEARANCE && lane.x < box.x + box.width + CLEARANCE) throw new Error('a lane landed on the box: ' + String(lane.x))
  }
})

test('a lane runs in a corridor: clear of every box it passes, by the clearance it was given', () => {
  const built = channelsFor(mesh)
  for (const lane of built.lanes) {
    for (let depth = lane.from + 1; depth < lane.to; depth += 1) {
      for (const id of built.ordered.layers[depth]) {
        const box = built.boxes.get(id)
        if (box === undefined) continue
        const clear = lane.lane.x <= box.x - CLEARANCE + 0.001 || lane.lane.x >= box.x + box.width + CLEARANCE - 0.001
        if (!clear) throw new Error('the lane at ' + String(lane.lane.x) + ' runs through "' + id + '" in row ' + String(depth))
      }
    }
  }
})

test('every corridor run sits inside the gap it belongs to, at a height of its own', () => {
  const built = channelsFor(mesh)
  const heights = new Map()
  for (const lane of built.lanes) {
    lane.lane.y.forEach((y, index) => {
      const depth = lane.from + index
      const top = built.layerY[depth] + built.coordinates.layerHeight[depth]
      const bottom = built.layerY[depth + 1]
      if (!(y > top && y < bottom)) throw new Error('a run at ' + String(y) + ' is outside the gap ' + String(top) + '..' + String(bottom))
      heights.set(depth, [...(heights.get(depth) ?? []), y])
    })
  }
  // The two lanes end on the same row, so they run through the same last gap: those runs may not sit on one height.
  const last = heights.get(2) ?? []
  if (last.length < 2) throw new Error('the fixture no longer shares a gap: ' + JSON.stringify(last))
  if (new Set(last.map((y) => Math.round(y * 10))).size !== last.length) throw new Error('two runs share a height: ' + JSON.stringify(last))
})

test('an edge with a lane draws one vertical run at that lane x', () => {
  const rendered = render({ source: meshSource })
  const placement = place(rendered.diagram, 20)
  const index = rendered.diagram.edges.findIndex((edge) => edge.label === 'skip')
  const lane = placement.lanes.get(index)
  if (lane === undefined) throw new Error('the long edge reserved no lane')
  const x = lane.points[0].x
  for (const point of lane.points) if (Math.abs(point.x - x) > 0.5) throw new Error('the lane changed its x between two gaps')
  const { canvas } = paintWith(rendered.diagram)
  const shape = canvas.shapes.find((entry) => (entry.kind === 'link' || entry.kind === 'path') && entry.label === 'skip')
  if (shape === undefined) throw new Error('the long edge was not drawn')
  const points = shape.kind === 'link' ? [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }] : shape.points
  const onLane = points.filter((point) => Math.abs(point.x - x) < 0.5)
  if (onLane.length < 2) throw new Error('the drawn edge never runs at its lane x: ' + JSON.stringify(points) + ' vs ' + String(x))
  const span = Math.max(...onLane.map((point) => point.y)) - Math.min(...onLane.map((point) => point.y))
  if (span < 1) throw new Error('the lane x is a single point, not a vertical run')
  // The lane sits inside the gap, and the page is widened to hold it: a lane outside the canvas would be a line the
  // reader never sees.
  if (x < 0 || x > canvas.width) throw new Error('the lane at ' + String(x) + ' is off the page, which is ' + String(canvas.width) + ' wide')
})

test('an edge between two rows is one run, drawn inside the gap and not through a box', () => {
  const rendered = render({ source: meshSource })
  const placement = place(rendered.diagram, 20)
  const index = rendered.diagram.edges.findIndex((edge) => edge.label === 'side')
  const edge = rendered.diagram.edges[index]
  const y = placement.runs.get(index)
  if (y === undefined) throw new Error('the short edge got no run height')
  const source = placement.boxes.get(edge.from)
  const target = placement.boxes.get(edge.to)
  if (source === undefined || target === undefined) throw new Error('a box is missing')
  const top = source.y + source.height
  const bottom = target.y
  if (!(y > top && y < bottom)) throw new Error('the run at ' + String(y) + ' is outside the gap ' + String(top) + '..' + String(bottom))
  // No segment of the drawing runs through a box: the invariant the whole router rests on. The boxes and the
  // segments are both read off the painted canvas, so they are in the same coordinates.
  const { canvas } = paintWith(rendered.diagram)
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  const segments = []
  for (const shape of canvas.shapes) {
    if (shape.kind === 'link') segments.push({ x1: shape.x1, y1: shape.y1, x2: shape.x2, y2: shape.y2 })
    if (shape.kind !== 'path') continue
    for (let at = 0; at + 1 < shape.points.length; at += 1) {
      segments.push({ x1: shape.points[at].x, y1: shape.points[at].y, x2: shape.points[at + 1].x, y2: shape.points[at + 1].y })
    }
  }
  for (const segment of segments) {
    for (const box of boxes) {
      const minX = box.x + 0.5
      const maxX = box.x + box.width - 0.5
      const minY = box.y + 0.5
      const maxY = box.y + box.height - 0.5
      const horizontal = Math.abs(segment.y1 - segment.y2) < 0.001
      const vertical = Math.abs(segment.x1 - segment.x2) < 0.001
      const through = horizontal
        ? segment.y1 > minY && segment.y1 < maxY && Math.max(segment.x1, segment.x2) > minX && Math.min(segment.x1, segment.x2) < maxX
        : vertical
          ? segment.x1 > minX && segment.x1 < maxX && Math.max(segment.y1, segment.y2) > minY && Math.min(segment.y1, segment.y2) < maxY
          : false
      if (through) throw new Error('a segment runs through a box: ' + JSON.stringify(segment) + ' vs ' + JSON.stringify(box))
    }
  }
})

test('two runs in one gap are stacked, so they never draw one line', () => {
  // A fan: `a` reaches `b` and `c`, which sit in one row. Both edges need a run in the same gap, and two runs on one
  // height read as a junction rather than as two edges.
  const built = channelsFor({ ids: ['a', 'b', 'c'], pairs: [['a', 'b'], ['a', 'c']] })
  const heights = [...built.plan.runs.values()].map((y) => Math.round(y * 10) / 10)
  if (heights.length !== 2) throw new Error('runs: ' + String(heights.length))
  if (heights[0] === heights[1]) throw new Error('two runs share a height: ' + JSON.stringify(heights))
  const top = built.layerY[0] + built.coordinates.layerHeight[0]
  const bottom = built.layerY[1]
  for (const y of heights) if (!(y > top && y < bottom)) throw new Error('a run at ' + String(y) + ' is outside the gap ' + String(top) + '..' + String(bottom))
})

test('a lane that would have crossed a box is moved, and the box stays where the means put it', () => {
  // The middle row of the mesh has a box where a lane would most like to run: the lane yields. The box keeps the
  // position coordinate assignment gave it, because a box is what a reader looks at.
  const built = channelsFor(mesh)
  for (const lane of built.lanes) {
    const box = built.boxes.get('d')
    const inside = lane.lane.x > box.x && lane.lane.x < box.x + box.width
    if (!inside) continue
    throw new Error('a lane runs through "d", which the channel stage was supposed to avoid')
  }
  const centre = (built.boxes.get('d').x + built.boxes.get('d').width / 2)
  const expected = built.coordinates.x.get('d')
  if (Math.abs(centre - expected) > 0.5) throw new Error('"d" was moved off its coordinate: ' + String(centre) + ' vs ' + String(expected))
})

if (failures > 0) {
  console.log(NL + 'channel tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all channel tests passed')

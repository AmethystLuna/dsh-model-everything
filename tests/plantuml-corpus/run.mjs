// PlantUML constructs a component or state diagram actually contains, each with the difficulty it probes.
//
// The adapter is judged on two things at once: did it read the construct, and did it refuse the near miss
// by line rather than draw half a diagram. Every case names the difficulty it exists for, so a failure
// says which construct moved rather than only which assertion tripped.
//
// This is not PlantUML. A construct this renderer has no symbol for is refused by line, and the case
// records that refusal as the expected answer - that is the contract, not a bug to fix later.
import { render as draw } from '../../lib/render/index.js'
import { wellFormed } from '../svg-document.mjs'

// Every drawing this suite makes is also checked as a document: a case that reads a construct correctly can still emit
// markup a container cannot open, and no assertion about geometry would notice.
const render = (...args) => {
  const result = draw(...args)
  if (result.markup !== '') wellFormed(result.markup)
  return result
}

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

const CASES = [
  {
    name: "nested packages, three levels",
    why: "boundary depth: a group holds a group holds a group",
    source: "@startuml\npackage \"A\" {\n  package \"B\" {\n    package \"C\" {\n      component X\n    }\n  }\n}\n@enduml",
    expect: { nodes: 1, edges: 0, groups: 3, refused: [] },
  },
  {
    name: "quoted package label with alias, edge into the block",
    why: "the block itself is an edge end, not a box",
    source: "@startuml\npackage \"Core services\" as Core {\n  component X\n}\ncomponent Y\nCore --> Y\n@enduml",
    expect: { nodes: 2, edges: 1, groups: 1, refused: [] },
  },
  {
    name: "edge into a nested package",
    why: "must refuse: the edge would enter another boundary",
    source: "@startuml\npackage A {\n  package B {\n    component X\n  }\n}\ncomponent Y\nB --> Y\n@enduml",
    expect: { nodes: 2, edges: 0, groups: 2, refused: ["is a block inside"] },
  },
  {
    name: "bracketed shorthand with spaces",
    why: "the label is the id, spaces and all",
    source: "@startuml\n[Payment gateway] --> [Order service]\n[Order service] --> Database\n@enduml",
    expect: { nodes: 3, edges: 2, groups: 0, refused: [] },
  },
  {
    name: "alias declared twice, label once",
    why: "the first label wins, the id stays one node",
    source: "@startuml\ncomponent \"First label\" as A\ncomponent \"Second label\" as A\nA --> B\n@enduml",
    expect: { nodes: 2, edges: 1, groups: 0, refused: [] },
  },
  {
    name: "stereotype on a component",
    why: "a stereotype is not part of the name",
    source: "@startuml\ncomponent A <<service>>\nA --> B\n@enduml",
    expect: { nodes: 2, edges: 1, groups: 0, refused: [] },
  },
  {
    name: "dependency with label, both directions",
    why: "the mark end decides the edge direction",
    source: "@startuml\nA ..> B : uses\nC <.. D : also uses\n@enduml",
    expect: { nodes: 4, edges: 2, groups: 0, refused: [] },
  },
  {
    name: "generalisation between components",
    why: "the triangle sits at the general end",
    source: "@startuml\nBase <|-- Derived\nDerived --> Client\n@enduml",
    expect: { nodes: 3, edges: 2, groups: 0, refused: [] },
  },
  {
    name: "composition and aggregation",
    why: "the diamond sits at the whole, and the owner may be called Group",
    source: "@startuml\nOrder *-- Line\nGroup o-- Member\n@enduml",
    expect: { nodes: 4, edges: 2, groups: 0, refused: [] },
  },
  {
    name: "marks at both ends",
    why: "must refuse: a mark at each end is not one edge",
    source: "@startuml\nA *--* B\n@enduml",
    expect: { nodes: 0, edges: 0, groups: 0, refused: ["marked at both ends"] },
  },
  {
    name: "composite state with inner transitions",
    // A composite state used to be refused as a boundary, with its body kept. It is a boundary now, drawn solid: the
    // state is one state whose inside happens to be states, which is exactly what the notation says.
    why: "a state block is a boundary, and the transitions inside it are edges",
    source: "@startuml\nstate Running {\n  [*] --> Busy\n  Busy --> Idle\n}\n[*] --> Running\n@enduml",
    expect: { nodes: 2, edges: 1, groups: 1, refused: [] },
  },
  {
    name: "state alias with a long label",
    // `W --> [*]` is the exit, not a second box called `*`: one node, one self-loop labelled `end`.
    why: "a long label widens the box; the exit marker is not a node",
    source: "@startuml\nstate \"Waiting for the upstream service to answer\" as W\n[*] --> W\nW --> [*]\n@enduml",
    expect: { nodes: 1, edges: 1, groups: 0, refused: [] },
  },
  {
    name: "node and package share a name",
    why: "an explicit element keeps the name from becoming a boundary",
    source: "@startuml\npackage P {\n  component X\n}\ncomponent P\nP --> X\n@enduml",
    expect: { nodes: 2, edges: 1, groups: 1, refused: [] },
  },
  {
    name: "line break in a label",
    why: "br splits the line inside one box",
    source: "@startuml\ncomponent \"reads<br>and writes\" as R\nR --> Store\n@enduml",
    expect: { nodes: 2, edges: 1, groups: 0, refused: [] },
  },
  {
    name: "together block",
    why: "parsed, and today it has no effect (P1)",
    source: "@startuml\ntogether {\n  component A\n  component B\n}\nA --> C\nB --> C\n@enduml",
    expect: { nodes: 3, edges: 2, groups: 0, refused: [] },
  },
  {
    name: "hidden edge",
    why: "it ranks and is not drawn: three nodes, three edges, no refusal",
    source: "@startuml\nA -[hidden]-> B\nA --> C\nB --> C\n@enduml",
    expect: { nodes: 3, edges: 3, groups: 0, refused: [] },
  },
  {
    name: "rightward edge hint",
    why: "honoured: the two boxes share a row, A on the left",
    source: "@startuml\nA -right-> B\n@enduml",
    expect: { nodes: 2, edges: 1, groups: 0, refused: [] },
  },
  {
    name: "skinparam block",
    why: "ignored, and the lines after it still parse",
    source: "@startuml\nskinparam nodesep 10\nskinparam ranksep 20\nA --> B\n@enduml",
    expect: { nodes: 2, edges: 1, groups: 0, refused: [] },
  },
]

for (const c of CASES) {
  test(c.name + ' - ' + c.why, () => {
    const drawn = render({ source: c.source }, {}, { scheme: 'default' })
    const counts = { nodes: drawn.diagram.nodes.length, edges: drawn.diagram.edges.length, groups: (drawn.diagram.groups ?? []).length }
    for (const [key, want] of Object.entries(c.expect)) {
      if (key === 'refused') continue
      if (counts[key] !== want) throw new Error(key + ' ' + String(counts[key]) + ', expected ' + String(want))
    }
    if (drawn.refused.length !== c.expect.refused.length) {
      throw new Error('refused ' + String(drawn.refused.length) + ' line(s): ' + drawn.refused.join(' | '))
    }
    for (const needle of c.expect.refused) {
      if (!drawn.refused.some((line) => line.includes(needle))) throw new Error('no refusal mentions ' + needle + ': ' + drawn.refused.join(' | '))
    }
    // A refusal must never cost the lines that did parse: the drawing is what the reader sees.
    if (!/<svg[^>]*viewBox="0 0 \d+ \d+"/.test(drawn.markup)) throw new Error('no drawing: ' + drawn.markup.slice(0, 80))
    if (drawn.dropped !== 0) throw new Error('dropped ' + String(drawn.dropped) + ' shape(s)')
    // No two edges are drawn on one line. Two lines that share a stretch read as one line with two heads, and the
    // reader cannot tell which head belongs to which statement - the rule the painter enforces when it routes.
    const piecesOf = (points) => {
      const out = []
      for (let i = 1; i < points.length; i += 1) {
        const before = points[i - 1]
        const after = points[i]
        if (Math.abs(before.y - after.y) < 0.5 && Math.abs(before.x - after.x) > 1) out.push({ axis: 'y', at: before.y, lo: Math.min(before.x, after.x), hi: Math.max(before.x, after.x) })
        if (Math.abs(before.x - after.x) < 0.5 && Math.abs(before.y - after.y) > 1) out.push({ axis: 'x', at: before.x, lo: Math.min(before.y, after.y), hi: Math.max(before.y, after.y) })
      }
      return out
    }
    const routes = drawn.canvas.shapes.filter((shape) => shape.kind === 'path').map((shape) => piecesOf(shape.points))
    let shared = 0
    for (let left = 0; left < routes.length; left += 1) {
      for (let right = left + 1; right < routes.length; right += 1) {
        for (const mine of routes[left]) {
          for (const theirs of routes[right]) {
            if (mine.axis !== theirs.axis || Math.abs(mine.at - theirs.at) >= 0.5) continue
            shared += Math.max(0, Math.min(mine.hi, theirs.hi) - Math.max(mine.lo, theirs.lo) - 1)
          }
        }
      }
    }
    if (shared > 0) throw new Error('two edges share ' + String(shared) + ' points of line')
    // And every leg is axis-aligned: a diagonal between two boxes reads as a different kind of relation than the
    // orthogonal legs around it, and the layout has no reason to draw one.
    for (const shape of drawn.canvas.shapes) {
      const points = shape.kind === 'path' ? shape.points : shape.kind === 'link' ? [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }] : []
      for (let index = 1; index < points.length; index += 1) {
        const before = points[index - 1]
        const after = points[index]
        if (Math.abs(before.x - after.x) > 0.5 && Math.abs(before.y - after.y) > 0.5) {
          throw new Error('a leg runs diagonally: ' + JSON.stringify([before, after]))
        }
      }
    }
  })
}

// `left to right direction` turns the drawing: the same chain that stacks downwards runs along one row.
test('left to right direction lays the chain out along a row', () => {
  const chain = (heading) => {
    const lines = ['@startuml', ...(heading === 'down' ? [] : ['left to right direction']), 'component A', 'component B', 'component C', 'A --> B', 'B --> C', '@enduml']
    const r = render({ source: lines.join('\n') }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
    if (r.ignored.length !== 0) throw new Error('the direction was reported as ignored: ' + JSON.stringify(r.ignored))
    const boxes = r.canvas.shapes.filter((shape) => shape.kind === 'box').sort((left, right) => left.x - right.x)
    return { boxes, canvas: r.canvas }
  }
  const down = chain('down')
  if (new Set(down.boxes.map((box) => box.y)).size !== 3) throw new Error('the downward chain did not take three rows')
  const right = chain('right')
  if (new Set(right.boxes.map((box) => box.y)).size !== 1) throw new Error('the turned chain is not on one row: ' + JSON.stringify(right.boxes.map((box) => box.y)))
  if (right.boxes[0].x >= right.boxes[1].x) throw new Error('the turned chain runs backwards')
  if (right.canvas.width <= right.canvas.height) throw new Error('the turned canvas is not wider than tall: ' + right.canvas.width + 'x' + right.canvas.height)
})

// A side carries as many edges as the source gives it. What it must not do is put two of them on one pixel: that reads as
// one line splitting, and no layout below it can recover the two statements.
test('two edges never leave one side from the same point', () => {
  const portsOn = (source, boxId, side) => {
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
    const box = r.canvas.shapes.find((shape) => shape.kind === 'box' && shape.id === boxId)
    if (box === undefined) throw new Error('no box ' + boxId)
    const on = (point) => {
      if (side === 'bottom') return Math.abs(point.y - (box.y + box.height)) <= 1.5 && point.x >= box.x - 1.5 && point.x <= box.x + box.width + 1.5
      return Math.abs(point.y - box.y) <= 1.5 && point.x >= box.x - 1.5 && point.x <= box.x + box.width + 1.5
    }
    const found = []
    for (const route of r.canvas.shapes.filter((shape) => shape.kind === 'path' || shape.kind === 'link')) {
      const ends = route.kind === 'path' ? [route.points[0], route.points[route.points.length - 1]] : [{ x: route.x1, y: route.y1 }, { x: route.x2, y: route.y2 }]
      for (const end of ends) if (on(end)) found.push(end)
    }
    return found
  }
  const many = ['@startuml', 'component hub', ...Array.from({ length: 10 }, (_, i) => 'component t' + i), ...Array.from({ length: 10 }, (_, i) => 'hub --> t' + i), '@enduml'].join('\n')
  const ports = portsOn(many, 'hub', 'bottom')
  if (ports.length < 8) throw new Error('the fan-out did not reach the side: ' + String(ports.length))
  for (let i = 0; i < ports.length; i += 1) {
    for (let j = i + 1; j < ports.length; j += 1) {
      const gap = Math.hypot(ports[i].x - ports[j].x, ports[i].y - ports[j].y)
      if (gap < 4) throw new Error('two ports sit ' + gap.toFixed(1) + 'px apart')
    }
  }
  const few = ['@startuml', 'component hub', 'component a', 'component b', 'hub --> a', 'hub --> b', '@enduml'].join('\n')
  const two = portsOn(few, 'hub', 'bottom')
  if (two.length !== 2) throw new Error('the small case did not keep two ports: ' + String(two.length))
  if (Math.abs(two[0].x - two[1].x) < 18) throw new Error('two ports lost their separation: ' + Math.abs(two[0].x - two[1].x).toFixed(1))
})

// A route never steps sideways by a couple of pixels between two parallel legs: that reads as a kink, and the port the
// node offered is the statement the lane must follow.
test('no route carries a jog shorter than a pen width', () => {
  const jogs = (shape) => {
    const points = shape.points
    let found = 0
    for (let i = 2; i < points.length - 1; i += 1) {
      const before = points[i - 1]
      const corner = points[i]
      const after = points[i + 1]
      const vertical = Math.abs(corner.x - before.x) < 0.01 && Math.abs(corner.y - before.y) > 0.01
      const horizontal = Math.abs(corner.y - before.y) < 0.01 && Math.abs(corner.x - before.x) > 0.01
      if (!vertical && !horizontal) continue
      const length = Math.hypot(corner.x - before.x, corner.y - before.y)
      if (length < 0.01 || length >= 6) continue
      const beforeAcross = vertical ? Math.abs(points[i - 2].y - before.y) < 0.01 : Math.abs(points[i - 2].x - before.x) < 0.01
      const afterAcross = vertical ? Math.abs(after.y - corner.y) < 0.01 : Math.abs(after.x - corner.x) < 0.01
      if (beforeAcross && afterAcross) found += 1
    }
    return found
  }
  const sources = [
    ['@startuml', 'component A', 'component B', 'component C', 'A --> B', 'B --> C', 'A --> C', '@enduml'].join('\n'),
    ['@startuml', 'left to right direction', 'component A', 'component B', 'component C', 'A --> B', 'B --> C', 'A --> C', '@enduml'].join('\n'),
    ['@startuml', 'left to right direction', 'component A', 'component B', 'component C', 'component D', 'A --> B', 'B --> C', 'C --> D', 'A --> D', '@enduml'].join('\n'),
  ]
  for (const source of sources) {
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
    const total = r.canvas.shapes.filter((shape) => shape.kind === 'path').reduce((sum, shape) => sum + jogs(shape), 0)
    if (total !== 0) throw new Error('a route carries ' + String(total) + ' jog(s)')
  }
})

// A turned drawing is asked to grow along the page, so it never wraps into a second run of ranks - and a box declared
// outside a package is never placed inside it, however tightly the columns fit.
test('a turned drawing grows along the page and keeps its packages', () => {
  const chain = ['@startuml', 'left to right direction', ...Array.from({ length: 10 }, (_, i) => 'component n' + i), ...Array.from({ length: 9 }, (_, i) => 'n' + i + ' --> n' + (i + 1)), '@enduml'].join('\n')
  const wide = render({ source: chain }, {}, { scheme: 'default' })
  if (wide.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(wide.refused))
  const rows = new Set(wide.canvas.shapes.filter((shape) => shape.kind === 'box').map((box) => box.y))
  if (rows.size !== 1) throw new Error('the turned chain wrapped into ' + String(rows.size) + ' rows')
  if (wide.canvas.width <= wide.canvas.height) throw new Error('the turned chain is not wide: ' + wide.canvas.width + 'x' + wide.canvas.height)
  const mixed = ['@startuml', 'left to right direction', 'package "应用" as app {', '  together {', '    component "订单" as order', '    component "库存" as stock', '  }', '}', 'component "计价" as price', 'component "库" as db', 'order --> price : 计算', 'stock -[hidden]-> price', 'price --> db', '@enduml'].join('\n')
  const r = render({ source: mixed }, {}, { scheme: 'default' })
  if (r.refused.length !== 0) throw new Error('mixed refused: ' + JSON.stringify(r.refused))
  if (r.canvas.routingFailures.length !== 0) throw new Error('mixed crossed a box: ' + JSON.stringify(r.canvas.routingFailures))
  const group = r.canvas.shapes.find((shape) => shape.kind === 'group')
  if (group === undefined) throw new Error('the package is gone')
  const price = r.canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === '计价')
  if (price === undefined) throw new Error('the root box is gone')
  const inside = price.x + price.width > group.x && price.x < group.x + group.width && price.y + price.height > group.y && price.y < group.y + group.height
  if (inside) throw new Error('a box declared outside the package was drawn inside it')
  if (!(price.x > group.x + group.width)) throw new Error('the root box is not the next column: ' + String(price.x) + ' vs ' + String(group.x + group.width))
})

// A leg runs along one axis or it does not: a route with a diagonal leg is a line that reaches its port by cutting a
// corner, which reads as a mistake and hides which side it attached to. The neighbour case is the snap that removes a kink:
// it must leave the route orthogonal, not trade a step for a slope.
test('no route carries a diagonal leg', () => {
  const sources = [
    ['@startuml', 'left to right direction', 'component "接入" as a', 'component "应用" as b', 'component "数据" as c', 'a --> b', 'b --> c', 'a --> c : 直连', '@enduml'].join('\n'),
    ['@startuml', 'component hub', ...Array.from({ length: 6 }, (_, i) => 'component t' + i), ...Array.from({ length: 6 }, (_, i) => 'hub --> t' + i), '@enduml'].join('\n'),
    ['@startuml', 'component a', 'component b', 'component c', 'a --> b', 'b --> c', 'a --> c', '@enduml'].join('\n'),
  ]
  for (const source of sources) {
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused.slice(0, 2)))
    for (const shape of r.canvas.shapes) {
      const points = shape.kind === 'path' ? shape.points : shape.kind === 'link' ? [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }] : []
      for (let index = 1; index < points.length; index += 1) {
        const dx = Math.abs(points[index].x - points[index - 1].x)
        const dy = Math.abs(points[index].y - points[index - 1].y)
        if (dx > 0.01 && dy > 0.01) throw new Error('a diagonal leg: ' + dx.toFixed(2) + ' by ' + dy.toFixed(2))
      }
    }
  }
})

// Two routes that run along the same line read as one line, and a reader loses one of the two statements. The property is
// asserted over drawings with many long edges, where a routed lane can land on another edge's lane.
test('no two routes draw the same line', () => {
  const segmentsOf = (shape) => {
    const points = shape.kind === 'path' ? shape.points : [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }]
    const out = []
    for (let i = 1; i < points.length; i += 1) out.push([points[i - 1].x, points[i - 1].y, points[i].x, points[i].y])
    return out
  }
  const shared = (routes) => {
    let total = 0
    for (let a = 0; a < routes.length; a += 1) {
      for (let b = a + 1; b < routes.length; b += 1) {
        for (const mine of segmentsOf(routes[a])) {
          for (const theirs of segmentsOf(routes[b])) {
            const mineVertical = Math.abs(mine[0] - mine[2]) < 0.01
            const theirsVertical = Math.abs(theirs[0] - theirs[2]) < 0.01
            if (mineVertical !== theirsVertical) continue
            if (mineVertical && Math.abs(mine[0] - theirs[0]) >= 5) continue
            if (!mineVertical && Math.abs(mine[1] - theirs[1]) >= 5) continue
            const lo = mineVertical ? Math.max(Math.min(mine[1], mine[3]), Math.min(theirs[1], theirs[3])) : Math.max(Math.min(mine[0], mine[2]), Math.min(theirs[0], theirs[2]))
            const hi = mineVertical ? Math.min(Math.max(mine[1], mine[3]), Math.max(theirs[1], theirs[3])) : Math.min(Math.max(mine[0], mine[2]), Math.max(theirs[0], theirs[2]))
            total += Math.max(0, hi - lo)
          }
        }
      }
    }
    return total
  }
  const sources = [
    // A layered drawing: long edges pass several rows, which is where two lanes can coincide.
    ['@startuml', 'package "edge" as edge {', '  component web', '  component api', '}', 'package "app" as app {', '  component order', '  component stock', '}', 'component bus', 'component store', 'web --> api', 'api --> order', 'api --> stock', 'order --> bus', 'stock --> bus', 'bus --> store', 'order ..> store', 'stock ..> store', '@enduml'].join('\n'),
    // A fan-out: every edge leaves the same side.
    ['@startuml', 'component hub', ...Array.from({ length: 6 }, (_, i) => 'component t' + i), ...Array.from({ length: 6 }, (_, i) => 'hub --> t' + i), '@enduml'].join('\n'),
    // A ring with a shortcut.
    ['@startuml', 'component a', 'component b', 'component c', 'component d', 'a --> b', 'b --> c', 'c --> d', 'd --> a', 'a --> c', '@enduml'].join('\n'),
  ]
  for (const source of sources) {
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused.slice(0, 2)))
    const routes = r.canvas.shapes.filter((shape) => shape.kind === 'path' || shape.kind === 'link')
    const total = shared(routes)
    if (total > 0.5) throw new Error('two routes share ' + total.toFixed(1) + 'px of line')
  }
})

// A fan-out of six is the smallest drawing where the separation pass's decisions show: its routes are pinned here so a
// change to how the pass computes what to move is visible in the drawing, not only in a timing.
test('a six-way fan-out keeps its routing', () => {
  const source = ['@startuml', 'component hub', ...Array.from({ length: 6 }, (_, i) => 'component t' + i), ...Array.from({ length: 6 }, (_, i) => 'hub --> t' + i), '@enduml'].join('\n')
  const r = render({ source }, {}, { scheme: 'default' })
  const routes = r.canvas.shapes.filter((shape) => shape.kind === 'path' || shape.kind === 'link')
  const drawn = routes.map((shape) => shape.kind === 'path'
    ? shape.points.map((point) => Math.round(point.x) + ',' + Math.round(point.y)).join(' ')
    : Math.round(shape.x1) + ',' + Math.round(shape.y1) + ' ' + Math.round(shape.x2) + ',' + Math.round(shape.y2))
  const expected = [
    '321,73 321,85 64,85 64,117',
    '335,73 335,93 182,93 182,117',
    '349,73 349,101 300,101 300,117',
    '369,73 369,87 418,87 418,117',
    '383,73 383,107 536,107 536,117',
    '397,73 397,101 654,101 654,117',
  ]
  if (JSON.stringify(drawn) !== JSON.stringify(expected)) {
    throw new Error('the fan-out routes changed: ' + JSON.stringify(drawn))
  }
})

// A drawing large enough to matter must still finish quickly. The ceiling is forty times what the drawing costs today, so it
// fails on the order of magnitude a cubic pass brings back, not on a loaded machine: the count and the routing are asserted
// beside it, so a fast wrong picture does not pass either.
test('a large drawing still finishes in a click', () => {
  const shapes = {
    chain: ['@startuml', ...Array.from({ length: 60 }, (_, i) => 'component n' + i), ...Array.from({ length: 59 }, (_, i) => 'n' + i + ' --> n' + (i + 1)), '@enduml'].join('\n'),
    fan: ['@startuml', 'component hub', ...Array.from({ length: 60 }, (_, i) => 'component t' + i), ...Array.from({ length: 60 }, (_, i) => 'hub --> t' + i), '@enduml'].join('\n'),
  }
  for (const [name, source] of Object.entries(shapes)) {
    const started = Date.now()
    const r = render({ source }, {}, { scheme: 'default' })
    const elapsed = Date.now() - started
    if (r.refused.length !== 0) throw new Error(name + ' refused: ' + JSON.stringify(r.refused.slice(0, 2)))
    if (name === 'chain' && (r.diagram.nodes.length !== 60 || r.diagram.edges.length !== 59)) {
      throw new Error('the chain lost nodes: ' + String(r.diagram.nodes.length))
    }
    if (name === 'fan' && r.diagram.edges.length !== 60) throw new Error('the fan lost edges: ' + String(r.diagram.edges.length))
    if (r.canvas.routingFailures.length !== 0) throw new Error(name + ' crossed a box')
    if (elapsed > 8000) throw new Error(name + ' took ' + String(elapsed) + 'ms')
  }
})

// The same source renders to the same bytes, in any order, in any process: a drawing a reader can point at is a drawing
// that does not change under them, and every snapshot in these suites rests on it.
test('the same source renders to the same bytes', () => {
  const wide = ['@startuml', 'left to right direction', 'together {', '  component x', '  component y', '}', 'component z', 'z --> x', 'x -[hidden]-> y', '@enduml'].join('\n')
  const machine = ['@startuml', 'state "甲" as a', 'state "乙" as b', '[*] --> a', 'a --> b : 走', 'b --> a', '@enduml'].join('\n')
  const big = ['@startuml', ...Array.from({ length: 30 }, (_, i) => 'component n' + i), ...Array.from({ length: 29 }, (_, i) => 'n' + i + ' --> n' + (i + 1)), '@enduml'].join('\n')
  const once = new Map()
  for (const source of [wide, machine, big]) once.set(source, render({ source }, {}, { scheme: 'default' }).markup)
  // Rendered again after the others, and in the opposite order: a drawing that depends on what was drawn before it is
  // the failure this catches.
  for (const source of [big, machine, wide]) {
    const again = render({ source }, {}, { scheme: 'default' }).markup
    if (again !== once.get(source)) throw new Error('the same source rendered differently: ' + source.slice(0, 30))
  }
})

// A drawing is a model, not a notation. The same graph written either way must produce the same model - the same nodes
// with the same labels, the same edges with the same heads and dashes, the same containment - or "switch notation" would
// silently switch the picture.
test('the two notations describe the same drawing', () => {
  const model = (source) => {
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
    const d = r.diagram
    return JSON.stringify({
      nodes: d.nodes.map((n) => n.id + '=' + (n.label ?? '')).sort(),
      edges: d.edges.map((e) => e.from + '->' + e.to + (e.label ? ':' + e.label : '') + '/' + (e.arrow ?? '-') + (e.dashed ? '+dash' : '')).sort(),
      // A boundary's id is the notation's own invention (PlantUML can alias it, Mermaid numbers it), so the model is
      // compared by what the reader sees: the label, the parent's label, and who it holds.
      groups: (d.groups ?? [])
        .map((g) => {
          const parent = g.parent === undefined ? 'root' : ((d.groups ?? []).find((other) => other.id === g.parent)?.label ?? g.parent)
          return parent + '/' + g.label + '[' + [...g.members].sort().join(',') + ']'
        })
        .sort(),
    })
  }
  const pairs = [
    [
      ['@startuml', 'component a', 'component b', 'a --> b : calls', '@enduml'].join('\n'),
      ['flowchart TD', '  a -->|calls| b'].join('\n'),
    ],
    [
      ['@startuml', 'component a', 'component b', 'a ..> b : uses', '@enduml'].join('\n'),
      ['flowchart TD', '  a -.->|uses| b'].join('\n'),
    ],
    [
      ['@startuml', 'component a', 'component b', 'a -- b', '@enduml'].join('\n'),
      ['flowchart TD', '  a --- b'].join('\n'),
    ],
    [
      ['@startuml', 'package "app" as app {', '  component a', '  component b', '}', 'component c', 'a --> c', '@enduml'].join('\n'),
      ['flowchart TD', '  subgraph app', '    a', '    b', '  end', '  a --> c'].join('\n'),
    ],
    [
      ['@startuml', 'state "idle" as idle', 'state "busy" as busy', '[*] --> idle', 'idle --> busy : start', '@enduml'].join('\n'),
      ['stateDiagram-v2', '  state "idle" as idle', '  state "busy" as busy', '  [*] --> idle', '  idle --> busy: start'].join('\n'),
    ],
    [
      // An edge that leaves its package, and one that stays inside it.
      ['@startuml', 'package "app" as app {', '  component a', '}', 'component b', 'a --> b : out', '@enduml'].join('\n'),
      ['flowchart TD', '  subgraph app', '    a', '  end', '  a -->|out| b'].join('\n'),
    ],
    [
      ['@startuml', 'package "app" as app {', '  component a', '  component b', '  a --> b', '}', '@enduml'].join('\n'),
      ['flowchart TD', '  subgraph app', '    a --> b', '  end'].join('\n'),
    ],
    [
      // A nested boundary keeps the name it was written with as its id, in either notation.
      ['@startuml', 'package "outer" as outer {', '  package "inner" as inner {', '    component a', '  }', '}', 'component b', 'a --> b', '@enduml'].join('\n'),
      ['flowchart TD', '  subgraph outer', '    subgraph inner', '      a', '    end', '  end', '  a --> b'].join('\n'),
    ],
  ]
  for (const [plant, mermaid] of pairs) {
    if (model(plant) !== model(mermaid)) {
      throw new Error('the notations disagree about: ' + plant.slice(0, 40).replace(/\n/g, ' '))
    }
  }
})

test('a thick line is refused in either notation', () => {
  const plant = render({ source: ['@startuml', 'component a', 'component b', 'a ==> b', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  const mermaid = render({ source: ['flowchart TD', '  a ==> b'].join('\n') }, {}, { scheme: 'default' })
  if (plant.refused.length !== 1) throw new Error('plantuml thick: ' + JSON.stringify(plant.refused))
  if (mermaid.refused.length !== 1) throw new Error('mermaid thick: ' + JSON.stringify(mermaid.refused))
  if (!mermaid.refused[0].includes('thick line')) throw new Error('mermaid refused a thick line for another reason: ' + mermaid.refused[0])
})

// The two notations state the same direction with different words, and the engine honours both: a reader who asks for a
// left-to-right picture gets one in either spelling.
test('a mermaid direction token turns the drawing the way plantuml does', () => {
  const rows = (notation) => {
    const source = notation === 'mermaid' ? 'flowchart LR\n  a --> b\n  b --> c' : '@startuml\nleft to right direction\ncomponent a\ncomponent b\ncomponent c\na --> b\nb --> c\n@enduml'
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error(notation + ' refused: ' + JSON.stringify(r.refused))
    const boxes = r.canvas.shapes.filter((shape) => shape.kind === 'box')
    return { rows: new Set(boxes.map((box) => box.y)).size, wide: r.canvas.width > r.canvas.height }
  }
  for (const notation of ['mermaid', 'plantuml']) {
    const turned = rows(notation)
    if (turned.rows !== 1) throw new Error(notation + ' did not turn the chain: ' + String(turned.rows) + ' rows')
    if (!turned.wide) throw new Error(notation + ' kept the portrait canvas')
  }
  const down = render({ source: 'flowchart TD\n  a --> b\n  b --> c' }, {}, { scheme: 'default' })
  const downBoxes = down.canvas.shapes.filter((shape) => shape.kind === 'box')
  if (new Set(downBoxes.map((box) => box.y)).size !== 3) throw new Error('the TD chain lost its rows')
})

// A boundary with nothing drawable inside it has no rectangle, and silence would leave a reader with a drawing that lost a
// line. It is refused by its own line, once - an edge refused against the same boundary already said it.
test('an empty boundary is refused by its line, and only once', () => {
  const alone = render({ source: ['@startuml', 'state "empty" as E {', '}', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (alone.refused.length !== 1) throw new Error('alone: ' + JSON.stringify(alone.refused))
  if (!alone.refused[0].startsWith('line 2:')) throw new Error('no line number: ' + alone.refused[0])
  if (!alone.refused[0].includes('nothing inside it')) throw new Error('wrong reason: ' + alone.refused[0])
  const withEdge = render(
    { source: ['@startuml', 'component a \' outside', 'state "empty" as E {', '}', 'a --> E', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (withEdge.refused.length !== 1) throw new Error('two lines for one defect: ' + JSON.stringify(withEdge.refused))
})

// A composite state is a boundary, and the notation says so with a solid outline: a package is dashed because it groups
// unrelated things, while a composite state is one state whose inside happens to be states.
test('a state block is a solid boundary, and a package is still dashed', () => {
  const composite = render(
    { source: ['@startuml', 'state "compound" as C {', '  state a', '  state b', '  a --> b', '}', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (composite.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(composite.refused))
  const group = (composite.diagram.groups ?? [])[0]
  if (group === undefined) throw new Error('the composite state is not a boundary')
  if (group.label !== 'compound') throw new Error('label: ' + String(group.label))
  if (JSON.stringify(group.members.slice().sort()) !== JSON.stringify(['a', 'b'])) throw new Error('members: ' + JSON.stringify(group.members))
  const shape = composite.canvas.shapes.find((entry) => entry.kind === 'group')
  if (shape?.outline !== 'solid') throw new Error('the composite state is not drawn solid')
  if (composite.markup.includes('stroke-dasharray')) throw new Error('a solid boundary was drawn dashed')
  const packaged = render(
    { source: ['@startuml', 'package "p" as p {', '  component a', '}', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (!packaged.markup.includes('stroke-dasharray')) throw new Error('a package lost its dashes')
})

// The hardest drawing in the acceptance gallery, pinned in the repository rather than in a scratch folder: a turned drawing
// with two packages, a `together` row inside one of them, a hidden edge, and three edges that cross a package border.
test('a turned drawing with nested packages keeps its edges out of its boxes', () => {
  const source = [
    '@startuml',
    'left to right direction',
    'package "ingress" as edge {',
    '  component "gateway" as gw',
    '}',
    'package "app" as app {',
    '  together {',
    '    component "orders" as order',
    '    component "stock" as sku',
    '  }',
    '}',
    'component "pricing" as price',
    'component "database" as db',
    'gw --> order',
    'gw --> sku',
    'order --> price : charge',
    'sku -[hidden]-> price',
    'price --> db : store',
    '@enduml',
  ].join('\n')
  const r = render({ source }, {}, { scheme: 'default' })
  if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
  if ((r.diagram.groups ?? []).length !== 2) throw new Error('groups: ' + String((r.diagram.groups ?? []).length))
  if (r.diagram.nodes.length !== 5) throw new Error('nodes: ' + String(r.diagram.nodes.length))
  const drawn = r.canvas.shapes.filter((shape) => shape.kind === 'path' || shape.kind === 'link')
  // The hidden edge is a placement, not a line: five edges, four of them drawn.
  if (drawn.length !== 4) throw new Error('drawn edges: ' + String(drawn.length))
  if (r.canvas.routingFailures.length !== 0) throw new Error('a route failed: ' + JSON.stringify(r.canvas.routingFailures))
  if (r.canvas.labelCollisions !== 0) throw new Error('labels collide: ' + String(r.canvas.labelCollisions))
  for (const shape of drawn) {
    if (shape.kind !== 'path') continue
    for (let index = 0; index + 1 < shape.points.length; index += 1) {
      const a = shape.points[index]
      const b = shape.points[index + 1]
      if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) throw new Error('a diagonal leg: ' + JSON.stringify([a, b]))
    }
  }
})

// Page furniture lives in page space, so the turn must not carry it into the drawing: a header went inside the drawing and the
// legend went off the right edge, and both captions landed on one line.
test('a turned drawing keeps its page furniture in page order', () => {
  const source = [
    '@startuml',
    'left to right direction',
    'header',
    '  internal',
    'end header',
    'component a',
    'component b',
    'a --> b',
    'legend',
    '  dashed means dependency',
    'end legend',
    'footer',
    '  revision 2',
    'end footer',
    '@enduml',
  ].join('\n')
  const r = render({ source }, {}, { scheme: 'default' })
  if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
  const header = r.canvas.shapes.find((shape) => shape.kind === 'header')
  const title = r.canvas.shapes.find((shape) => shape.kind === 'title')
  const legend = r.canvas.shapes.find((shape) => shape.kind === 'legend')
  const captions = r.canvas.shapes.filter((shape) => shape.kind === 'caption')
  const boxes = r.canvas.shapes.filter((shape) => shape.kind === 'box')
  if (header === undefined || title === undefined || legend === undefined || captions.length !== 2) {
    throw new Error('page furniture is missing: ' + JSON.stringify(r.canvas.shapes.map((shape) => shape.kind)))
  }
  const boxTop = Math.min(...boxes.map((box) => box.y))
  const boxBottom = Math.max(...boxes.map((box) => box.y + box.height))
  if (!(header.y < title.y && title.y < boxTop)) throw new Error('the top of the page is out of order')
  if (!(legend.y > boxBottom)) throw new Error('the legend is not under the drawing')
  if (!(captions[0].y > legend.y && captions[1].y > captions[0].y)) throw new Error('the captions are not stacked under the legend')
  for (const shape of [header, title, legend, ...captions]) {
    if (shape.x < 20 - 0.01) throw new Error('page furniture left the left margin: ' + String(shape.x))
  }
})

// The renderer's own caption is metadata: when the source wrote its own, the machine's line is not drawn - unless it carries
// the refusal count, which is the one thing an author's caption cannot say.
test('the machine caption is drawn only when it adds something', () => {
  const captions = (r) => r.canvas.shapes.filter((shape) => shape.kind === 'caption').flatMap((shape) => shape.lines)
  const bare = render({ source: ['@startuml', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (captions(bare).length !== 1 || !captions(bare)[0].startsWith('plantuml,')) throw new Error('bare: ' + JSON.stringify(captions(bare)))
  const authored = render({ source: ['@startuml', 'component a', 'caption Figure 1', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (JSON.stringify(captions(authored)) !== JSON.stringify(['Figure 1'])) throw new Error('authored: ' + JSON.stringify(captions(authored)))
  const refused = render({ source: ['@startuml', 'component a', 'cloud c', 'caption Figure 2', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  const drawn = captions(refused)
  if (drawn.length !== 2) throw new Error('a refusal count was dropped: ' + JSON.stringify(drawn))
  if (!drawn[1].includes('refused')) throw new Error('the second line: ' + String(drawn[1]))
  // The label beside the drawing still names both halves, drawn or not.
  const label = /aria-label="([^"]*)"/.exec(authored.markup)?.[1] ?? ''
  if (!label.includes('plantuml, 1 box')) throw new Error('label: ' + label)
})

// Text that needs escaping has to arrive escaped in every position it can appear in. The corpus had no such source, so a
// renderer that escaped only `<` passed the whole suite.
test('text that needs escaping survives in every position', () => {
  const sources = [
    ['@startuml', 'component "A & B" as a', 'component b', 'a --> b : x < y & z > w', '@enduml'].join('\n'),
    ['@startuml', 'title <draft> & "quoted"', 'header', '  R&D <lab>', 'end header', 'component a', '@enduml'].join('\n'),
    ['@startuml', 'package "R & D" as rd {', '  component a', '}', '@enduml'].join('\n'),
    ['@startuml', 'legend', '  x & y <z>', 'end legend', 'note right of a : 5 < 6 & 7 > 2', 'component a', '@enduml'].join('\n'),
    'flowchart LR\n  a[A & B] -->|x < y| b[z]',
  ]
  for (const source of sources) {
    const r = render({ source }, {}, { scheme: 'default' })
    // The document check runs inside `render`; this also names what the reader should see.
    for (const text of ['A &amp; B', 'x &lt; y', 'R &amp; D', '&lt;draft&gt;']) {
      if (source.includes(text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')) && !r.markup.includes(text)) {
        throw new Error('the escaped form is missing: ' + text)
      }
    }
  }
})

// A `title` statement names the drawing. It used to be skipped in silence, which left the caller's default in place.
test('a title statement names the drawing, on one line or in a block', () => {
  const single = render({ source: ['@startuml', 'title Architecture overview', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (single.diagram.title !== 'Architecture overview') throw new Error('title: ' + single.diagram.title)
  if (!single.markup.includes('Architecture overview')) throw new Error('the title was not drawn')
  const block = render(
    { source: ['@startuml', 'title', '  first line', '  second line', 'end title', 'component a', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (block.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(block.refused))
  if (block.diagram.title !== 'first line\nsecond line') throw new Error('block title: ' + JSON.stringify(block.diagram.title))
  const spans = (block.markup.match(/<tspan/g) ?? []).length
  if (spans < 2) throw new Error('the block title is not drawn as lines: ' + String(spans))
  // A title that names no text is not a title, and a one-line title is still the plain text it always was.
  const plain = render({ source: ['@startuml', 'title One', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (/<title/.test(plain.markup)) throw new Error('unreachable')
  if (plain.markup.includes('<tspan') && !plain.markup.includes('data-node-id')) throw new Error('a one-line title grew tspans')
  // The lines of a block title stay out of the graph, exactly as the page-text blocks do.
  // The label beside the drawing is an attribute, and an attribute cannot hold a line break: the lines are joined for it.
  const label = /aria-label="([^"]*)"/.exec(block.markup)?.[1] ?? ''
  if (label.includes('\n')) throw new Error('the label carries a line break: ' + JSON.stringify(label))
  if (!label.startsWith('first line \u00b7 second line')) throw new Error('label: ' + JSON.stringify(label))

  const sneaky = render({ source: ['@startuml', 'title', '  component ghost', 'end title', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (sneaky.diagram.nodes.length !== 1) throw new Error('a title line became a node: ' + JSON.stringify(sneaky.diagram.nodes.map((node) => node.id)))
})

// `scale N` is a delivery size: the picture is the same one, drawn larger. The viewBox has to stay the layout's, or every
// coordinate in the drawing would have to move and the two would drift apart.
test('a scale directive changes the delivered size, not the drawing', () => {
  const base = ['@startuml', 'component a', 'component b', 'a --> b', '@enduml'].join('\n')
  const scaled = ['@startuml', 'scale 2', 'component a', 'component b', 'a --> b', '@enduml'].join('\n')
  const plain = render({ source: base }, {}, { scheme: 'default' })
  const twice = render({ source: scaled }, {}, { scheme: 'default' })
  const head = (r) => /viewBox="0 0 ([0-9.]+) ([0-9.]+)" width="([0-9.]+)" height="([0-9.]+)"/.exec(r.markup)
  const a = head(plain)
  const b = head(twice)
  if (a === null || b === null) throw new Error('no size in the markup')
  if (b[1] !== a[1] || b[2] !== a[2]) throw new Error('the viewBox moved: ' + JSON.stringify([a.slice(1, 3), b.slice(1, 3)]))
  if (Number(b[3]) !== Number(a[3]) * 2 || Number(b[4]) !== Number(a[4]) * 2) throw new Error('the delivered size: ' + JSON.stringify([a.slice(3), b.slice(3)]))
  // Nothing inside the drawing moved: the first box sits at the same coordinates in both.
  const box = (r) => r.canvas.shapes.find((shape) => shape.kind === 'box')
  if (box(plain).x !== box(twice).x || box(plain).y !== box(twice).y) throw new Error('the drawing was laid out again')
  // Two forms the notation allows and this renderer does not: out of range, and sizing by width and height.
  const tooBig = render({ source: ['@startuml', 'scale 20', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (!tooBig.refused[0]?.includes('0.5 to 8')) throw new Error('out of range: ' + JSON.stringify(tooBig.refused))
  const bySize = render({ source: ['@startuml', 'scale 200 width', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (!bySize.refused[0]?.includes('`scale 2` is the form')) throw new Error('by size: ' + JSON.stringify(bySize.refused))
})

// Every directive the renderer does not act on says *why*, and an include is refused rather than dropped: a drawing that is
// missing everything a file held looks complete, which is the one thing a report must not do.
test('a directive that has no effect says which kind it is', () => {
  const reasons = {
    '!define FOO 1': 'preprocessor directive',
    '!theme plain': 'preprocessor directive',
    'allowmixing': 'mixing diagram families',
    'together': 'names no boxes',
    '!pragma layout smetana': 'is a layout control',
  }
  for (const [line, reason] of Object.entries(reasons)) {
    const r = render({ source: ['@startuml', line, 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error(line + ' was refused: ' + JSON.stringify(r.refused))
    if (r.ignored.length !== 1) throw new Error(line + ': ignored ' + JSON.stringify(r.ignored))
    if (!r.ignored[0].includes(reason)) throw new Error(line + ': ' + r.ignored[0])
  }
  const included = render({ source: ['@startuml', '!include common.puml', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (included.refused.length !== 1) throw new Error('an include was not refused: ' + JSON.stringify(included.refused))
  if (!included.refused[0].includes('would be missing')) throw new Error('the include reason: ' + included.refused[0])
  // A directive that is honoured must not also be reported as ignored.
  const scaled = render({ source: ['@startuml', 'scale 2', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (scaled.ignored.length !== 0) throw new Error('an honoured scale was also ignored: ' + JSON.stringify(scaled.ignored))
})

// A skinparam that asks for what the renderer already does is not styling it lacks, and one that asks for a different line
// style is not about the palette. Both answers name the thing asked for.
test('a skinparam that is already satisfied says so', () => {
  const ortho = render({ source: ['@startuml', 'skinparam linetype ortho', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (!ortho.ignored[0]?.includes('orthogonal lines, which is what every edge here is already')) {
    throw new Error('ortho: ' + JSON.stringify(ortho.ignored))
  }
  const polyline = render({ source: ['@startuml', 'skinparam linetype polyline', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (!polyline.ignored[0]?.includes('line style are fixed')) throw new Error('polyline: ' + JSON.stringify(polyline.ignored))
})

// A `hide` directive names something this renderer never draws. Saying "layout control" about it was the wrong reason: it
// arranges nothing, and a reader was told to look in the wrong place.
test('a hide directive says there is nothing to hide, not that it is a layout control', () => {
  for (const line of ['hide empty members', 'hide stereotype', 'hide circle']) {
    const r = render({ source: ['@startuml', line, 'class Order', '@enduml'].join('\n') }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error(line + ' was refused: ' + JSON.stringify(r.refused))
    if (r.ignored.length !== 1) throw new Error(line + ': ignored ' + JSON.stringify(r.ignored))
    if (!r.ignored[0].includes('no compartments')) throw new Error(line + ': ' + r.ignored[0])
  }
  // A real layout control keeps its own reason.
  const layout = render({ source: ['@startuml', 'top to bottom direction', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (!layout.ignored[0]?.includes('is a layout control')) throw new Error('layout: ' + JSON.stringify(layout.ignored))
})

// A background colour is paper, not arrangement, so it is honoured; a font size is a type scale this renderer does not have,
// and saying "layout control" about it was the wrong reason.
test('a background colour is drawn, and styling skinparams say why they are not', () => {
  const painted = render(
    { source: ['@startuml', 'skinparam backgroundColor #eef4ff', 'component a', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (painted.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(painted.refused))
  const root = /<rect x="0" y="0"[^>]*fill="([^"]+)"/.exec(painted.markup)
  if (root?.[1] !== '#eef4ff') throw new Error('the canvas is ' + String(root?.[1]))
  const plain = render({ source: ['@startuml', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (/<rect x="0" y="0"[^>]*fill="#eef4ff"/.test(plain.markup)) throw new Error('a drawing without a background took one')
  const styled = render(
    { source: ['@startuml', 'skinparam DefaultFontSize 20', 'component a', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (styled.ignored.length !== 1) throw new Error('ignored: ' + JSON.stringify(styled.ignored))
  if (!styled.ignored[0].includes('type scale')) throw new Error('the reason: ' + styled.ignored[0])
  const wrong = render({ source: ['@startuml', 'skinparam backgroundColor blue', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (wrong.refused.length !== 1 || !wrong.refused[0].includes('#rgb')) throw new Error('a named colour: ' + JSON.stringify(wrong.refused))
})

// A block whose closing line is missing swallows the source; the drawing has to say so rather than come out nearly empty.
test('an unclosed block is refused by the line that opened it', () => {
  const source = ['@startuml', 'header', '  internal', 'component a', '@enduml'].join('\n')
  const r = render({ source }, {}, { scheme: 'default' })
  if (r.refused.length !== 1) throw new Error('refused: ' + JSON.stringify(r.refused))
  if (!r.refused[0].startsWith('line 2:')) throw new Error('wrong line: ' + r.refused[0])
  if (!r.refused[0].includes('never closed')) throw new Error('wrong reason: ' + r.refused[0])
  // The three kinds of block are walked the same way, so all three report it.
  for (const open of ['legend', 'note right of a']) {
    const other = render({ source: ['@startuml', 'component a', open, '  text', '@enduml'].join('\n') }, {}, { scheme: 'default' })
    if (!other.refused.some((entry) => entry.includes('never closed'))) throw new Error(open + ': ' + JSON.stringify(other.refused))
  }
})

// The block form of the page text is text, not diagram lines: a footer whose line reads `component ghost` must not grow a
// box, and a header of two lines must take the room of two.
test('a page-text block is text, not diagram lines', () => {
  const source = [
    '@startuml',
    'header',
    '  internal',
    '  component ghost',
    'end header',
    'component a',
    'footer',
    '  revised',
    '  a --> b',
    'end footer',
    '@enduml',
  ].join('\n')
  const r = render({ source }, {}, { scheme: 'default' })
  if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
  if (r.diagram.nodes.length !== 1) throw new Error('a page-text line became a node: ' + JSON.stringify(r.diagram.nodes.map((node) => node.id)))
  if (r.diagram.edges.length !== 0) throw new Error('a page-text line became an edge: ' + String(r.diagram.edges.length))
  if (JSON.stringify(r.diagram.header) !== JSON.stringify(['internal', 'component ghost'])) throw new Error('header lines: ' + JSON.stringify(r.diagram.header))
  if (JSON.stringify(r.diagram.footer) !== JSON.stringify(['revised', 'a --> b'])) throw new Error('footer lines: ' + JSON.stringify(r.diagram.footer))
  const headerShape = r.canvas.shapes.find((shape) => shape.kind === 'header')
  const title = r.canvas.shapes.find((shape) => shape.kind === 'title')
  if (headerShape === undefined || title === undefined) throw new Error('the header or the title is missing')
  // The title has to clear the *last* line the header drew, not just the first: a header of two lines one band tall puts the
  // title on top of its second line, which is a defect a weaker assertion passes.
  const lastHeaderLine = headerShape.y + (headerShape.lines.length - 1) * 15
  if (!(title.y >= lastHeaderLine + 6)) throw new Error('the title sits on the last header line')
})

// Page text in the source's own words: a header above the drawing pushes it down, a caption and a footer sit under it.
test('page text in the source is drawn, and it moves the drawing only when it must', () => {
  const bare = render({ source: ['@startuml', 'component a', 'component b', 'a --> b', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  const dressed = render(
    {
      source: ['@startuml', 'header internal', 'component a', 'component b', 'a --> b', 'caption figure one', 'footer revised', '@enduml'].join('\n'),
    },
    {},
    { scheme: 'default' },
  )
  if (dressed.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(dressed.refused))
  for (const text of ['internal', 'figure one', 'revised']) {
    if (!dressed.markup.includes(text)) throw new Error('the page text is missing: ' + text)
  }
  const boxOf = (r) => r.canvas.shapes.filter((shape) => shape.kind === 'box')[0]
  if (!(boxOf(dressed).y > boxOf(bare).y)) throw new Error('a header did not push the drawing down')
  // Without page text the drawing is the one it always was: the band is only reserved when there is something to put in it.
  if (bare.markup.includes('internal')) throw new Error('a drawing without page text grew one')
})

// A legend is page furniture. The metamorphic point is what it does *not* do: an arrow written inside it is text, not
// an edge, and it takes no part in the layout.
test('a legend block is text under the drawing, not lines in it', () => {
  const withLegend = render(
    {
      source: [
        '@startuml',
        'component A',
        'component B',
        'A --> B',
        'legend',
        '  solid: a call',
        '  dashed: an event',
        '  A --> B',
        'end legend',
        '@enduml',
      ].join('\n'),
    },
    {},
    { scheme: 'default' },
  )
  if (withLegend.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(withLegend.refused))
  if (withLegend.diagram.edges.length !== 1) {
    throw new Error('the arrow inside the legend became an edge: ' + String(withLegend.diagram.edges.length))
  }
  if ((withLegend.diagram.legend ?? []).length !== 3) {
    throw new Error('the legend lines were not kept: ' + JSON.stringify(withLegend.diagram.legend))
  }
  if (!withLegend.markup.includes('dashed: an event')) throw new Error('the legend is not drawn')
  const withoutLegend = render({ source: ['@startuml', 'component A', 'component B', 'A --> B', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (withLegend.markup === withoutLegend.markup) throw new Error('the legend changed nothing')
  const corner = render({ source: ['@startuml', 'component A', 'legend right', '  note', 'end legend', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (corner.ignored.length !== 1) throw new Error('a legend corner was not reported: ' + JSON.stringify(corner.ignored))
})

// A boundary, a control and a collections box are rectangles whose role is a small mark in the corner.
test('a role box draws the mark that names its role', () => {
  const source = ['@startuml', 'boundary "b" as b', 'control "c" as c', 'collections "col" as col', 'component core', 'b --> core', '@enduml'].join('\n')
  const r = render({ source }, {}, { scheme: 'default' })
  if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
  const shapeOf = (id) => r.diagram.nodes.find((node) => node.id === id)?.shape
  for (const [id, shape] of [['b', 'boundary'], ['c', 'control'], ['col', 'collections']]) {
    if (shapeOf(id) !== shape) throw new Error(id + ' is not a ' + shape + ': ' + String(shapeOf(id)))
  }
  if (!r.markup.includes('<circle')) throw new Error('the control has no glyph')
  const marks = (r.markup.match(/<line /g) ?? []).length + (r.markup.match(/<rect /g) ?? []).length
  if (marks < 5) throw new Error('the role marks are missing: ' + String(marks))
})

// A queue, a stack and a storage are one rectangle whose edge says what it holds: an arc, two shelves, a curve.
test('a queue, a stack and a storage draw their own edge', () => {
  const source = ['@startuml', 'queue "q" as q', 'stack "s" as s', 'storage "o" as o', 'component A', 'A --> q', 'A --> s', 'A --> o', '@enduml'].join('\n')
  const r = render({ source }, {}, { scheme: 'default' })
  if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
  const shapeOf = (id) => r.diagram.nodes.find((node) => node.id === id)?.shape
  for (const [id, shape] of [['q', 'queue'], ['s', 'stack'], ['o', 'storage']]) {
    if (shapeOf(id) !== shape) throw new Error(id + ' is not a ' + shape + ': ' + String(shapeOf(id)))
  }
  if (!r.markup.includes(' A')) throw new Error('the queue has no rounded cap')
  if (!r.markup.includes(' Q')) throw new Error('the storage has no curved crown')
  const cloud = render({ source: ['@startuml', 'cloud Network', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (cloud.refused.length !== 1) throw new Error('a cloud was not refused: ' + JSON.stringify(cloud.refused))
})

// A file, a card and a frame each carry a mark that says what they are: the mark is drawn, and a keyword the renderer
// has no mark for stays refused.
test('a file, a card and a frame draw their own marks', () => {
  const source = ['@startuml', 'file "config" as config', 'card "payment" as card', 'frame "timeout" as policy', 'component A', 'A --> config', '@enduml'].join('\n')
  const r = render({ source }, {}, { scheme: 'default' })
  if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
  const shapeOf = (id) => r.diagram.nodes.find((node) => node.id === id)?.shape
  for (const [id, shape] of [['config', 'file'], ['card', 'card'], ['policy', 'frame']]) {
    if (shapeOf(id) !== shape) throw new Error(id + ' is not a ' + shape + ': ' + String(shapeOf(id)))
  }
  if ((r.markup.match(/<polygon/g) ?? []).length < 2) throw new Error('the folded marks are missing')
  const cloud = render({ source: ['@startuml', 'cloud Network', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (cloud.refused.length !== 1) throw new Error('a cloud was not refused: ' + JSON.stringify(cloud.refused))
})

// The block form of a placed note: its body is the note's words, not diagram lines. The lines are joined into one paragraph,
// because a box carries one paragraph and the note wraps it.
test('a note block carries its lines as text', () => {
  const source = ['@startuml', 'component a', 'note right of a', '  first line', '  component ghost', 'end note', '@enduml'].join('\n')
  const r = render({ source }, {}, { scheme: 'default' })
  if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
  const ids = r.diagram.nodes.map((node) => node.id).sort()
  if (JSON.stringify(ids) !== JSON.stringify(['a', 'note-a'])) throw new Error('nodes: ' + JSON.stringify(ids))
  const note = r.diagram.nodes.find((node) => node.id === 'note-a')
  if (note?.label !== 'first line component ghost') throw new Error('the block text: ' + String(note?.label))
  if (note.shape !== 'note') throw new Error('the block lost its fold')
  if (!r.markup.includes('first line component ghost')) throw new Error('the note was not drawn')
})

// A style, an interaction or an accessibility directive changes nothing this renderer draws. Refusing it reported a refusal while
// the message said the renderer ignores it - two answers in one line.
test('a Mermaid style directive is dropped with a reason, not refused', () => {
  const cases = {
    classDef: ['classDef warn fill:#f00', 'is a style this renderer does not have'],
    style: ['style a fill:#0f0', 'is a style this renderer does not have'],
    linkStyle: ['linkStyle 0 stroke:#00f', 'changes an edge line style'],
    click: ['click a callback', 'is an interaction'],
    accTitle: ['accTitle: My chart', 'is accessibility metadata'],
  }
  for (const [name, [line, reason]] of Object.entries(cases)) {
    const r = render({ source: ['flowchart TD', '  a --> b', '  ' + line].join('\n'), notation: 'mermaid' }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error(name + ' was refused: ' + JSON.stringify(r.refused))
    if (r.ignored.length !== 1) throw new Error(name + ': ignored ' + JSON.stringify(r.ignored))
    if (!r.ignored[0].includes(reason)) throw new Error(name + ': ' + r.ignored[0])
    if (r.diagram.edges.length !== 1) throw new Error(name + ' lost the drawing')
  }
})

// `%%{init: {...}}%%` is a configuration block, and Mermaid allows it over several lines. Its body is not diagram source, so reading
// it line by line refused a block the notation explicitly allows.
test('a Mermaid configuration block is skipped and reported', () => {
  const oneLine = render({ source: '%%{init: {"theme": "dark"}}%%\nflowchart TD\n  a --> b', notation: 'mermaid' }, {}, { scheme: 'default' })
  const many = render({ source: '%%{init: {\n  "theme": "dark"\n}}%%\nflowchart TD\n  a --> b', notation: 'mermaid' }, {}, { scheme: 'default' })
  for (const [name, r] of [['one line', oneLine], ['several lines', many]]) {
    if (r.refused.length !== 0) throw new Error(name + ' refused: ' + JSON.stringify(r.refused))
    if (r.diagram.nodes.length !== 2 || r.diagram.edges.length !== 1) throw new Error(name + ' lost the drawing')
    if (r.ignored.length !== 1 || !r.ignored[0].includes('configuration block does not change the drawing')) {
      throw new Error(name + ' note: ' + JSON.stringify(r.ignored))
    }
  }
})

// `X --> [*]` leaves the machine. Read as an endpoint it would draw a box called `*`; read as leaving it is a self-loop, drawn dashed,
// labelled `end` when the source wrote no label. The unit suite decides the plan; this decides the drawing that comes of it.
test('an exit marker closes on its source and is drawn dashed', () => {
  const r = render({ source: ['@startuml', 'state a', 'a --> [*]'].join('\n') }, {}, { scheme: 'default' })
  if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
  if (r.diagram.nodes.some((node) => node.id === '*')) throw new Error('the marker became a box')
  const edge = r.diagram.edges.find((candidate) => candidate.from === 'a' && candidate.to === 'a')
  if (edge === undefined) throw new Error('no self-loop: ' + JSON.stringify(r.diagram.edges))
  if (edge.label !== 'end') throw new Error('label: ' + String(edge.label))
  if (edge.dashed !== true) throw new Error('the exit is drawn solid')
  const drawn = r.canvas.shapes.filter((shape) => shape.kind === 'path')
  if (!drawn.some((shape) => shape.points.length > 2)) throw new Error('no routed self-loop')
})

// `a -[#blue]-> b` asks for a line style. Read as none of the edge forms it became one element named after the whole line - a fourth
// answer, and the worst one: a box nobody wrote.
test('a styled arrow is drawn as an edge and its style is reported', () => {
  const r = render({ source: ['@startuml', 'component a', 'component b', 'a -[#blue]-> b : uses'].join('\n') }, {}, { scheme: 'default' })
  if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
  if (r.diagram.nodes.length !== 2) throw new Error('boxes: ' + String(r.diagram.nodes.length))
  if (r.diagram.edges.length !== 1) throw new Error('edges: ' + String(r.diagram.edges.length))
  if (r.diagram.edges[0].label !== 'uses') throw new Error('label: ' + String(r.diagram.edges[0].label))
  if (r.ignored.length !== 1 || !r.ignored[0].includes('`#blue` is a line style')) throw new Error('ignored: ' + JSON.stringify(r.ignored))
})

// Four lines that are not statements, each of which used to become something wrong: `...` was read as an arrow between two elements
// called `.`, `note on link` declared an element named after itself, and a lifetime event was refused as a sequence statement.
test('a divider, a lifetime event and a note on a link are each answered for what they are', () => {
  const draw = (lines) => render({ source: ['@startuml', 'component a', 'component b', ...lines, '@enduml'].join('\n') }, {}, { scheme: 'default' })
  for (const divider of ['...', '--', '== section ==']) {
    const r = draw([divider])
    if (r.refused.length !== 0) throw new Error(divider + ' refused: ' + JSON.stringify(r.refused))
    if (r.ignored.length !== 1 || !r.ignored[0].includes('divides a text document')) throw new Error(divider + ': ' + JSON.stringify(r.ignored))
    if (r.diagram.nodes.length !== 2) throw new Error(divider + ' drew ' + String(r.diagram.nodes.length) + ' boxes')
    if (r.diagram.edges.length !== 0) throw new Error(divider + ' drew an edge')
  }
  const lifetime = draw(['activate a'])
  if (lifetime.refused.length !== 1 || !lifetime.refused[0].includes('lifeline event')) throw new Error(JSON.stringify(lifetime.refused))
  const onLink = draw(['a --> b', 'note on link : retry'])
  if (onLink.refused.length !== 1 || !onLink.refused[0].includes('no line here can name one')) throw new Error(JSON.stringify(onLink.refused))
  if (onLink.diagram.nodes.length !== 2) throw new Error('the note declared an element: ' + JSON.stringify(onLink.diagram.nodes.map((n) => n.id)))
  const fragment = draw(['alt one'])
  if (!fragment.refused[0].includes('sequence fragment')) throw new Error(JSON.stringify(fragment.refused))
})

// A Mermaid state diagram carries three constructs the PlantUML reader already had: a composite state, a state type, and a note
// beside a state. Each was refused as a line the renderer could not draw, in one notation only.
test('a Mermaid state keeps its composite, its type and its note', () => {
  const composite = render({ source: ['stateDiagram-v2', '[*] --> Busy', 'state Busy {', '  [*] --> Inner', '}', 'Busy --> Done'].join('\n'), notation: 'mermaid' }, {}, { scheme: 'default' })
  if (composite.refused.length !== 0) throw new Error('composite refused: ' + JSON.stringify(composite.refused))
  const group = (composite.diagram.groups ?? [])[0]
  if (group?.label !== 'Busy' || JSON.stringify(group?.members) !== JSON.stringify(['Inner'])) throw new Error('group: ' + JSON.stringify(group))
  if (!(composite.diagram.nodes ?? []).some((node) => node.id === 'Inner')) throw new Error('the inner state is missing')
  // The composite state is the boundary: no box of the same name is drawn beside it.
  if (composite.canvas.shapes.some((shape) => shape.kind === 'box' && shape.id === 'Busy')) throw new Error('a box and a boundary share the name Busy')
  const typed = render({ source: ['stateDiagram-v2', 'state fork <<choice>>', '[*] --> fork'].join('\n'), notation: 'mermaid' }, {}, { scheme: 'default' })
  if (typed.refused.length !== 0) throw new Error('a state type was refused: ' + JSON.stringify(typed.refused))
  if (typed.ignored.length !== 1 || !typed.ignored[0].includes('state type this renderer does not draw')) {
    throw new Error('the type note: ' + JSON.stringify(typed.ignored))
  }
  const noted = render({ source: ['stateDiagram-v2', '[*] --> Busy', 'note right of Busy : queued'].join('\n'), notation: 'mermaid' }, {}, { scheme: 'default' })
  if (noted.refused.length !== 0) throw new Error('a placed note was refused: ' + JSON.stringify(noted.refused))
  const note = (noted.diagram.nodes ?? []).find((node) => node.shape === 'note')
  if (note?.label !== 'queued') throw new Error('the note: ' + JSON.stringify(note))
  // The placement edge is hidden: the note is beside the state, not wired to it.
  if (noted.canvas.shapes.some((shape) => shape.kind === 'path' || shape.kind === 'link')) throw new Error('the placement edge was drawn')
})

// A subgraph with nothing inside it has no rectangle, and the two notations answer alike: refused by its own line, not dropped
// at paint time without a word.
test('an empty subgraph is refused by its line, in either notation', () => {
  const mermaid = render({ source: 'flowchart TD\nsubgraph one\nend\na --> c', notation: 'mermaid' }, {}, { scheme: 'default' })
  if (mermaid.refused.length !== 1) throw new Error('mermaid: ' + JSON.stringify(mermaid.refused))
  if (!mermaid.refused[0].startsWith('line 2:')) throw new Error('the line: ' + mermaid.refused[0])
  if (!mermaid.refused[0].includes('nothing inside it')) throw new Error('the reason: ' + mermaid.refused[0])
  if (mermaid.canvas.shapes.some((shape) => shape.kind === 'group')) throw new Error('an empty group was drawn')
  const plantuml = render({ source: ['@startuml', 'package p {', '}', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (plantuml.refused.length !== 1 || !plantuml.refused[0].includes('nothing inside it')) {
    throw new Error('plantuml: ' + JSON.stringify(plantuml.refused))
  }
})

// A Mermaid subgraph can be named three ways, and a per-subgraph direction is a hint this renderer drops rather than refuses.
test('a Mermaid subgraph keeps its label however it is named', () => {
  const forms = {
    plain: 'subgraph one',
    quoted: 'subgraph "Group A"',
    bracketed: 'subgraph id1["Group A"]',
  }
  for (const [name, opener] of Object.entries(forms)) {
    const source = ['flowchart TD', opener, '  a --> b', 'end', 'a --> c'].join('\n')
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error(name + ' refused: ' + JSON.stringify(r.refused))
    const group = (r.diagram.groups ?? [])[0]
    const expected = name === 'plain' ? 'one' : 'Group A'
    if (group?.label !== expected) throw new Error(name + ' label: ' + String(group?.label))
    if (JSON.stringify(group?.members) !== JSON.stringify(['a', 'b'])) throw new Error(name + ' members: ' + JSON.stringify(group?.members))
  }
  // `direction` inside a subgraph is a hint, not a line the renderer cannot read.
  const directed = render({ source: ['flowchart TD', 'subgraph one', '  direction LR', '  a --> b', 'end'].join('\n') }, {}, { scheme: 'default' })
  if (directed.refused.length !== 0) throw new Error('a subgraph direction was refused: ' + JSON.stringify(directed.refused))
  if (directed.ignored.length !== 1 || !directed.ignored[0].includes('one direction per drawing')) {
    throw new Error('the direction note: ' + JSON.stringify(directed.ignored))
  }
})

// How a source is written - its line endings, its indentation, a byte-order mark - must not change what it draws. Measured, all of
// them already draw the same picture; the case keeps it that way, because a parser that trims one place and not another is exactly
// how a source stops being portable.
test('the way a source is written does not change the drawing', () => {
  const base = ['@startuml', 'component gateway', 'component orders', 'gateway --> orders : retry', '@enduml'].join('\n')
  const variants = {
    crlf: base.replace(/\n/g, '\r\n'),
    mixed: base.replace('\n', '\r\n'),
    trailingSpaces: base.replace(/\n/g, '   \n'),
    tabs: base.replace(/^component /gm, '\tcomponent '),
    bom: '\ufeff' + base,
    blankLines: base.replace(/\n/g, '\n\n'),
    finalNewline: base + '\n',
  }
  const reference = render({ source: base }, {}, { scheme: 'default' }).markup
  for (const [name, source] of Object.entries(variants)) {
    const drawn = render({ source }, {}, { scheme: 'default' }).markup
    if (drawn !== reference) throw new Error(name + ' draws a different picture')
  }
})

// `/' ... '/` is a comment, not a defect: its lines are text, and a reader who writes one should not be told twice that it is
// undrawable.
test('a block comment is skipped, not refused', () => {
  const r = render({ source: ['@startuml', "/' a note to self", "still a note '/", 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
  if (JSON.stringify(r.diagram.nodes.map((node) => node.id)) !== JSON.stringify(['a'])) throw new Error('nodes: ' + JSON.stringify(r.diagram.nodes.map((node) => node.id)))
  // The single-line form and a trailing apostrophe are comments too.
  const inline = render({ source: ['@startuml', "' a comment", 'component a', "component b ' and a trailing one", '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (inline.refused.length !== 0) throw new Error('inline: ' + JSON.stringify(inline.refused))
  if (JSON.stringify(inline.diagram.nodes.map((node) => node.id)) !== JSON.stringify(['a', 'b'])) throw new Error('inline nodes: ' + JSON.stringify(inline.diagram.nodes.map((node) => node.id)))
})

// A line's punctuation is not part of a name, a statement separator this renderer does not read is refused, and a source with
// nothing in it says so. All three used to be silent or folded into a name.
test('punctuation and empty sources are answered, not folded in', () => {
  const comma = render({ source: ['@startuml', 'component a,', 'component b', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (JSON.stringify(comma.diagram.nodes.map((node) => node.id)) !== JSON.stringify(['a', 'b'])) {
    throw new Error('the comma: ' + JSON.stringify(comma.diagram.nodes.map((node) => node.id)))
  }
  if (comma.ignored.length !== 1 || !comma.ignored[0].includes('statement-end comma')) throw new Error('comma note: ' + JSON.stringify(comma.ignored))
  const semi = render({ source: ['@startuml', 'component a; component b', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (semi.refused.length !== 1 || !semi.refused[0].includes('one statement per line')) throw new Error('semicolon: ' + JSON.stringify(semi.refused))
  if (semi.diagram.nodes.length !== 0) throw new Error('a semicolon line became an element')
  for (const source of ['', '@startuml\n@enduml', 'flowchart']) {
    const empty = render({ source }, {}, { scheme: 'default' })
    if (empty.refused.length === 0) throw new Error('a source with nothing in it said nothing: ' + JSON.stringify(source))
    if (!empty.refused[0].includes('no diagram')) throw new Error('the reason: ' + empty.refused[0])
  }
})

// `together { a b }` names boxes without declaring them, and a block that keeps nothing on one row says so.
test('a together block names its boxes, and says when it names none', () => {
  const bare = render({ source: ['@startuml', 'together {', '  a', '  b', '}', 'a --> b', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (bare.refused.length !== 0) throw new Error('bare names refused: ' + JSON.stringify(bare.refused))
  if (JSON.stringify(bare.diagram.sameRank) !== JSON.stringify([['a', 'b']])) throw new Error('row: ' + JSON.stringify(bare.diagram.sameRank))
  const empty = render({ source: ['@startuml', 'together {', '}', 'component a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (empty.ignored.length !== 1 || !empty.ignored[0].includes('names no boxes')) throw new Error('empty: ' + JSON.stringify(empty.ignored))
  // A brace inside the block - a nested `together`, a boundary - is not the block's own end.
  const nested = render(
    { source: ['@startuml', 'together {', '  component a', '  together {', '    component b', '  }', '}', 'a --> b', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (JSON.stringify(nested.diagram.sameRank) !== JSON.stringify([['a', 'b']])) throw new Error('nested row: ' + JSON.stringify(nested.diagram.sameRank))
  const boxed = render(
    { source: ['@startuml', 'together {', '  package p {', '    component a', '  }', '  component b', '}', 'a --> b', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (JSON.stringify(boxed.diagram.sameRank) !== JSON.stringify([['a', 'b']])) throw new Error('boxed row: ' + JSON.stringify(boxed.diagram.sameRank))

  const lonely = render({ source: ['@startuml', 'together {', '  component a', '}', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (lonely.ignored.length !== 1 || !lonely.ignored[0].includes('names one box')) throw new Error('one: ' + JSON.stringify(lonely.ignored))
})

// A boundary's stereotype or colour is a decoration on it, not part of its name: left in the label, the alias was lost and the
// boundary could not be named by an edge or by its own members.
test('a boundary keeps its name through a stereotype and a colour', () => {
  for (const [line, expected] of [['package p <<layer>> {', 'p'], ['package p #lightblue {', 'p']]) {
    const r = render({ source: ['@startuml', line, '  component a', '}', '@enduml'].join('\n') }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error(line + ' refused: ' + JSON.stringify(r.refused))
    const group = (r.diagram.groups ?? [])[0]
    if (group?.label !== expected) throw new Error(line + ' label: ' + String(group?.label))
    if (r.ignored.length !== 1 || !/is a (stereotype|colour)/.test(r.ignored[0])) {
      throw new Error(line + ' ignored: ' + JSON.stringify(r.ignored))
    }
    // The label is how an edge names a boundary with no alias.
    const wired = render({ source: ['@startuml', line, '  component a', '}', 'component outside', 'outside --> p', '@enduml'].join('\n') }, {}, { scheme: 'default' })
    if (wired.diagram.edges.length !== 1) throw new Error(line + ' could not be named by an edge: ' + JSON.stringify(wired.refused))
  }
})

// An arrow's endpoints can carry a cardinality, a colour or a stereotype, and none of them is a name. One dash is an arrow.
test('an endpoint keeps its name through a cardinality and a colour', () => {
  const cases = {
    cardinality: 'a "1" --> "*" b',
    colour: 'a #red --> b',
    stereotype: 'a <<entity>> --> b',
  }
  for (const [name, line] of Object.entries(cases)) {
    const r = render({ source: ['@startuml', 'component a', 'component b', line, '@enduml'].join('\n') }, {}, { scheme: 'default' })
    const edge = r.diagram.edges[0]
    if (edge === undefined) throw new Error(name + ' was not read: ' + JSON.stringify(r.refused))
    if (edge.from !== 'a' || edge.to !== 'b') throw new Error(name + ': ' + JSON.stringify([edge.from, edge.to]))
  }
  // The shortest arrow the notation allows is still an arrow, and a mark at both ends is still refused.
  const shortest = render({ source: ['@startuml', 'component a', 'component b', 'a -> b', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (shortest.refused.length !== 0 || shortest.diagram.edges.length !== 1) throw new Error('a one-dash arrow: ' + JSON.stringify(shortest.refused))
  const both = render({ source: ['@startuml', 'component a', 'component b', 'a <--> b', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (both.refused.length !== 1 || !both.refused[0].includes('both ends')) throw new Error('a two-ended arrow: ' + JSON.stringify(both.refused))
})

// A declaration with a colour or a stereotype used to take the whole line as its name: the alias stopped matching, and the
// element was created with an id nobody could point at. A description line is a body, and a body is refused by line.
test('a colour or a stereotype does not become part of the name', () => {
  const stereotype = render({ source: ['@startuml', 'component "网关" as gw <<service>>', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  const node = stereotype.diagram.nodes[0]
  if (node?.id !== 'gw' || node?.label !== '网关') throw new Error('the stereotype became the name: ' + JSON.stringify([node?.id, node?.label]))
  if (stereotype.ignored.length !== 1 || !stereotype.ignored[0].includes('stereotype this renderer does not draw')) {
    throw new Error('the stereotype note: ' + JSON.stringify(stereotype.ignored))
  }
  const coloured = render({ source: ['@startuml', 'state S #lightblue', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (coloured.diagram.nodes[0]?.id !== 'S') throw new Error('the colour became the name: ' + String(coloured.diagram.nodes[0]?.id))
  if (coloured.ignored.length !== 1) throw new Error('the colour note: ' + JSON.stringify(coloured.ignored))
  const described = render({ source: ['@startuml', 'state S : entry / go', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (described.refused.length !== 1) throw new Error('a description line: ' + JSON.stringify(described.refused))
  if (!described.refused[0].includes('adds a description line')) throw new Error('the reason: ' + described.refused[0])
  if (described.diagram.nodes.length !== 0) throw new Error('a description line became an element')
})

// Three things a note's own syntax says that this renderer used to lose: an alias with a body, a fill colour, and a line break.
test('a note keeps its words through an alias, a colour and a break', () => {
  const blocks = {
    'note as N': ['note as N', '  the body', 'end note'],
  }
  for (const [name, lines] of Object.entries(blocks)) {
    const r = render({ source: ['@startuml', 'component a', ...lines, '@enduml'].join('\n') }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error(name + ' refused: ' + JSON.stringify(r.refused))
    const note = r.diagram.nodes.find((node) => node.shape === 'note')
    if (note?.label !== 'the body') throw new Error(name + ' label: ' + String(note?.label))
  }
  const coloured = render({ source: ['@startuml', 'note "x" as N #lightblue', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  const colouredNote = coloured.diagram.nodes.find((node) => node.shape === 'note')
  if (colouredNote?.label !== 'x') throw new Error('a colour took the text: ' + String(colouredNote?.label))
  if (coloured.ignored.length !== 1 || !coloured.ignored[0].includes('palette is fixed')) throw new Error('the colour: ' + JSON.stringify(coloured.ignored))
  const broken = render({ source: ['@startuml', 'note "first\\nsecond" as N', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  const brokenNote = broken.diagram.nodes.find((node) => node.shape === 'note')
  if (brokenNote?.label !== 'first\nsecond') throw new Error('the break: ' + JSON.stringify(brokenNote?.label))
  if (brokenNote.height <= 27) throw new Error('a two-line note is one line tall')
})

// A note beside a box names a side, and the side is honoured through the same placement machinery every other constraint
// uses: a hidden edge with a direction hint. Four sides, one box, four arrangements.
test('a note beside a box lands on the side the source named', () => {
  const place = (side) => {
    const source = ['@startuml', 'component a', 'note ' + side + ' of a : retry', '@enduml'].join('\n')
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error(side + ' refused: ' + JSON.stringify(r.refused))
    const box = (label) => r.canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === label)
    const note = box('retry')
    const anchor = box('a')
    if (note === undefined) throw new Error(side + ': the note was not drawn')
    if (note.shape !== 'note') throw new Error(side + ': the note lost its fold')
    return { note, anchor }
  }
  const right = place('right')
  if (!(right.note.x > right.anchor.x && Math.abs(right.note.y - right.anchor.y) < 1)) throw new Error('right did not put the note on the right')
  const left = place('left')
  if (!(left.note.x < left.anchor.x && Math.abs(left.note.y - left.anchor.y) < 1)) throw new Error('left did not put the note on the left')
  const top = place('top')
  if (!(top.note.y < top.anchor.y && Math.abs(top.note.x - top.anchor.x) < 1)) throw new Error('top did not put the note above')
  const bottom = place('bottom')
  if (!(bottom.note.y > bottom.anchor.y && Math.abs(bottom.note.x - bottom.anchor.x) < 1)) throw new Error('bottom did not put the note below')
  // The note is placed by a hidden edge: it must not draw one.
  if (place('right').note === undefined) throw new Error('unreachable')
  const drawn = render({ source: ['@startuml', 'component a', 'note right of a : retry', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (drawn.canvas.shapes.some((shape) => shape.kind === 'path' || shape.kind === 'link')) throw new Error('the placement edge was drawn')
  // Two defects of the form: no words, and a position over the box that no edge can express.
  const wordless = render({ source: ['@startuml', 'component a', 'note right of a', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (wordless.refused.length !== 1 || !wordless.refused[0].includes('names no text')) throw new Error('a wordless note: ' + JSON.stringify(wordless.refused))
  const over = render({ source: ['@startuml', 'component a', 'note over a : x', '@enduml'].join('\n') }, {}, { scheme: 'default' })
  if (over.refused.length !== 1 || !over.refused[0].includes('position this renderer cannot draw')) throw new Error('a note over a box: ' + JSON.stringify(over.refused))
})

// A note is an element with a folded corner; a note placed beside a box is a position, which this renderer decides.
test('a note draws with its fold, and a placed note is refused', () => {
  const note = render(
    { source: ['@startuml', 'component A', 'note "remember the retry" as n', 'A --> n', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (note.refused.length !== 0) throw new Error('the note was refused: ' + JSON.stringify(note.refused))
  const shape = note.diagram.nodes.find((node) => node.id === 'n')
  if (shape?.shape !== 'note') throw new Error('the note is not a note: ' + JSON.stringify(shape))
  if (!note.markup.includes('<path d="M')) throw new Error('the note has no crease')
  // A placed note is a note *and* a position now: the note is drawn and the position is honoured by a hidden edge.
  const beside = render(
    { source: ['@startuml', 'component A', 'note left of A : hi', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (beside.refused.length !== 0) throw new Error('a placed note was refused: ' + JSON.stringify(beside.refused))
  if (!beside.markup.includes('hi')) throw new Error('a placed note was not drawn')
})

// A direction hint is written in the reader's coordinates: the same `-right->` puts the far box on the right in either
// direction, and `-down->` puts it below in either. The turned drawing reads the hints turned.
test('a direction hint means the same thing in a turned drawing', () => {
  const place = (heading, hint) => {
    const lines = ['@startuml', ...(heading === 'right' ? ['left to right direction'] : []), 'component A', 'component B', 'A -' + hint + '-> B', '@enduml']
    const r = render({ source: lines.join('\n') }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error(hint + ' refused: ' + JSON.stringify(r.refused))
    const box = (label) => r.canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === label)
    return { a: box('A'), b: box('B') }
  }
  for (const heading of ['down', 'right']) {
    const right = place(heading, 'right')
    if (!(right.b.x > right.a.x && Math.abs(right.a.y - right.b.y) < 1)) {
      throw new Error(heading + ' -right-> did not put B on the right: ' + JSON.stringify(right.b))
    }
    const down = place(heading, 'down')
    if (!(down.b.y > down.a.y && Math.abs(down.a.x - down.b.x) < 1)) {
      throw new Error(heading + ' -down-> did not put B below: ' + JSON.stringify(down.b))
    }
  }
})

// A class-like keyword is a named box here: the name is what a component-level view needs, and the compartments are
// refused line by line when the source writes them.
test('a class-like keyword draws a box, and its block form is still refused', () => {
  for (const keyword of ['class', 'object', 'interface', 'enum', 'annotation']) {
    const plain = render({ source: ['@startuml', keyword + ' Order', '@enduml'].join('\n') }, {}, { scheme: 'default' })
    if (plain.refused.length !== 0) throw new Error(keyword + ' refused: ' + JSON.stringify(plain.refused))
    if (plain.diagram.nodes.length !== 1) throw new Error(keyword + ' boxes: ' + String(plain.diagram.nodes.length))
    const block = render({ source: ['@startuml', keyword + ' Order {', '  String id', '}', '@enduml'].join('\n') }, {}, { scheme: 'default' })
    if (block.refused.length < 1) throw new Error(keyword + ' block was not refused')
    if (!block.refused.some((entry) => entry.includes('is not a boundary'))) {
      throw new Error(keyword + ' block refused for the wrong reason: ' + JSON.stringify(block.refused))
    }
  }
})

// A line with no head and a dotted composite are two statements the renderer can keep: the first connects two boxes
// without claiming a direction, the second keeps the diamond and drops the solid line.
test('a headless line connects and points nowhere', () => {
  const draw = (edge) => {
    const source = ['@startuml', 'component A', 'component B', 'A ' + edge + ' B', '@enduml'].join('\n')
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error(edge + ' refused: ' + JSON.stringify(r.refused))
    return { heads: (r.markup.match(/<polygon/g) ?? []).length, dashed: (r.markup.match(/stroke-dasharray/g) ?? []).length }
  }
  const headless = draw('--')
  if (headless.heads !== 0) throw new Error('a headless line drew a head: ' + String(headless.heads))
  const arrow = draw('-->')
  if (arrow.heads !== 1) throw new Error('the nearest miss did not draw its head: ' + String(arrow.heads))
})

test('a dotted composite keeps the diamond and loses the solid line', () => {
  const draw = (edge) => {
    const source = ['@startuml', 'entity Whole', 'entity Part', 'Whole ' + edge + ' Part', '@enduml'].join('\n')
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error(edge + ' refused: ' + JSON.stringify(r.refused))
    return { diamond: (r.markup.match(/<polygon/g) ?? []).length, dashed: (r.markup.match(/stroke-dasharray/g) ?? []).length }
  }
  const dotted = draw('*..')
  if (dotted.diamond !== 1) throw new Error('the dotted composite lost its diamond: ' + String(dotted.diamond))
  if (dotted.dashed !== 1) throw new Error('the dotted composite drew a solid line')
  const solid = draw('*--')
  if (solid.dashed !== 0) throw new Error('the nearest miss drew a dashed line')
})

// A direction on the edge is a constraint on the drawing: the same pair, written four ways, is four arrangements.
test('a direction hint decides where the far box goes', () => {
  const where = (hint) => {
    const source = ['@startuml', 'component A', 'component B', 'A -' + hint + '-> B', '@enduml'].join('\n')
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error(hint + ' refused: ' + JSON.stringify(r.refused))
    const box = (label) => r.canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === label)
    return { a: box('A'), b: box('B') }
  }
  const down = where('down')
  if (!(down.a.y < down.b.y && Math.abs(down.a.x - down.b.x) < 1)) throw new Error('down did not stack them')
  const up = where('up')
  if (!(up.b.y < up.a.y && Math.abs(up.a.x - up.b.x) < 1)) throw new Error('up did not put B on top')
  const right = where('right')
  if (!(right.a.x < right.b.x && Math.abs(right.a.y - right.b.y) < 1)) throw new Error('right did not put them side by side')
  const left = where('left')
  if (!(left.b.x < left.a.x && Math.abs(left.a.y - left.b.y) < 1)) throw new Error('left did not put B on the left')
})

// `together { }` puts its members on one row. The metamorphic check is the chain it collapses: two boxes joined by an
// edge are on two rows, and the same pair inside together is on one.
test('together puts its members on one row', () => {
  const rows = (source) => {
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error('refused: ' + JSON.stringify(r.refused))
    if (r.ignored.length !== 0) throw new Error('reported as ignored: ' + JSON.stringify(r.ignored))
    return r.canvas.shapes.filter((shape) => shape.kind === 'box').map((box) => box.y)
  }
  const apart = rows(['@startuml', 'component A', 'component B', 'A --> B', '@enduml'].join('\n'))
  if (new Set(apart).size !== 2) throw new Error('the chain did not take two rows: ' + JSON.stringify(apart))
  const together = rows(['@startuml', 'together {', '  component A', '  component B', '}', 'A --> B', '@enduml'].join('\n'))
  if (new Set(together).size !== 1) throw new Error('together did not share a row: ' + JSON.stringify(together))
})

// A hidden edge is a layout instruction with no line: it ranks the two boxes and draws nothing. The metamorphic
// check is the direction - writing it the other way puts the other box on top, so it is the edge doing the ordering.
test('a hidden edge ranks two boxes the way it points and draws nothing', () => {
  const rank = (source) => {
    const r = render({ source }, {}, { scheme: 'default' })
    if (r.refused.length !== 0) throw new Error('the hidden edge was refused: ' + JSON.stringify(r.refused))
    const boxes = r.canvas.shapes.filter((shape) => shape.kind === 'box')
    const routes = r.canvas.shapes.filter((shape) => shape.kind === 'path' || shape.kind === 'link')
    if (routes.length !== 0) throw new Error('a line was drawn for a hidden edge: ' + String(routes.length))
    return boxes.sort((left, right) => left.y - right.y).map((box) => box.label)
  }
  const forward = rank(['@startuml', 'component A', 'component B', 'A -[hidden]-> B', '@enduml'].join('\n'))
  const backward = rank(['@startuml', 'component A', 'component B', 'B -[hidden]-> A', '@enduml'].join('\n'))
  if (JSON.stringify(forward) !== JSON.stringify(['A', 'B'])) throw new Error('A -[hidden]-> B drew: ' + JSON.stringify(forward))
  if (JSON.stringify(backward) !== JSON.stringify(['B', 'A'])) throw new Error('B -[hidden]-> A drew: ' + JSON.stringify(backward))
})

// A layout control is not a refusal and not a drawing instruction: it is understood, dropped, and said so. The
// nearest miss is the same source without the line - same picture, and nothing to report.
test('a layout control is reported as having no effect', () => {
  const withLine = render(
    { source: ['@startuml', 'top to bottom direction', 'component A', 'component B', 'A --> B', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (withLine.refused.length !== 0) throw new Error('the control was refused: ' + JSON.stringify(withLine.refused))
  if (withLine.ignored.length !== 1) throw new Error('ignored notes: ' + JSON.stringify(withLine.ignored))
  if (!withLine.ignored[0].includes('layout control')) throw new Error('the note does not say why: ' + withLine.ignored[0])
  if (!withLine.ignored[0].startsWith('line 2:')) throw new Error('the note does not name its line: ' + withLine.ignored[0])
  const without = render(
    { source: ['@startuml', 'component A', 'component B', 'A --> B', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (without.ignored.length !== 0) throw new Error('a plain source reported a control: ' + JSON.stringify(without.ignored))
  if (without.markup !== withLine.markup) throw new Error('the control changed the drawing it says it does not change')
})

if (failures > 0) {
  console.log('plantuml corpus failed: ' + String(failures))
  process.exit(1)
}
console.log('all plantuml corpus cases passed')

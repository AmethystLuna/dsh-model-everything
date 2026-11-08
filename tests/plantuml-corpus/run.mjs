// PlantUML constructs a component or state diagram actually contains, each with the difficulty it probes.
//
// The adapter is judged on two things at once: did it read the construct, and did it refuse the near miss
// by line rather than draw half a diagram. Every case names the difficulty it exists for, so a failure
// says which construct moved rather than only which assertion tripped.
//
// This is not PlantUML. A construct this renderer has no symbol for is refused by line, and the case
// records that refusal as the expected answer - that is the contract, not a bug to fix later.
import { render } from '../../lib/render/index.js'

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
    // The block line is refused; its body lines and every name another line mentions still draw. That is the
    // decided degradation (the reader is told which line was dropped), not an oversight: dropping the members
    // too would lose edges that parsed, and the counts below pin the choice.
    why: "must refuse the state body, and keep the members that did parse",
    source: "@startuml\nstate Running {\n  [*] --> Busy\n  Busy --> Idle\n}\n[*] --> Running\n@enduml",
    expect: { nodes: 3, edges: 1, groups: 0, refused: ["`state` block is not a boundary"] },
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
  const placed = render(
    { source: ['@startuml', 'component A', 'note left of A : hi', '@enduml'].join('\n') },
    {},
    { scheme: 'default' },
  )
  if (placed.refused.length !== 1) throw new Error('a placed note was not refused: ' + JSON.stringify(placed.refused))
  if (!placed.refused[0].includes('a position this renderer decides')) {
    throw new Error('the placed note was refused for the wrong reason: ' + placed.refused[0])
  }
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

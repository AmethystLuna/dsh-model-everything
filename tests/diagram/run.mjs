// White-box suite for the two notation adapters and the render entry.
//
// A parser is judged by three things, and each has its own kind of case here: what it reads (a diagram with
// the right nodes and labels), what it refuses (a line number and a reason, never a silent drop), and what
// it does with nonsense (an empty drawing, not an exception).
import { fromMermaid } from '../../lib/render/from-mermaid.js'
import { collapse } from '../../lib/render/collapse.js'
import { checkBudget } from '../../lib/render/budget.js'
import { diffStructure } from '../../lib/render/diff.js'
import { fromPlantUml } from '../../lib/render/from-plantuml.js'
import { detectNotation, render } from '../../lib/render/index.js'
import { writeSvg } from '../../lib/render/write.js'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

const ids = (diagram) => diagram.nodes.map((node) => node.id).sort()
const labels = (diagram) => diagram.nodes.map((node) => node.label ?? node.id).sort()

// -------------------------------------------------------------------------------------------------- mermaid

test('a flowchart becomes boxes and labelled arrows', () => {
  const { diagram, refused } = fromMermaid('graph TD\n  a[Start] --> b{Check}\n  b -->|yes| c[Done]\n  b -->|no| a')
  if (refused.length !== 0) throw new Error('refused: ' + refused.join('; '))
  if (JSON.stringify(ids(diagram)) !== JSON.stringify(['a', 'b', 'c'])) throw new Error('ids: ' + ids(diagram).join(','))
  if (JSON.stringify(labels(diagram)) !== JSON.stringify(['Check', 'Done', 'Start'])) throw new Error('labels: ' + labels(diagram).join(','))
  const arrows = diagram.edges.map((edge) => edge.from + '>' + edge.to + ':' + edge.label).join(' ')
  if (arrows !== 'a>b: b>c:yes b>a:no') throw new Error('edges: ' + arrows)
})

test('an edge label written as -- text --> is read too', () => {
  const { diagram } = fromMermaid('graph LR\n  a -- retry --> b')
  if (diagram.edges[0].label !== 'retry') throw new Error('label: ' + diagram.edges[0].label)
})

test('a dashed and a thick arrow are marked dashed', () => {
  const { diagram } = fromMermaid('graph TD\n  a -.-> b\n  b ==> c\n  c --> d')
  const dashed = diagram.edges.filter((edge) => edge.dashed).length
  if (dashed !== 2) throw new Error('dashed: ' + String(dashed))
})

test('a state diagram carries a start marker as the initial state, not as a box', () => {
  const { diagram } = fromMermaid('stateDiagram-v2\n  [*] --> idle\n  idle --> busy: start\n  busy --> [*]')
  if (diagram.init !== 'idle') throw new Error('init: ' + String(diagram.init))
  if (JSON.stringify(ids(diagram)) !== JSON.stringify(['busy', 'idle'])) throw new Error('ids: ' + ids(diagram).join(','))
  if (diagram.nodes.some((node) => node.id === '[*]')) throw new Error('the start marker became a node')
  const back = diagram.edges.find((edge) => edge.from === 'busy')
  if (back === undefined || back.dashed !== true) throw new Error('the end transition is not marked dashed')
})

test('a state alias puts the readable text in the box', () => {
  const { diagram } = fromMermaid('stateDiagram\n  state "Waiting for input" as idle\n  [*] --> idle')
  const idle = diagram.nodes.find((node) => node.id === 'idle')
  if (idle?.label !== 'Waiting for input') throw new Error('label: ' + String(idle?.label))
})

test('a subgraph becomes a group holding exactly its members', () => {
  const { diagram } = fromMermaid('graph TD\n  subgraph Core\n    a --> b\n  end\n  b --> c')
  if (diagram.groups === undefined || diagram.groups.length !== 1) throw new Error('groups: ' + JSON.stringify(diagram.groups))
  if (JSON.stringify(diagram.groups[0].members) !== JSON.stringify(['a', 'b'])) throw new Error('members: ' + diagram.groups[0].members.join(','))
  if (diagram.groups[0].label !== 'Core') throw new Error('label: ' + diagram.groups[0].label)
})

test('an unsupported diagram kind is refused with its line, not drawn as nonsense', () => {
  const { diagram, refused } = fromMermaid('sequenceDiagram\n  Alice->>Bob: hi')
  if (refused.length === 0) throw new Error('a sequence diagram was accepted')
  if (!refused[0].startsWith('line 1:')) throw new Error('no line number: ' + refused[0])
  if (diagram.kind !== 'none') throw new Error('kind: ' + diagram.kind)
})

test('styling directives are refused by name rather than silently dropped nodes', () => {
  const { refused } = fromMermaid('graph TD\n  a --> b\n  click a "https://example.com"\n  classDef red fill:#f00')
  if (refused.length !== 2) throw new Error('refused: ' + JSON.stringify(refused))
})

test('a comment and a blank line are not errors', () => {
  const { refused } = fromMermaid('graph TD\n\n  %% a comment\n  a --> b\n')
  if (refused.length !== 0) throw new Error('refused: ' + JSON.stringify(refused))
})

test('an empty or unknown source is an empty drawing, not an exception', () => {
  for (const source of ['', '   ', 'just some prose that is not a diagram', 'graph TD']) {
    const { diagram } = fromMermaid(source)
    if (diagram.kind !== 'none') throw new Error('drew something from ' + JSON.stringify(source))
  }
})

test('a line that names no two nodes is refused with its line number', () => {
  const { refused } = fromMermaid('graph TD\n  a -->\n  --> b')
  if (refused.length === 0) throw new Error('a malformed edge was accepted')
})

// ------------------------------------------------------------------------------------------------- plantuml

test('a component diagram becomes boxes and arrows', () => {
  const { diagram, refused } = fromPlantUml('@startuml\ncomponent "Web UI" as ui\ncomponent Api\nui --> Api : calls\n@enduml')
  if (refused.length !== 0) throw new Error('refused: ' + refused.join('; '))
  if (JSON.stringify(labels(diagram)) !== JSON.stringify(['Api', 'Web UI'])) throw new Error('labels: ' + labels(diagram).join(','))
  if (diagram.edges[0].label !== 'calls') throw new Error('label: ' + diagram.edges[0].label)
})

test('a package block becomes a group', () => {
  const { diagram } = fromPlantUml('@startuml\npackage "Core" {\n  [Parser] --> [Lexer]\n}\n@enduml')
  if (diagram.groups === undefined || diagram.groups.length !== 1) throw new Error('groups: ' + JSON.stringify(diagram.groups))
  if (diagram.groups[0].label !== 'Core') throw new Error('label: ' + diagram.groups[0].label)
  if (diagram.groups[0].members.length !== 2) throw new Error('members: ' + diagram.groups[0].members.join(','))
})

test('a bracketed component is its own label', () => {
  const { diagram } = fromPlantUml('@startuml\n[Order Service] --> [Billing]\n@enduml')
  if (JSON.stringify(labels(diagram)) !== JSON.stringify(['Billing', 'Order Service'])) throw new Error('labels: ' + labels(diagram).join(','))
})

test('an arrow written right to left is followed, not reversed', () => {
  const { diagram } = fromPlantUml('@startuml\nA <-- B\n@enduml')
  if (diagram.edges[0].from !== 'B' || diagram.edges[0].to !== 'A') throw new Error('edge: ' + JSON.stringify(diagram.edges[0]))
})

test('a dotted arrow is marked dashed and a state start marker sets the initial state', () => {
  const dotted = fromPlantUml('@startuml\nA ..> B\n@enduml').diagram
  if (dotted.edges[0].dashed !== true) throw new Error('not dashed')
  const state = fromPlantUml('@startuml\n[*] --> Idle\nIdle --> Busy : go\n@enduml').diagram
  if (state.init !== 'Idle') throw new Error('init: ' + String(state.init))
  if (state.kind !== 'machine') throw new Error('kind: ' + state.kind)
})

test('a sequence participant is refused by line', () => {
  const { refused } = fromPlantUml('@startuml\nactor User\nUser -> System : login\n@enduml')
  if (refused.length === 0) throw new Error('an actor was accepted')
  if (!refused[0].startsWith('line 2:')) throw new Error('no line number: ' + refused[0])
})

test('skinparam and themes are ignored without a refusal', () => {
  const { refused } = fromPlantUml('@startuml\nskinparam monochrome true\n!theme plain\nA --> B\n@enduml')
  if (refused.length !== 0) throw new Error('refused: ' + JSON.stringify(refused))
})

test('an empty plantuml file is an empty drawing', () => {
  if (fromPlantUml('@startuml\n@enduml').diagram.kind !== 'none') throw new Error('drew from an empty file')
})

test('each element keyword draws the symbol it names', () => {
  const source = [
    '@startuml',
    'database "Store" as store',
    'entity "Ledger" as ledger',
    'component "API" as api',
    'node "Worker" as worker',
    'rectangle "Cache" as cache',
    'artifact "Build" as build',
    'usecase "Check out" as checkout',
    '[Order Service]',
    'state Idle',
    '@enduml',
  ].join(String.fromCharCode(10))
  const { diagram, refused } = fromPlantUml(source)
  if (refused.length !== 0) throw new Error('refused: ' + refused.join('; '))
  const shapes = new Map(diagram.nodes.map((node) => [node.id, node.shape]))
  const expected = new Map([
    ['store', 'cylinder'],
    ['ledger', 'cylinder'],
    ['api', 'rect'],
    ['worker', 'rect'],
    ['cache', 'rect'],
    ['build', 'rect'],
    ['checkout', 'circle'],
    ['Order Service', 'rect'],
    ['Idle', 'rect'],
  ])
  for (const [id, shape] of expected) {
    if (shapes.get(id) !== shape) throw new Error(id + ' is ' + String(shapes.get(id)) + ', expected ' + shape)
  }
})

test('a boundary keyword opens a boundary, and its direct members are the ones written there', () => {
  const source = [
    '@startuml',
    'package "Core" {',
    '  node "Worker" {',
    '    component "Queue reader" as reader',
    '  }',
    '  component "API" as api',
    '}',
    'folder "Docs" {',
    '  component "Guide" as guide',
    '}',
    '@enduml',
  ].join(String.fromCharCode(10))
  const { diagram, refused } = fromPlantUml(source)
  if (refused.length !== 0) throw new Error('refused: ' + refused.join('; '))
  const groups = diagram.groups ?? []
  const core = groups.find((group) => group.label === 'Core')
  const worker = groups.find((group) => group.label === 'Worker')
  const docs = groups.find((group) => group.label === 'Docs')
  if (core === undefined || worker === undefined || docs === undefined) {
    throw new Error('a boundary is missing: ' + groups.map((group) => group.label).join(','))
  }
  if (!core.members.includes('api') || core.members.includes('reader')) throw new Error('Core members: ' + core.members.join(','))
  if (!worker.members.includes('reader')) throw new Error('Worker members: ' + worker.members.join(','))
  if (!docs.members.includes('guide')) throw new Error('Docs members: ' + docs.members.join(','))
  if (worker.parent !== core.id) throw new Error('Worker parent: ' + String(worker.parent))
  // The block keyword is a boundary, not a box of its own.
  if (diagram.nodes.some((node) => node.id === 'Worker' || node.id === 'Core')) throw new Error('a boundary keyword became a node')
})

test('an edge that names a declared package attaches to the boundary, not a second box', () => {
  const source = ['@startuml', 'package Web {', '  component UI', '}', 'Web <|-- Mobile', '@enduml'].join(String.fromCharCode(10))
  const { diagram, refused } = fromPlantUml(source)
  if (refused.length !== 0) throw new Error('refused: ' + refused.join('; '))
  // `Web` is the block's name, not an element the source declared: only UI and Mobile are boxes.
  if (JSON.stringify(ids(diagram)) !== JSON.stringify(['Mobile', 'UI'])) throw new Error('nodes: ' + ids(diagram).join(','))
  const web = (diagram.groups ?? []).find((group) => group.label === 'Web')
  if (web === undefined) throw new Error('the Web boundary is missing')
  const edge = diagram.edges.find((entry) => entry.from === 'Mobile')
  if (edge === undefined || edge.to !== web.id) throw new Error('edge: ' + JSON.stringify(diagram.edges))
  if (edge.arrow !== 'generalization') throw new Error('arrow: ' + String(edge.arrow))
})

test('an edge into a package rectangle ends on the boundary border', () => {
  const source = ['@startuml', 'package Web {', '  component UI', '}', 'Web <|-- Mobile', '@enduml'].join(String.fromCharCode(10))
  const rendered = render({ notation: 'plantuml', source })
  const web = rendered.canvas.shapes.find((shape) => shape.kind === 'group' && shape.label === 'Web')
  if (web === undefined) throw new Error('the Web boundary is not drawn')
  const edge = rendered.canvas.shapes.find((shape) => (shape.kind === 'link' || shape.kind === 'path') && shape.arrow === 'generalization')
  if (edge === undefined) throw new Error('no generalisation edge: ' + rendered.canvas.shapes.map((shape) => shape.kind).join(','))
  const head = edge.kind === 'link'
    ? { x: edge.x2, y: edge.y2 }
    : edge.points[edge.points.length - 1]
  const onBorder =
    (Math.abs(head.x - web.x) < 0.01 || Math.abs(head.x - (web.x + web.width)) < 0.01) && head.y >= web.y - 0.01 && head.y <= web.y + web.height + 0.01 ||
    (Math.abs(head.y - web.y) < 0.01 || Math.abs(head.y - (web.y + web.height)) < 0.01) && head.x >= web.x - 0.01 && head.x <= web.x + web.width + 0.01
  if (!onBorder) throw new Error('the arrow head is not on the boundary: ' + JSON.stringify(head) + ' vs ' + JSON.stringify({ x: web.x, y: web.y, width: web.width, height: web.height }))
  // The block's name is the boundary's label, not a second box on top of it.
  if (rendered.canvas.shapes.some((shape) => shape.kind === 'box' && shape.label === 'Web')) throw new Error('an invented Web box is drawn')
})

test('an edge written the other way round names the same boundary', () => {
  const source = ['@startuml', 'package Web {', '  component UI', '}', 'Mobile --|> Web', '@enduml'].join(String.fromCharCode(10))
  const { diagram, refused } = fromPlantUml(source)
  if (refused.length !== 0) throw new Error('refused: ' + refused.join('; '))
  const web = (diagram.groups ?? []).find((group) => group.label === 'Web')
  const edge = diagram.edges.find((entry) => entry.from === 'Mobile')
  if (web === undefined || edge === undefined || edge.to !== web.id) throw new Error('edge: ' + JSON.stringify(diagram.edges))
  if (edge.arrow !== 'generalization') throw new Error('arrow: ' + String(edge.arrow))
})

test('a block reached through its alias is the boundary, not a box of the alias name', () => {
  const source = ['@startuml', 'package "Web Tier" as web {', '  component UI', '}', 'web <|-- Mobile', '@enduml'].join(String.fromCharCode(10))
  const { diagram, refused } = fromPlantUml(source)
  if (refused.length !== 0) throw new Error('refused: ' + refused.join('; '))
  if (JSON.stringify(ids(diagram)) !== JSON.stringify(['Mobile', 'UI'])) throw new Error('nodes: ' + ids(diagram).join(','))
  const web = (diagram.groups ?? []).find((group) => group.id === 'web')
  if (web === undefined) throw new Error('the aliased boundary is missing')
  const edge = diagram.edges.find((entry) => entry.from === 'Mobile')
  if (edge === undefined || edge.to !== 'web') throw new Error('edge: ' + JSON.stringify(diagram.edges))
})

test('a name that is not a declared block stays a normal element', () => {
  // An undeclared name is an implicit element, which PlantUML also allows.
  const implicit = fromPlantUml(['@startuml', 'Mobile --> Web', '@enduml'].join(String.fromCharCode(10)))
  if (implicit.refused.length !== 0) throw new Error('refused: ' + implicit.refused.join('; '))
  if (JSON.stringify(ids(implicit.diagram)) !== JSON.stringify(['Mobile', 'Web'])) throw new Error('nodes: ' + ids(implicit.diagram).join(','))
  if (implicit.diagram.groups !== undefined) throw new Error('an undeclared name became a boundary: ' + JSON.stringify(implicit.diagram.groups))
  // A name declared as an element is a box for the same reason, even when the edge writes it first.
  const declared = fromPlantUml(['@startuml', 'component Web', 'Mobile --> Web', '@enduml'].join(String.fromCharCode(10)))
  if (JSON.stringify(ids(declared.diagram)) !== JSON.stringify(['Mobile', 'Web'])) throw new Error('declared nodes: ' + ids(declared.diagram).join(','))
  if (declared.diagram.groups !== undefined) throw new Error('a declared element became a boundary: ' + JSON.stringify(declared.diagram.groups))
  const edge = declared.diagram.edges.find((entry) => entry.from === 'Mobile')
  if (edge === undefined || edge.to !== 'Web') throw new Error('edge: ' + JSON.stringify(declared.diagram.edges))
})

test('an edge between two boundaries is refused by line, not attached to a member box', () => {
  const source = [
    '@startuml',
    'package A {',
    '  component X',
    '}',
    'package B {',
    '  component Y',
    '}',
    'A --> B',
    '@enduml',
  ].join(String.fromCharCode(10))
  const { diagram, refused } = fromPlantUml(source)
  if (refused.length !== 1) throw new Error('refused: ' + JSON.stringify(refused))
  if (!refused[0].startsWith('line 8:')) throw new Error('wrong line: ' + refused[0])
  if (!refused[0].includes('boundaries, not elements')) throw new Error('no boundary reason: ' + refused[0])
  if (diagram.edges.length !== 0) throw new Error('a refused boundary edge was drawn: ' + JSON.stringify(diagram.edges))
  if (JSON.stringify(ids(diagram)) !== JSON.stringify(['X', 'Y'])) throw new Error('nodes: ' + ids(diagram).join(','))
})

test('an element keyword this renderer does not draw is refused with its line and a reason', () => {
  for (const [keyword, line] of [['actor', 'actor User'], ['class', 'class Order'], ['cloud', 'cloud Network']]) {
    const { refused } = fromPlantUml(['@startuml', line, 'A --> B', '@enduml'].join(String.fromCharCode(10)))
    if (refused.length !== 1) throw new Error(keyword + ' refused: ' + JSON.stringify(refused))
    if (!refused[0].startsWith('line 2:')) throw new Error(keyword + ' has no line number: ' + refused[0])
    if (!refused[0].includes('`' + keyword + '`: ')) throw new Error(keyword + ' has no reason: ' + refused[0])
  }
})

test('each arrow type is read in both directions, and points the way the source says', () => {
  const source = [
    '@startuml',
    'A --> B : calls',
    'C <-- D',
    'E ..> F',
    'G <.. H',
    'I <|-- J',
    'K --|> L',
    'M <|.. N',
    'O ..|> P',
    'Q *-- R',
    'S --* T',
    'U o-- V',
    'W --o X',
    '@enduml',
  ].join(String.fromCharCode(10))
  const { diagram, refused } = fromPlantUml(source)
  if (refused.length !== 0) throw new Error('refused: ' + refused.join('; '))
  const check = (from, to, arrow, dashed, label) => {
    const edge = diagram.edges.find((entry) => entry.from === from && entry.to === to)
    if (edge === undefined) throw new Error('no edge ' + from + '>' + to)
    if (edge.arrow !== arrow) throw new Error(from + '>' + to + ' is ' + String(edge.arrow) + ', expected ' + arrow)
    if ((edge.dashed === true) !== dashed) throw new Error(from + '>' + to + ' dashed: ' + String(edge.dashed))
    if (label !== undefined && edge.label !== label) throw new Error(from + '>' + to + ' label: ' + edge.label)
  }
  // Association: the end it points at is the target.
  check('A', 'B', 'association', false, 'calls')
  check('D', 'C', 'association', false)
  // Dependency: the same arrow on a dashed line.
  check('E', 'F', 'dependency', true)
  check('H', 'G', 'dependency', true)
  // Generalisation: `A <|-- B` means B generalises to A, so the triangle is at A and the edge runs B -> A.
  check('J', 'I', 'generalization', false)
  check('K', 'L', 'generalization', false)
  // Realisation is a generalisation on a dashed line.
  check('N', 'M', 'realization', true)
  check('O', 'P', 'realization', true)
  // The diamond marks the source, so a diamond written on the right swaps the ends.
  check('Q', 'R', 'composition', false)
  check('T', 'S', 'composition', false)
  check('U', 'V', 'aggregation', false)
  check('X', 'W', 'aggregation', false)
})

test('an edge it cannot draw as written is refused by line, not drawn as another arrow', () => {
  const source = ['@startuml', 'A -- B', 'C *--> D', 'E *.. F', '@enduml'].join(String.fromCharCode(10))
  const { diagram, refused } = fromPlantUml(source)
  if (refused.length !== 3) throw new Error('refused: ' + JSON.stringify(refused))
  if (diagram.edges.length !== 0) throw new Error('a refused edge was drawn: ' + JSON.stringify(diagram.edges))
  const lines = refused.map((entry) => entry.slice(0, entry.indexOf(': ')))
  if (JSON.stringify(lines) !== JSON.stringify(['line 2', 'line 3', 'line 4'])) throw new Error('lines: ' + lines.join(','))
  for (const entry of refused) {
    const reason = entry.slice(entry.indexOf(': ') + 2)
    if (reason.trim() === '') throw new Error('a refusal without a reason: ' + entry)
  }
})

// ----------------------------------------------------------------------------------------------- the entry

test('the notation is detected from the first meaningful line', () => {
  if (detectNotation('@startuml\nA --> B') !== 'plantuml') throw new Error('plantuml not detected')
  if (detectNotation('\n  %% c\ngraph TD\n  a --> b') !== 'mermaid') throw new Error('mermaid not detected')
  if (detectNotation('') !== 'mermaid') throw new Error('empty source did not default to mermaid')
})

test('a render carries the drawing, the markup and the notation', () => {
  const rendered = render({ source: 'graph TD\n  a[Start] --> b[Stop]', title: 'flow' })
  if (rendered.notation !== 'mermaid') throw new Error('notation: ' + rendered.notation)
  if (!rendered.markup.startsWith('<svg')) throw new Error('no svg')
  if (rendered.dropped !== 0) throw new Error('dropped: ' + String(rendered.dropped))
  if (rendered.canvas.shapes.length === 0) throw new Error('no shapes')
  if (!rendered.markup.includes('Start')) throw new Error('the label did not reach the markup')
})

test('a forced notation wins over detection', () => {
  const rendered = render({ notation: 'mermaid', source: 'graph TD\n  a --> b' })
  if (rendered.notation !== 'mermaid') throw new Error('notation: ' + rendered.notation)
})

test('writing a file puts the markup where a document can link to it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-diagram-'))
  try {
    const path = join(directory, 'flow.svg')
    const written = writeSvg({ source: 'graph TD\n  a --> b' }, path)
    if (written.bytes !== written.rendered.markup.length) throw new Error('byte count disagrees with the markup')
    const onDisk = readFileSync(path, 'utf8')
    if (onDisk !== written.rendered.markup) throw new Error('the file differs from the markup')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a refused source still produces a drawing and reports what it refused', () => {
  const rendered = render({ source: 'graph TD\n  a --> b\n  click a "x"' })
  if (rendered.refused.length !== 1) throw new Error('refused: ' + JSON.stringify(rendered.refused))
  if (!rendered.diagram.caption.includes('refused')) throw new Error('caption: ' + rendered.diagram.caption)
})

test('a nested subgraph records its parent and keeps its own members', () => {
  const source = [
    'graph TD',
    '  subgraph Platform',
    '    subgraph Core',
    '      a[API] --> b[Service]',
    '    end',
    '    b --> cache[(Cache)]',
    '  end',
    '  cache --> db[(Store)]',
  ].join(String.fromCharCode(10))
  const { diagram } = fromMermaid(source, 'nested')
  const groups = diagram.groups ?? []
  const core = groups.find((group) => group.label === 'Core')
  const platform = groups.find((group) => group.label === 'Platform')
  if (core === undefined || platform === undefined) throw new Error('a boundary is missing: ' + groups.map((group) => group.label).join(','))
  if (core.parent !== platform.id) throw new Error('Core parent: ' + String(core.parent))
  if (platform.parent !== undefined) throw new Error('Platform should be a root: ' + String(platform.parent))
  // Direct members only: the outer boundary must not claim what the inner one holds.
  if (core.members.length !== 2) throw new Error('Core members: ' + core.members.join(','))
  if (!platform.members.includes('cache')) throw new Error('Platform lost its own member: ' + platform.members.join(','))
  if (platform.members.includes('a') || platform.members.includes('b')) throw new Error('Platform claimed its child group members: ' + platform.members.join(','))
})

test('a nested package records its parent', () => {
  const source = ['@startuml', 'package "Outer" {', '  package "Inner" {', '    [A] --> [B]', '  }', '  [B] --> [C]', '}', '@enduml'].join(String.fromCharCode(10))
  const { diagram } = fromPlantUml(source)
  const inner = (diagram.groups ?? []).find((group) => group.label === 'Inner')
  const outer = (diagram.groups ?? []).find((group) => group.label === 'Outer')
  if (inner === undefined || outer === undefined) throw new Error('a package is missing')
  if (inner.parent !== outer.id) throw new Error('Inner parent: ' + String(inner.parent))
  if (outer.members.includes('A')) throw new Error('Outer claimed Inner members: ' + outer.members.join(','))
})

test('folding a group replaces it with one box carrying its name and size', () => {
  const source = ['graph TD', '  subgraph Core', '    a[API] --> b[Service]', '  end', '  b --> c[Report]'].join(String.fromCharCode(10))
  const { diagram } = fromMermaid(source)
  const folded = collapse(diagram, ['subgraph-1'])
  const ids = folded.nodes.map((node) => node.id).sort()
  if (JSON.stringify(ids) !== JSON.stringify(['c', 'subgraph-1'])) throw new Error('nodes: ' + ids.join(','))
  const box = folded.nodes.find((node) => node.id === 'subgraph-1')
  if (box.label !== 'Core (2)') throw new Error('fold label: ' + String(box.label))
  if (folded.groups !== undefined) throw new Error('the folded boundary is still a boundary')
  // The edge into the fold now points at the fold, and the edge inside it is gone.
  const edges = folded.edges.map((edge) => edge.from + '>' + edge.to).sort()
  if (JSON.stringify(edges) !== JSON.stringify(['subgraph-1>c'])) throw new Error('edges: ' + edges.join(','))
})

test('folding the outer group takes its children with it', () => {
  const source = [
    'graph TD',
    '  subgraph Outer',
    '    subgraph Inner',
    '      a --> b',
    '    end',
    '    b --> c',
    '  end',
  ].join(String.fromCharCode(10))
  const { diagram } = fromMermaid(source)
  const outer = (diagram.groups ?? []).find((group) => group.label === 'Outer')
  const folded = collapse(diagram, [outer.id])
  if (folded.nodes.length !== 1) throw new Error('nodes: ' + folded.nodes.map((node) => node.id).join(','))
  if (folded.nodes[0].label !== 'Outer (3)') throw new Error('fold label: ' + String(folded.nodes[0].label))
})

test('folding a group inside another folded group is served by the outer one', () => {
  const source = [
    'graph TD',
    '  subgraph Outer',
    '    subgraph Inner',
    '      a --> b',
    '    end',
    '  end',
  ].join(String.fromCharCode(10))
  const { diagram } = fromMermaid(source)
  const ids = (diagram.groups ?? []).map((group) => group.id)
  const folded = collapse(diagram, ids)
  if (folded.nodes.length !== 1) throw new Error('nodes: ' + folded.nodes.map((node) => node.id).join(','))
  if (!folded.nodes[0].label.startsWith('Outer')) throw new Error('the outer fold did not win: ' + String(folded.nodes[0].label))
})

test('folding nothing, or a name nobody declared, changes nothing', () => {
  const source = ['graph TD', '  subgraph Core', '    a --> b', '  end'].join(String.fromCharCode(10))
  const { diagram } = fromMermaid(source)
  if (collapse(diagram, []).nodes.length !== diagram.nodes.length) throw new Error('an empty fold set changed the drawing')
  if (collapse(diagram, ['nope']).nodes.length !== diagram.nodes.length) throw new Error('an unknown fold changed the drawing')
  if (collapse(diagram, ['nope']).caption !== diagram.caption) throw new Error('an unknown fold changed the caption')
})

test('the folded drawing still renders, and says it is folded', () => {
  const source = ['graph TD', '  subgraph Core', '    a --> b', '  end', '  b --> c'].join(String.fromCharCode(10))
  const rendered = render({ source, folded: ['subgraph-1'] })
  if (rendered.diagram.caption.includes('folded') === false) throw new Error('caption: ' + rendered.diagram.caption)
  const boxes = rendered.canvas.shapes.filter((shape) => shape.kind === 'box')
  if (boxes.length !== 2) throw new Error('boxes: ' + String(boxes.length))
  if (!rendered.markup.includes('Core (2)')) throw new Error('the fold is not named in the drawing')
})

test('two edges into the same fold become one after folding', () => {
  const source = ['graph TD', '  subgraph Core', '    a --> b', '  end', '  x --> a', '  x --> b'].join(String.fromCharCode(10))
  const { diagram } = fromMermaid(source)
  const fold = (diagram.groups ?? [])[0].id
  const folded = collapse(diagram, [fold])
  const edges = folded.edges.map((edge) => edge.from + '>' + edge.to)
  if (JSON.stringify(edges) !== JSON.stringify(['x>' + fold])) throw new Error('edges: ' + edges.join(','))
})

test('an edge between two members of one fold disappears, and a self loop too', () => {
  const source = ['graph TD', '  subgraph Core', '    a --> b', '    a --> a', '  end', '  b --> out'].join(String.fromCharCode(10))
  const { diagram } = fromMermaid(source)
  const fold = (diagram.groups ?? [])[0].id
  const folded = collapse(diagram, [fold])
  const edges = folded.edges.map((edge) => edge.from + '>' + edge.to)
  if (edges.join(',') !== fold + '>out') throw new Error('edges: ' + edges.join(','))
})

test('a wide boundary fails its budget and names itself', () => {
  const lines = ['graph TD', '  subgraph Wide']
  for (let index = 0; index < 9; index += 1) lines.push('    n' + String(index) + '[node ' + String(index) + ']')
  lines.push('  end')
  const { diagram } = fromMermaid(lines.join(String.fromCharCode(10)))
  const report = checkBudget(diagram)
  if (report.verdict !== 'fail') throw new Error('verdict: ' + report.verdict)
  const wide = report.findings.find((finding) => finding.code === 'B1_GROUP_TOO_WIDE')
  if (wide === undefined) throw new Error('no width finding: ' + JSON.stringify(report.findings.map((finding) => finding.code)))
  if (!wide.message.includes('Wide')) throw new Error('the finding does not name the group: ' + wide.message)
  if (wide.group === undefined) throw new Error('the finding carries no group id')
})

test('a boundary inside the budget passes, and the measurement proves it was checked', () => {
  const source = ['graph TD', '  subgraph Core', '    a --> b', '  end', '  b --> c'].join(String.fromCharCode(10))
  const { diagram } = fromMermaid(source)
  const report = checkBudget(diagram)
  if (report.verdict !== 'pass') throw new Error('verdict: ' + report.verdict + ' findings: ' + JSON.stringify(report.findings))
  if (report.measured.nodes !== 3) throw new Error('measured nodes: ' + String(report.measured.nodes))
  if (report.measured.groups !== 1) throw new Error('measured groups: ' + String(report.measured.groups))
  if (report.measured.widest?.size !== 2) throw new Error('widest: ' + JSON.stringify(report.measured.widest))
})

test('a boundary around one thing is a warning, not an error', () => {
  const source = ['graph TD', '  subgraph Alone', '    a[Only]', '  end'].join(String.fromCharCode(10))
  const { diagram } = fromMermaid(source)
  const report = checkBudget(diagram)
  const single = report.findings.find((finding) => finding.code === 'B4_SINGLE_MEMBER')
  if (single === undefined) throw new Error('no single-member finding')
  if (single.severity !== 'warning') throw new Error('severity: ' + single.severity)
  if (report.verdict !== 'pass_with_findings') throw new Error('verdict: ' + report.verdict)
})

test('nesting deeper than the budget fails, and the depth is measured', () => {
  const source = [
    'graph TD',
    '  subgraph One',
    '    subgraph Two',
    '      subgraph Three',
    '        subgraph Four',
    '          a --> b',
    '        end',
    '      end',
    '    end',
    '  end',
  ].join(String.fromCharCode(10))
  const { diagram } = fromMermaid(source)
  const report = checkBudget(diagram, { maxDepth: 2 })
  if (report.findings.every((finding) => finding.code !== 'B2_TOO_DEEP')) throw new Error('no depth finding')
  if (report.measured.deepest < 4) throw new Error('deepest: ' + String(report.measured.deepest))
})

test('too many nodes is a whole-drawing finding, without a group', () => {
  const lines = ['graph TD']
  for (let index = 0; index < 12; index += 1) lines.push('  n' + String(index) + '[node ' + String(index) + ']')
  const { diagram } = fromMermaid(lines.join(String.fromCharCode(10)))
  const report = checkBudget(diagram, { maxNodes: 5 })
  const tooMany = report.findings.find((finding) => finding.code === 'B5_TOO_MANY_NODES')
  if (tooMany === undefined) throw new Error('no node-count finding')
  if (tooMany.group !== undefined) throw new Error('a whole-drawing finding named a group')
})

test('an empty boundary is reported as an error, because the drawing cannot show it', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }],
    edges: [],
    groups: [{ id: 'g', label: 'Hollow', members: ['ghost'] }],
    caption: 'graph',
  }
  const report = checkBudget(diagram)
  const empty = report.findings.find((finding) => finding.code === 'B3_EMPTY_GROUP')
  if (empty === undefined) throw new Error('no empty-group finding: ' + JSON.stringify(report.findings.map((finding) => finding.code)))
  if (report.verdict !== 'fail') throw new Error('verdict: ' + report.verdict)
})

test('limits can be raised for a larger medium', () => {
  const lines = ['graph TD', '  subgraph Wide']
  for (let index = 0; index < 9; index += 1) lines.push('    n' + String(index) + '[node ' + String(index) + ']')
  lines.push('  end')
  const { diagram } = fromMermaid(lines.join(String.fromCharCode(10)))
  if (checkBudget(diagram, { maxMembers: 12 }).verdict !== 'pass') throw new Error('a raised budget still failed')
})

test('an identical pair reports no change, and says what it compared', () => {
  const source = ['graph TD', '  subgraph Core', '    a --> b', '  end'].join(String.fromCharCode(10))
  const { diagram } = fromMermaid(source)
  const report = diffStructure(diagram, diagram)
  if (report.verdict !== 'pass') throw new Error('verdict: ' + report.verdict + ' ' + JSON.stringify(report.changes))
  if (report.changes.length !== 0) throw new Error('changes: ' + JSON.stringify(report.changes))
  if (report.measured.before.nodes !== 2 || report.measured.after.nodes !== 2) throw new Error('measured: ' + JSON.stringify(report.measured))
})

test('a boundary that moved inside another is reported as a move, with both sides named', () => {
  const flat = ['graph TD', '  subgraph A', '    x[a] --> y[b]', '  end', '  subgraph B', '    z[c]', '  end'].join(String.fromCharCode(10))
  const nested = ['graph TD', '  subgraph A', '    x[a] --> y[b]', '    subgraph B', '      z[c]', '    end', '  end'].join(String.fromCharCode(10))
  const before = fromMermaid(flat).diagram
  const after = fromMermaid(nested).diagram
  const report = diffStructure(before, after)
  const moved = report.changes.filter((change) => change.code === 'H4_GROUP_MOVED')
  if (moved.length === 0) throw new Error('no move finding: ' + JSON.stringify(report.changes.map((change) => change.code)))
  if (!moved[0].message.includes('B')) throw new Error('the move does not name the group: ' + moved[0].message)
  if (report.verdict !== 'pass_with_findings') throw new Error('verdict: ' + report.verdict)
})

test('a node that changed owner is reported, and a new node is not a move', () => {
  const before = fromMermaid(['graph TD', '  subgraph A', '    x[a] --> y[b]', '  end', '  subgraph B', '    z[c]', '  end'].join(String.fromCharCode(10))).diagram
  const after = fromMermaid(['graph TD', '  subgraph A', '    x[a]', '  end', '  subgraph B', '    z[c] --> y[b]', '  end'].join(String.fromCharCode(10))).diagram
  const report = diffStructure(before, after)
  const regrouped = report.changes.filter((change) => change.code === 'H7_NODE_REGROUPED')
  if (regrouped.length !== 1) throw new Error('regrouped: ' + JSON.stringify(report.changes.map((change) => change.code)))
  if (!regrouped[0].message.includes('A') || !regrouped[0].message.includes('B')) throw new Error('message: ' + regrouped[0].message)
  if (report.changes.some((change) => change.code === 'H5_NODE_ADDED')) throw new Error('an existing node was reported as new')
})

test('a rename is a rename when the id survived, and an add plus a remove when it did not', () => {
  const before = fromMermaid(['graph TD', '  subgraph Core', '    a --> b', '  end'].join(String.fromCharCode(10))).diagram
  const renamed = fromMermaid(['graph TD', '  subgraph Core 2', '    a --> b', '  end'].join(String.fromCharCode(10))).diagram
  const sameId = diffStructure(before, renamed)
  if (!sameId.changes.some((change) => change.code === 'H3_GROUP_RENAMED')) {
    // The parser numbers groups by position, so a label change keeps the id: this is the rename case.
    throw new Error('a label change was not reported as a rename: ' + JSON.stringify(sameId.changes.map((change) => change.code)))
  }

  const dropped = fromMermaid(['graph TD', '  a --> b'].join(String.fromCharCode(10))).diagram
  const removed = diffStructure(before, dropped)
  if (!removed.changes.some((change) => change.code === 'H2_GROUP_REMOVED')) throw new Error('no removal finding')
})

test('nothing on either side fails instead of reporting a clean comparison', () => {
  const empty = fromMermaid('graph TD').diagram
  const report = diffStructure(empty, empty)
  if (report.verdict !== 'fail') throw new Error('verdict: ' + report.verdict)
  if (!report.changes.some((change) => change.code === 'D0_NO_NODES')) throw new Error('no empty-comparison finding')
})

test('a bare state line is a declaration, not a refusal', () => {
  const { diagram, refused } = fromMermaid(['stateDiagram-v2', '  state Idle', '  state Busy', '  Idle --> Busy'].join(String.fromCharCode(10)))
  if (refused.length !== 0) throw new Error('refused: ' + refused.join('; '))
  if (JSON.stringify(diagram.nodes.map((node) => node.id).sort()) !== JSON.stringify(['Busy', 'Idle'])) throw new Error('nodes: ' + diagram.nodes.map((node) => node.id).join(','))
})

test('an unreadable arrow and an unreadable line are both refused with their line numbers', () => {
  const source = ['graph TD', '  a[One] --> b[Two]', '  a -->', '  not a diagram line at all'].join(String.fromCharCode(10))
  const { refused } = fromMermaid(source)
  if (refused.length < 1) throw new Error('nothing was refused')
  for (const line of refused) if (!/^line \d+:/.test(line)) throw new Error('no line number: ' + line)
})

test('a plantuml quoted alias, a dotted arrow and a no-op pair are read without complaint', () => {
  const source = ['@startuml', 'component "Web UI" as ui', 'database "Store" as db', 'ui ..> db', '[*] --> [*]', '@enduml'].join(String.fromCharCode(10))
  const { diagram, refused } = fromPlantUml(source)
  if (refused.length !== 0) throw new Error('refused: ' + refused.join('; '))
  const ui = diagram.nodes.find((node) => node.id === 'ui')
  if (ui?.label !== 'Web UI') throw new Error('alias label: ' + String(ui?.label))
  if (diagram.edges[0]?.dashed !== true) throw new Error('the dotted arrow is not dashed')
})

test('a plantuml line it cannot draw is refused with its line number', () => {
  const { refused } = fromPlantUml(['@startuml', 'A --> B', 'note right: not drawn here', '@enduml'].join(String.fromCharCode(10)))
  if (refused.length !== 1) throw new Error('refused: ' + JSON.stringify(refused))
  if (!refused[0].startsWith('line 3:')) throw new Error('wrong line: ' + refused[0])
})

test('folding two groups says so, and folding everything leaves no boundary', () => {
  const source = ['graph TD', '  subgraph A', '    a --> b', '  end', '  subgraph B', '    c --> d', '  end'].join(String.fromCharCode(10))
  const { diagram } = fromMermaid(source)
  const ids = (diagram.groups ?? []).map((group) => group.id)
  const both = collapse(diagram, ids)
  if (!both.caption.includes('2 groups folded')) throw new Error('caption: ' + both.caption)
  if (both.groups !== undefined) throw new Error('a boundary survived folding everything')
  const one = collapse(diagram, [ids[0]])
  if (!one.caption.includes('1 group folded')) throw new Error('caption: ' + one.caption)
})

test('the diff reports a node appearing, a boundary appearing and one disappearing', () => {
  // Hand-built sides: a parsed source numbers its groups by position, so adding one renumbers ids and turns
  // every "added" into a rename. The diff is about ids, so the fixture has to hold them still.
  const before = {
    kind: 'graph', title: 't', caption: 'graph',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }],
    edges: [{ from: 'a', label: '', to: 'b' }],
    groups: [
      { id: 'outer', label: 'Outer', members: [] },
      { id: 'inner', label: 'Inner', members: ['a', 'b'], parent: 'outer' },
    ],
  }
  const after = {
    kind: 'graph', title: 't', caption: 'graph',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }, { id: 'c', role: 'normal' }],
    edges: [{ from: 'a', label: '', to: 'b' }],
    groups: [
      { id: 'outer', label: 'Outer', members: ['a', 'b'] },
      { id: 'fresh', label: 'Fresh', members: ['c'] },
    ],
  }
  const codes = diffStructure(before, after).changes.map((change) => change.code)
  for (const expected of ['H1_GROUP_ADDED', 'H2_GROUP_REMOVED', 'H5_NODE_ADDED', 'H7_NODE_REGROUPED']) {
    if (!codes.includes(expected)) throw new Error('missing ' + expected + ': ' + codes.join(','))
  }
})

test('a node that left its group is reported against the top level', () => {
  const before = fromMermaid(['graph TD', '  subgraph Core', '    a --> b', '  end'].join(String.fromCharCode(10))).diagram
  const after = fromMermaid(['graph TD', '  subgraph Core', '    b', '  end', '  a'].join(String.fromCharCode(10))).diagram
  const report = diffStructure(before, after)
  const moved = report.changes.find((change) => change.code === 'H7_NODE_REGROUPED')
  if (moved === undefined) throw new Error('no move: ' + report.changes.map((change) => change.code).join(','))
  if (!moved.message.includes('no group')) throw new Error('the destination is not the top level: ' + moved.message)
})

test('the render entry takes an explicit notation as readily as auto', () => {
  const explicit = render({ source: '@startuml\nA --> B\n@enduml', notation: 'plantuml' })
  if (explicit.notation !== 'plantuml') throw new Error('notation: ' + explicit.notation)
  const auto = render({ source: '@startuml\nA --> B\n@enduml' })
  if (auto.notation !== 'plantuml') throw new Error('auto did not detect plantuml: ' + auto.notation)
})

if (failures > 0) {
  console.log('diagram tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all diagram tests passed')

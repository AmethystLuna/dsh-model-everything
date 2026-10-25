// White-box suite for the two notation adapters and the render entry.
//
// A parser is judged by three things, and each has its own kind of case here: what it reads (a diagram with
// the right nodes and labels), what it refuses (a line number and a reason, never a silent drop), and what
// it does with nonsense (an empty drawing, not an exception).
import { fromMermaid } from '../../lib/render/from-mermaid.js'
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

if (failures > 0) {
  console.log('diagram tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all diagram tests passed')

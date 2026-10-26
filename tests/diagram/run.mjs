// White-box suite for the two notation adapters and the render entry.
//
// A parser is judged by three things, and each has its own kind of case here: what it reads (a diagram with
// the right nodes and labels), what it refuses (a line number and a reason, never a silent drop), and what
// it does with nonsense (an empty drawing, not an exception).
import { fromMermaid } from '../../lib/render/from-mermaid.js'
import { collapse } from '../../lib/render/collapse.js'
import { checkBudget } from '../../lib/render/budget.js'
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

if (failures > 0) {
  console.log('diagram tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all diagram tests passed')

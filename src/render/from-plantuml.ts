/**
 * PlantUML text to a diagram, for the subset this renderer can actually draw.
 *
 * PlantUML is a large language, and a renderer that accepted all of it would be a re-implementation of
 * PlantUML. This one accepts what an architecture document actually contains - boxes, groups and arrows -
 * and refuses the rest **by line**, because a component diagram that quietly loses a lifeline reads as
 * complete and is not.
 *
 * Supported:
 *
 * - `@startuml` / `@enduml` (optional) and `title ...`;
 * - elements: `component`, `node`, `rectangle`, `artifact` and `state` (a rectangle), `database` and
 *   `entity` (a cylinder), `usecase` (an ellipse), `[text]`, each with a `"text"` label and `as` alias;
 * - boundaries: `package`, `folder`, `node`, `component`, `rectangle` and `artifact` blocks, closed by `}`;
 * - arrows, either direction: association `-->`/`<--`, dependency `..>`/`<..`, generalisation `--|>`/`<|--`,
 *   realisation `..|>`/`<|..`, composition `*--`/`--*`, aggregation `o--`/`--o`, labelled after `:`;
 * - an edge end that names a declared block attaches to that block's rectangle, the way an external
 *   dependency on a package is drawn; a name that is not a declared block is an implicit element;
 * - `[*] --> X` for a start marker;
 * - `'` comments and `skinparam`/`!theme` directives.
 *
 * Refused, by line and by name: the element keywords this renderer has no symbol for (`actor`, `class`,
 * `cloud`, ...), the diagram kinds it does not draw (`sequence`), and an edge it cannot draw as written (a
 * line with no arrow end, a mark at both ends, a dotted diamond, an edge between two boundaries, or an edge
 * into a boundary that is nested or empty).
 */

import { emptyDiagram, type Diagram, type DiagramEdge, type DiagramGroup, type DiagramNode, type EdgeArrow, type NodeShape } from './model.js'

export interface Parsed {
  diagram: Diagram
  /** Lines the parser refused to interpret, with the reason. Empty when the whole source was understood. */
  refused: string[]
}

/** The element keywords this renderer draws, and the symbol each one becomes. */
const SHAPES: Record<string, NodeShape> = {
  component: 'rect',
  node: 'rect',
  rectangle: 'rect',
  artifact: 'rect',
  state: 'rect',
  database: 'cylinder',
  // PlantUML draws an entity as a cylinder in a component diagram; `entity` in an ER diagram is a different
  // symbol, and that diagram family is not one this renderer accepts.
  entity: 'cylinder',
  // A use case is an ellipse. The `circle` symbol is written as an ellipse whose radii follow the box, so it
  // reads as the familiar use-case oval; `stadium` is the pill a terminal state is drawn as.
  usecase: 'circle',
}

/** The keywords that open a boundary around what is written inside them. */
const BOUNDARY = new Set(['package', 'folder', 'node', 'component', 'rectangle', 'artifact'])

/** Element keywords this renderer deliberately does not draw, with the reason it gives for each. */
const NOT_DRAWN: Record<string, string> = {
  actor: 'an actor is a stick figure, not one of the shapes this renderer draws',
  participant: 'a participant is a lifeline, not one of the shapes this renderer draws',
  class: 'a class box has compartments this renderer does not draw',
  object: 'an object box has compartments this renderer does not draw',
  interface: 'an interface is a circle or a boxed stereotype, neither of which this renderer draws',
  enum: 'an enum box has compartments this renderer does not draw',
  annotation: 'an annotation is not one of the shapes this renderer draws',
  cloud: 'a cloud outline is not one of the shapes this renderer draws',
  frame: 'a frame tab is not one of the shapes this renderer draws',
  card: 'a card is not one of the shapes this renderer draws',
  file: 'a file outline is not one of the shapes this renderer draws',
  agent: 'an agent is not one of the shapes this renderer draws',
  boundary: 'the boundary symbol is not one of the shapes this renderer draws',
  control: 'the control symbol is not one of the shapes this renderer draws',
  collections: 'a collections symbol is not one of the shapes this renderer draws',
  queue: 'a queue is not one of the shapes this renderer draws',
  stack: 'a stack is not one of the shapes this renderer draws',
  storage: 'a storage symbol is not one of the shapes this renderer draws',
  note: 'a note is not one of the shapes this renderer draws',
  legend: 'a legend is not one of the shapes this renderer draws',
}

/** A sequence fragment or lifeline event: lines that only make sense in a diagram this renderer refuses. */
const FRAGMENT = new Set(['sequence', 'alt', 'opt', 'loop', 'par', 'group', 'ref', 'break', 'critical', 'activate', 'deactivate', 'destroy', 'create', 'newpage', 'autonumber'])

const ARROW = /^(.+?)\s*(<\|?|[*o])?(-{2,}|\.{2,})(\|?>|[*o])?\s*(.+?)(?:\s*:\s*(.+))?$/
const SHAPE_KEYWORDS = Object.keys(SHAPES)
const DECLARED = new RegExp('^(' + SHAPE_KEYWORDS.join('|') + ')\\s+(.+)$')
const QUOTED_ALIAS = /^["'](.+?)["']\s+as\s+([A-Za-z_][\w-]*)$/
const BRACKET_ALIAS = /^\[(.+?)\]\s+as\s+([A-Za-z_][\w-]*)$/
const PLAIN_ALIAS = /^([A-Za-z_][\w.-]*)\s+as\s+([A-Za-z_][\w-]*)$/
const BRACKET = /^\[(.+?)\]$/
const IGNORED = /^(skinparam|!theme|!define|!include|!pragma|hide|show|scale|left to right direction|top to bottom direction|together|allowmixing)\b/

interface Builder {
  nodes: Map<string, DiagramNode>
  edges: DiagramEdge[]
  /** The source line of each edge, so a refusal decided after the whole file is read still names its line. */
  edgeLines: number[]
  /** The innermost boundary open when each edge was written, to catch an edge that leaves and re-enters it. */
  edgeScopes: Array<string | undefined>
  groups: DiagramGroup[]
  open: DiagramGroup[]
  /** Node ids an edge wrote first. A name that turns out to be a block is removed again, not drawn as a box. */
  implicit: Set<string>
}

interface Reference {
  id: string
  label?: string
  shape?: NodeShape
}

function ensure(builder: Builder, id: string, label?: string, shape?: NodeShape, implicit = false): void {
  const existing = builder.nodes.get(id)
  if (existing === undefined) {
    builder.nodes.set(id, {
      id,
      role: 'normal',
      ...(label === undefined ? {} : { label }),
      ...(shape === undefined ? {} : { shape }),
    })
    if (implicit) builder.implicit.add(id)
    // Membership is decided where the node is first written: the innermost open boundary.
    const innermost = builder.open[builder.open.length - 1]
    if (innermost !== undefined && !innermost.members.includes(id)) innermost.members.push(id)
    return
  }
  // An explicit declaration settles what a name is: it stays a box even when a block has the same name.
  if (!implicit) builder.implicit.delete(id)
  if (label !== undefined && (existing.label === undefined || existing.label === '')) existing.label = label
  // A bare reference may have been written first: the later declaration is what states the symbol.
  if (shape !== undefined && existing.shape === undefined) existing.shape = shape
}

/** A component reference: `[text]`, `X`, or a quoted name. Returns the id, the label and any shape it stated. */
function reference(token: string): Reference {
  const text = token.trim()
  const bracket = BRACKET.exec(text)
  if (bracket !== null) {
    const label = bracket[1].trim()
    return { id: label, label, shape: 'rect' }
  }
  const quoted = /^["'](.+?)["']$/.exec(text)
  if (quoted !== null) return { id: quoted[1], label: quoted[1] }
  return { id: text }
}

function keywordOf(line: string): string {
  return line.split(/[\s{]/)[0].toLowerCase()
}

/** The id and label an opening boundary line states. An alias is the id, because edges will name it. */
function boundaryOf(declaration: string, keyword: string, ordinal: number): { id: string; label: string } {
  const rest = declaration.slice(keyword.length).trim()
  const alias = QUOTED_ALIAS.exec(rest) ?? BRACKET_ALIAS.exec(rest) ?? PLAIN_ALIAS.exec(rest)
  if (alias !== null) return { id: alias[2], label: alias[1] }
  const label = rest.replace(/^["']|["']$/g, '')
  return { id: 'group-' + String(ordinal), label: label === '' ? keyword : label }
}

interface ArrowParts {
  from: Reference
  to: Reference
  label: string
  dashed: boolean
  arrow: EdgeArrow
}

/**
 * Read one arrow line.
 *
 * Returns the edge it states, `undefined` when the line is not an arrow at all, or the reason it is refused.
 * The arrow the source writes decides which end carries the mark: `A <|-- B` is B generalising to A, so the
 * edge runs from B to A with the triangle at A, and `A *-- B` puts its diamond at A, so A is the source.
 */
function readArrow(line: string): ArrowParts | string | undefined {
  const match = ARROW.exec(line)
  if (match === null) return undefined
  const left = reference(match[1])
  const right = reference(match[5])
  const leftMark = match[2]
  const rightMark = match[4]
  const dotted = match[3].startsWith('.')
  const label = (match[6] ?? '').trim()

  if (leftMark !== undefined && rightMark !== undefined) {
    return 'an edge marked at both ends is not one this renderer draws'
  }
  if (leftMark === '*' || leftMark === 'o' || rightMark === '*' || rightMark === 'o') {
    if (dotted) return 'a dotted composition or aggregation is not one this renderer draws'
    const atRight = rightMark === '*' || rightMark === 'o'
    const mark = atRight ? rightMark : leftMark
    return {
      from: atRight ? right : left,
      to: atRight ? left : right,
      label,
      dashed: false,
      arrow: mark === '*' ? 'composition' : 'aggregation',
    }
  }
  if (leftMark !== undefined) {
    return {
      from: right,
      to: left,
      label,
      dashed: dotted,
      arrow: leftMark === '<|' ? (dotted ? 'realization' : 'generalization') : dotted ? 'dependency' : 'association',
    }
  }
  if (rightMark !== undefined) {
    return {
      from: left,
      to: right,
      label,
      dashed: dotted,
      arrow: rightMark === '|>' ? (dotted ? 'realization' : 'generalization') : dotted ? 'dependency' : 'association',
    }
  }
  return 'a line with no arrow end is not one this renderer draws; name the end it points at'
}

export function fromPlantUml(source: string, title = 'plantuml'): Parsed {
  const lines = source.split(/\r?\n/)
  const refused: string[] = []
  const builder: Builder = { nodes: new Map(), edges: [], edgeLines: [], edgeScopes: [], groups: [], open: [], implicit: new Set() }
  let startId: string | undefined
  let seenAny = false
  let groupCount = 0

  lines.forEach((raw, index) => {
    const line = raw.replace(/'.*$/, '').trim()
    if (line === '') return
    const where = 'line ' + String(index + 1) + ': '

    if (/^@(start|end)uml\b/.test(line)) return
    seenAny = true
    if (/^title\b/.test(line)) return
    if (IGNORED.test(line)) return

    const keyword = keywordOf(line)
    const notDrawn = NOT_DRAWN[keyword]
    if (notDrawn !== undefined) {
      refused.push(where + '`' + keyword + '`: ' + notDrawn)
      return
    }
    if (FRAGMENT.has(keyword)) {
      refused.push(where + '`' + keyword + '`: a sequence statement is not part of a drawing this renderer makes')
      return
    }

    if (line === '}') {
      const closing = builder.open.pop()
      if (closing !== undefined) {
        const container = builder.open[builder.open.length - 1]
        if (container !== undefined) closing.parent = container.id
        builder.groups.push(closing)
      }
      return
    }

    if (line.endsWith('{')) {
      const declaration = line.slice(0, -1).trim()
      const opener = keywordOf(declaration)
      if (!BOUNDARY.has(opener)) {
        const reason = SHAPES[opener] === undefined
          ? '`' + declaration + '` is not a boundary this renderer draws'
          : 'a `' + opener + '` block is not a boundary this renderer draws'
        refused.push(where + reason)
        return
      }
      groupCount += 1
      const boundary = boundaryOf(declaration, opener, groupCount)
      builder.open.push({ id: boundary.id, label: boundary.label, members: [] })
      return
    }

    if (line === '[*] --> [*]') return

    const startMarker = /^\[\*\]\s*-->\s*(.+)$/.exec(line)
    if (startMarker !== null) {
      const target = reference(startMarker[1])
      ensure(builder, target.id, target.label, target.shape)
      if (startId === undefined) startId = target.id
      return
    }

    const declared = DECLARED.exec(line)
    if (declared !== null) {
      const shape = SHAPES[declared[1]] as NodeShape
      const rest = declared[2].trim()
      const quoted = QUOTED_ALIAS.exec(rest)
      if (quoted !== null) {
        ensure(builder, quoted[2], quoted[1], shape)
        return
      }
      const bracketed = BRACKET_ALIAS.exec(rest)
      if (bracketed !== null) {
        ensure(builder, bracketed[2], bracketed[1], shape)
        return
      }
      const plain = PLAIN_ALIAS.exec(rest)
      if (plain !== null) {
        ensure(builder, plain[2], plain[1], shape)
        return
      }
      const written = reference(rest)
      ensure(builder, written.id, written.label, shape)
      return
    }

    const arrow = readArrow(line)
    if (arrow !== undefined) {
      if (typeof arrow === 'string') {
        refused.push(where + arrow)
        return
      }
      ensure(builder, arrow.from.id, arrow.from.label, arrow.from.shape, true)
      ensure(builder, arrow.to.id, arrow.to.label, arrow.to.shape, true)
      builder.edges.push({
        from: arrow.from.id,
        to: arrow.to.id,
        label: arrow.label,
        ...(arrow.dashed ? { dashed: true } : {}),
        arrow: arrow.arrow,
      })
      builder.edgeLines.push(index + 1)
      builder.edgeScopes.push(builder.open[builder.open.length - 1]?.id)
      return
    }

    const single = BRACKET.exec(line)
    if (single !== null) {
      ensure(builder, single[1].trim(), single[1].trim(), 'rect')
      return
    }

    refused.push(where + '`' + line + '` is not something this renderer draws')
  })

  // A block's name can be written as an edge endpoint: `Web <|-- Mobile` points at the `package Web`
  // block. PlantUML allows it and so does UML; what it must not do is become a second box called `Web`.
  // An endpoint an arrow created is re-read as the boundary it names, and the edge attaches to that
  // boundary's rectangle. A name that is not a declared block stays an implicit element, which PlantUML
  // also allows.
  const boundaryNames = new Map<string, string>()
  const disputedNames = new Set<string>()
  for (const group of builder.groups) {
    for (const name of [group.id, group.label]) {
      const existing = boundaryNames.get(name)
      if (existing !== undefined && existing !== group.id) disputedNames.add(name)
      else boundaryNames.set(name, group.id)
    }
  }
  for (const name of disputedNames) boundaryNames.delete(name)

  // Only a node an arrow wrote can turn out to be a boundary. An explicitly declared element of the same
  // name stays a box: the source said what it is.
  const boundaryAt = new Map<string, string>()
  const ambiguousAt = new Set<string>()
  for (const id of builder.implicit) {
    if (disputedNames.has(id)) {
      ambiguousAt.add(id)
      builder.nodes.delete(id)
    } else {
      const groupId = boundaryNames.get(id)
      if (groupId === undefined) continue
      boundaryAt.set(id, groupId)
      builder.nodes.delete(id)
    }
    for (const group of builder.groups) {
      const at = group.members.indexOf(id)
      if (at >= 0) group.members.splice(at, 1)
    }
  }

  const groupById = new Map(builder.groups.map((group) => [group.id, group] as const))
  const childrenOf = new Map<string, string[]>()
  for (const group of builder.groups) {
    if (group.parent === undefined) continue
    childrenOf.set(group.parent, [...(childrenOf.get(group.parent) ?? []), group.id])
  }
  // An empty boundary is not drawn, so an edge cannot attach to it. Look through nested boundaries, which
  // are drawn only when something inside them is.
  const drawable = new Map<string, boolean>()
  const hasContents = (id: string): boolean => {
    const known = drawable.get(id)
    if (known !== undefined) return known
    const group = groupById.get(id) as DiagramGroup
    let found = false
    for (const member of group.members) {
      if (builder.nodes.has(member)) {
        found = true
        break
      }
    }
    if (!found) {
      for (const child of childrenOf.get(id) ?? []) {
        if (hasContents(child)) {
          found = true
          break
        }
      }
    }
    drawable.set(id, found)
    return found
  }
  const boundaryLabel = (id: string): string => (groupById.get(id) as DiagramGroup).label
  const within = (scope: string | undefined, boundary: string): boolean => {
    let cursor = scope
    while (cursor !== undefined) {
      if (cursor === boundary) return true
      cursor = (groupById.get(cursor) as DiagramGroup).parent
    }
    return false
  }

  const keptEdges: DiagramEdge[] = []
  builder.edges.forEach((edge, index) => {
    const where = 'line ' + String(builder.edgeLines[index]) + ': '
    const fromBoundary = boundaryAt.get(edge.from)
    const toBoundary = boundaryAt.get(edge.to)
    if (ambiguousAt.has(edge.from) || ambiguousAt.has(edge.to)) {
      const name = ambiguousAt.has(edge.from) ? edge.from : edge.to
      refused.push(where + '`' + name + '` is the name of more than one block; an edge cannot say which boundary it means')
      return
    }
    if (fromBoundary !== undefined && toBoundary !== undefined) {
      refused.push(where + '`' + boundaryLabel(fromBoundary) + '` and `' + boundaryLabel(toBoundary) + '` are boundaries, not elements; an edge between two boundaries is not one this renderer draws')
      return
    }
    const boundary = fromBoundary ?? toBoundary
    if (boundary !== undefined) {
      const group = groupById.get(boundary) as DiagramGroup
      if (group.parent !== undefined) {
        refused.push(where + '`' + group.label + '` is a block inside `' + boundaryLabel(group.parent) + '`, not an element; an edge to a nested boundary would have to enter another boundary')
        return
      }
      if (within(builder.edgeScopes[index], boundary)) {
        refused.push(where + '`' + group.label + '` is the block this edge is written inside, not an element; an edge cannot leave a boundary and arrive at the same boundary')
        return
      }
      if (!hasContents(boundary)) {
        refused.push(where + '`' + group.label + '` is a block with nothing drawn inside it, so there is no rectangle to attach the edge to')
        return
      }
    }
    keptEdges.push({
      ...edge,
      ...(fromBoundary === undefined ? {} : { from: fromBoundary }),
      ...(toBoundary === undefined ? {} : { to: toBoundary }),
    })
  })
  builder.edges = keptEdges

  if (!seenAny || builder.nodes.size === 0) {
    return { diagram: emptyDiagram(title, 'no nodes found'), refused }
  }

  const diagram: Diagram = {
    kind: startId === undefined ? 'graph' : 'machine',
    title,
    ...(startId === undefined ? {} : { init: startId }),
    nodes: [...builder.nodes.values()],
    edges: builder.edges,
    ...(builder.groups.length === 0 ? {} : { groups: builder.groups }),
    caption:
      'plantuml, ' + String(builder.nodes.size) + ' box' + (builder.nodes.size === 1 ? '' : 'es') + ', ' +
      String(builder.edges.length) + ' arrow' + (builder.edges.length === 1 ? '' : 's') +
      (refused.length === 0 ? '' : ', ' + String(refused.length) + ' line(s) refused'),
  }
  return { diagram, refused }
}

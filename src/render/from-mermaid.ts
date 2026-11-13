/**
 * Mermaid text to a diagram, for the subset this renderer can actually draw.
 *
 * The subset is chosen by what a reader of an architecture document writes: a flowchart of boxes and
 * arrows, a state diagram with a start marker, and the group syntax that turns a flat graph into a layered
 * one. Everything outside it is refused **with its line number** rather than half-drawn: a picture that
 * silently drops a lifeline or an interaction is worse than no picture, because it looks complete.
 *
 * Supported:
 *
 * - `graph TD|TB|LR` and `flowchart TD|TB|LR`; `LR` and `RL` turn the drawing the way PlantUML's
 *   `left to right direction` does, and `TD`/`TB`/`BT` leave it top to bottom;
 * - node declarations `A[text]`, `A(text)`, `A{text}`, `A((text))`, and a bare `A`;
 * - edges `-->`, `---`, `-.->`, with a label as `-->|text|` or `-- text -->`; a thick line (`==>`) is refused;
 * - `stateDiagram` / `stateDiagram-v2`: `[*] --> A`, `A --> B: event`, `state "text" as id`;
 * - `subgraph name ... end`, which becomes a group;
 * - `%%` comments and blank lines.
 *
 * Refused, by name: `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt`, `pie`, `journey`, `mindmap`,
 * `timeline`, `quadrantChart`, `gitGraph`, `C4Context`, and `click`/`style`/`classDef` directives.
 */

import { emptyCaption, emptyCaptionOf, emptyDiagram, type Diagram, type DiagramEdge, type DiagramGroup, type DiagramNode } from './model.js'

export interface Parsed {
  diagram: Diagram
  /** Lines the parser refused to interpret, with the reason. Empty when the whole source was understood. */
  refused: string[]
  /** Lines understood and dropped, with the reason. Mermaid's own layout hints are read and have no effect here. */
  ignored: string[]
}

const CURVED_EDGE = /^(.+?)\s*(-->|---|-\.->|==>)\s*(?:\|([^|]*)\|\s*)?(.+)$/
const LABELLED_EDGE = /^(.+?)\s*--\s*([^->]+?)\s*-->\s*(.+)$/
const NODE = /^([A-Za-z_][\w-]*)\s*(?:\[\((.*)\)\]|\[\[(.*)\]\]|\[(.*)\]|\((.*)\)|\{(.*)\}|<<(.*)>>)?$/
const TRANSITION = /^([A-Za-z_][\w-]*|\[\*\])\s*-->\s*([A-Za-z_][\w-]*|\[\*\])\s*(?::\s*(.*))?$/
const STATE_ALIAS = /^state\s+["'](.+?)["']\s+as\s+([A-Za-z_][\w-]*)$/
const DIRECTIVE = /^(click|style|classDef|class|linkStyle|accTitle|accDescr)\b/
const UNSUPPORTED = new Set([
  'sequencediagram',
  'classdiagram',
  'erdiagram',
  'gantt',
  'pie',
  'journey',
  'mindmap',
  'timeline',
  'quadrantchart',
  'gitgraph',
  'c4context',
  'requirementdiagram',
  'sankey-beta',
])

interface Builder {
  nodes: Map<string, DiagramNode>
  edges: DiagramEdge[]
  groups: DiagramGroup[]
  /** The boundaries currently open, outermost first. */
  open: DiagramGroup[]
}

function ensure(builder: Builder, id: string, label?: string, shape?: DiagramNode['shape']): void {
  const existing = builder.nodes.get(id)
  if (existing === undefined) {
    builder.nodes.set(id, {
      id,
      role: 'normal',
      ...(label === undefined ? {} : { label }),
      ...(shape === undefined ? {} : { shape }),
    })
    // Membership is decided where the node is first written: the innermost open boundary. Naming it again
    // later from an outer boundary does not move it - the outer boundary holds it through `parent`.
    const innermost = builder.open[builder.open.length - 1]
    if (innermost !== undefined && !innermost.members.includes(id)) innermost.members.push(id)
    return
  }
  if (label !== undefined && (existing.label === undefined || existing.label === '')) existing.label = label
}

function nodeFrom(token: string): { id: string; label?: string; shape?: DiagramNode['shape'] } | undefined {
  const match = NODE.exec(token.trim())
  if (match === null) return undefined
  const id = match[1]
  const label = [match[2], match[3], match[4], match[5], match[6], match[7]].find((value) => value !== undefined && value.trim() !== '')
  // Group 2 `[(x)]` is a datastore, 3 `[[x]]` a subroutine, 4 `[x]` a rectangle, 5 `(x)` a rounded box, 6 `{x}` a
  // decision, 7 `<<x>>` a hexagon. Mermaid's own mapping; a shape the notation did not state stays undefined.
  const shape: DiagramNode['shape'] | undefined =
    match[2] !== undefined
      ? 'cylinder'
      : match[3] !== undefined
        ? 'subroutine'
        : match[4] !== undefined
          ? 'rect'
          : match[5] !== undefined
            ? 'stadium'
            : match[6] !== undefined
              ? 'diamond'
              : match[7] !== undefined
                ? 'hexagon'
                : undefined
  return {
    id,
    ...(label === undefined ? {} : { label: label.trim().replace(/^["']|["']$/g, '') }),
    ...(shape === undefined ? {} : { shape }),
  }
}

export function fromMermaid(source: string, title = 'mermaid'): Parsed {
  const lines = source.split(/\r?\n/)
  const refused: string[] = []
  const ignored: string[] = []
  const builder: Builder = { nodes: new Map(), edges: [], groups: [], open: [] }
  let mode: 'none' | 'graph' | 'state' = 'none'
  const direction: { value: 'down' | 'right' } = { value: 'down' }
  let startId: string | undefined
  const openedAt = new Map<string, number>()
  let endCount = 0

  const push = (edge: DiagramEdge): void => {
    builder.edges.push(edge)
  }

  // `%%{init: {...}}%%` is a configuration block, and Mermaid allows it over several lines. Its lines are not diagram source:
  // reading them as lines refused the body of a block the notation explicitly allows.
  const configuration = new Set<number>()
  {
    let open = false
    lines.forEach((line, index) => {
      const text = line.trim()
      if (!open && !text.startsWith('%%{')) return
      configuration.add(index)
      if (open) {
        if (text.includes('}%%')) open = false
        return
      }
      // The block can open and close on one line, or open here and close later.
      if (!text.slice(text.indexOf('%%{') + 3).includes('}%%')) open = true
    })
    if (configuration.size > 0) {
      ignored.push('a `%%{ }%%` configuration block does not change the drawing here: the palette and the type scale are fixed')
    }
  }

  lines.forEach((raw, index) => {
    if (configuration.has(index)) return
    const line = raw.replace(/%%(.*)$/, '').trim()
    if (line === '') return
    const where = 'line ' + String(index + 1) + ': '
    const lower = line.toLowerCase()
    const keyword = lower.split(/[\s{}]/)[0]

    if (UNSUPPORTED.has(keyword)) {
      refused.push(where + '`' + keyword + '` is not a diagram this renderer draws')
      return
    }
    // A style, an interaction or an accessibility directive changes nothing this renderer draws, so it is dropped with its reason.
    // Refusing it said "ignores" while reporting a refusal - the reader was told two different things in one line.
    if (DIRECTIVE.test(line)) {
      const name = line.split(/\s/)[0] as string
      const reason = /^(classDef|class|style)$/i.test(name)
        ? 'is a style this renderer does not have: the palette is fixed'
        : /^linkStyle$/i.test(name)
          ? 'changes an edge line style, which is fixed here'
          : /^click$/i.test(name)
            ? 'is an interaction, and this drawing is a picture'
            : 'is accessibility metadata; the drawing is labelled from its title'
      ignored.push(where + '`' + name + '` ' + reason)
      return
    }
    if (/^(graph|flowchart)\b/.test(lower)) {
      mode = 'graph'
      // The direction token is the same statement PlantUML's `left to right direction` makes, and the engine below
      // knows how to honour it: `LR` turns the drawing, `TD`/`TB` leave it as it is.
      const heading = /\b(LR|RL|TD|TB|BT)\b/.exec(line)
      if (heading !== null && (heading[1] === 'LR' || heading[1] === 'RL')) direction.value = 'right'
      return
    }
    if (/^statediagram(-v2)?\b/.test(lower)) {
      mode = 'state'
      return
    }
    if (/^subgraph\b/.test(lower)) {
      // `subgraph id[Label]` and `subgraph Label` both name a group; the bracketed form used to keep the whole text as its
      // label, so a reader saw `id1["Group A"]` written across the boundary.
      const spelled = /^subgraph\s+([A-Za-z_][\w-]*)\s*\[(.*)\]\s*$/i.exec(line)
      const label =
        spelled !== null
          ? (spelled[2] as string).trim().replace(/^["']|["']$/g, '')
          : line.replace(/^subgraph\b/i, '').trim().replace(/^["']|["']$/g, '')
      // The id is positional on purpose: a label change must keep the id, or renaming a group would read as one group
      // removed and another added in the structural diff. PlantUML can offer a stable alias (`as`), so the two
      // notations agree about what the drawing *means* and differ only in the id they invent for a boundary.
      const id = 'subgraph-' + String(++endCount)
      openedAt.set(id, index + 1)
      builder.open.push({ id, label: label === '' ? id : label, members: [] })
      return
    }
    if (mode === 'state') {
      // `state Busy { ... }` is a composite state: a boundary whose contents are states, closed by a brace rather than `end`.
      const composite = /^state\s+(?:["'](.+?)["']\s+as\s+)?([A-Za-z_][\w-]*)\s*\{\s*$/.exec(line)
      if (composite !== null) {
        const id = composite[2] as string
        const label = (composite[1] as string | undefined) ?? id
        // The composite state *is* the boundary: a state of the same name that a start marker or an edge already created is
        // the same thing seen from outside, and keeping both drew a box and a rectangle with one name.
        builder.nodes.delete(id)
        openedAt.set(id, index + 1)
        builder.open.push({ id, label, members: [] })
        return
      }
    }

    if (lower === 'end' || lower === '}') {
      const closed = builder.open.pop()
      if (closed !== undefined) {
        const container = builder.open[builder.open.length - 1]
        if (container !== undefined) closed.parent = container.id
        builder.groups.push(closed)
        // A subgraph with nothing inside it has no rectangle to draw. Dropping it at paint time left a reader with a group
        // that vanished and no word about it; the PlantUML reader refuses the same source, and so does this one now.
        const line = openedAt.get(closed.id)
        const holdsGroup = builder.groups.some((group) => group.parent === closed.id)
        if (line !== undefined && closed.members.length === 0 && !holdsGroup) {
          refused.push('line ' + String(line) + ': `' + closed.label + '` is a subgraph with nothing inside it, so there is no rectangle to draw')
        }
      }
      return
    }

    // Mermaid allows `direction LR` inside a subgraph. This renderer has one direction per drawing, so the hint is dropped
    // with its reason rather than refused as a line it cannot draw.
    if (/^direction\s+(tb|td|bt|lr|rl)\b/i.test(line) && builder.open.length > 0) {
      ignored.push(where + '`' + line + '` sets a direction inside a subgraph: this renderer has one direction per drawing')
      return
    }

    if (mode === 'state') {
      // A state can be typed - `state fork <<choice>>`, `state X <<fork>>` - and nothing here draws a state type: it is stripped
      // from the name and reported, the way a PlantUML stereotype is.
      const typed = /^state\s+([A-Za-z_][\w-]*)\s*(<<[^<>]*>>)\s*$/.exec(line)
      if (typed !== null) {
        ensure(builder, typed[1] as string)
        ignored.push(where + '`' + (typed[2] as string) + '` is a state type this renderer does not draw')
        return
      }
      // `note right of X : text` names a side and a box, exactly as PlantUML's form does, and is placed the same way: a hidden
      // edge carries the side, so the note lands beside the state without a second layout rule.
      const placed = /^note\s+(left|right|top|bottom)\s+of\s+([A-Za-z_][\w-]*)\s*:\s*(.+)$/.exec(line)
      if (placed !== null) {
        const target = placed[2] as string
        const noteId = 'note-' + target
        ensure(builder, target)
        ensure(builder, noteId, (placed[3] as string).trim(), 'note')
        const side = placed[1] as string
        builder.edges.push({
          from: target,
          to: noteId,
          label: '',
          hint: side === 'top' ? 'up' : side === 'bottom' ? 'down' : side,
          invisible: true,
        } as DiagramEdge)
        return
      }

      const alias = STATE_ALIAS.exec(line)
      if (alias !== null) {
        ensure(builder, alias[2], alias[1])
        return
      }
      const transition = TRANSITION.exec(line)
      if (transition === null) {
        // A bare `state X` declaration, or a state named on its own line.
        const bare = /^state\s+([A-Za-z_][\w-]*)$/.exec(line)
        if (bare !== null) {
          ensure(builder, bare[1])
          return
        }
        if (/^[A-Za-z_][\w-]*$/.test(line)) {
          ensure(builder, line)
          return
        }
        refused.push(where + '`' + line + '` is not a state transition this renderer draws')
        return
      }
      const from = transition[1]
      const to = transition[2]
      const label = (transition[3] ?? '').trim()
      if (from === '[*]') {
        // A start marker names the state it enters, not a box of its own.
        ensure(builder, to)
        if (startId === undefined) startId = to
        return
      }
      if (to === '[*]') {
        ensure(builder, from)
        push({ from, to: from, label: label === '' ? 'end' : label, dashed: true })
        return
      }
      ensure(builder, from)
      ensure(builder, to)
      // A transition is the same statement as PlantUML's `-->`: an association.
      push({ from, to, label, arrow: 'association' })
      return
    }

    const labelled = LABELLED_EDGE.exec(line)
    if (labelled !== null) {
      const left = nodeFrom(labelled[1])
      const right = nodeFrom(labelled[3])
      if (left === undefined || right === undefined) {
        refused.push(where + '`' + line + '` does not name two nodes')
        return
      }
      ensure(builder, left.id, left.label, left.shape)
      ensure(builder, right.id, right.label, right.shape)
      push({ from: left.id, to: right.id, label: labelled[2].trim() })
      return
    }

    const edge = CURVED_EDGE.exec(line)
    if (edge !== null) {
      const left = nodeFrom(edge[1])
      const right = nodeFrom(edge[4])
      if (left === undefined || right === undefined) {
        refused.push(where + '`' + line + '` does not name two nodes')
        return
      }
      ensure(builder, left.id, left.label, left.shape)
      ensure(builder, right.id, right.label, right.shape)
      // The token states the line and the head, and the two notations have to mean the same thing by it: `-->` is an
      // association, `---` a connection with no head, `-.->` a dashed dependency. `==>` is a thick line, which this
      // renderer does not draw - drawing it dashed would state a line the source did not ask for.
      if (edge[2] === '==>') {
        refused.push(where + '`' + line + '` is a thick line: this renderer draws plain and dashed arrows, not heavy ones')
        return
      }
      const kind = edge[2] === '-.->' ? 'dependency' : edge[2] === '---' ? 'none' : 'association'
      push({
        from: left.id,
        to: right.id,
        label: (edge[3] ?? '').trim(),
        arrow: kind,
        ...(edge[2] === '-.->' ? { dashed: true } : {}),
      })
      return
    }

    const single = nodeFrom(line)
    if (single !== undefined) {
      ensure(builder, single.id, single.label, single.shape)
      return
    }

    refused.push(where + '`' + line + '` is not something this renderer draws')
  })

  if (mode === 'none') {
    // A source with nothing in it is a statement too, and the same one the PlantUML reader makes: no diagram.
    if (refused.length === 0) {
      refused.push('the source has no diagram in it: no line named an element or a relationship')
    }
    return { diagram: emptyDiagram(title, 'no mermaid diagram found'), refused, ignored }
  }

  // A composite state is the boundary, so any node of the same name an edge created is the same thing seen from outside.
  // PlantUML resolves this the same way; keeping both drew a box and a rectangle with one name and crashed the painter.
  for (const group of builder.groups) builder.nodes.delete(group.id)

  if (builder.nodes.size === 0) {
    if (refused.length === 0) {
      refused.push('the source has no diagram in it: no line named an element or a relationship')
    }
    return { diagram: emptyDiagram(title, emptyCaptionOf(refused)), refused, ignored }
  }

  const diagram: Diagram = {
    kind: mode === 'state' ? 'machine' : 'graph',
    title,
    ...(startId === undefined ? {} : { init: startId }),
    nodes: [...builder.nodes.values()],
    edges: builder.edges,
    ...(builder.groups.length === 0 ? {} : { groups: builder.groups }),
    ...(direction.value === 'right' ? { direction: direction.value } : {}),
    caption:
      mode + ', ' + String(builder.nodes.size) + ' box' + (builder.nodes.size === 1 ? '' : 'es') + ', ' +
      String(builder.edges.length) + ' arrow' + (builder.edges.length === 1 ? '' : 's') +
      (refused.length === 0 ? '' : ', ' + String(refused.length) + ' line(s) refused'),
  }
  return { diagram, refused, ignored }
}

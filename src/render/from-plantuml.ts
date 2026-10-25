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
 * - `component X`, `component "text" as X`, `[text] as X`, `[text]`;
 * - `package "text" { ... }`, `node`, `folder`, `cloud`, `database` - a group, closed by `}`;
 * - `X --> Y`, `X ---> Y`, `X ..> Y`, `X --> Y : label`, arrow either direction;
 * - `state X`, `state "text" as X`, and `[*] --> X` for a start marker;
 * - `'` comments and `skinparam`/`!theme` directives.
 *
 * Refused, by name: `sequence`, `actor`, `participant`, `usecase`, `class`, `object`, `note`, `legend`,
 * `alt`/`opt`/`loop`/`par` and any other fragment keyword.
 */

import { emptyDiagram, type Diagram, type DiagramEdge, type DiagramGroup, type DiagramNode } from './model.js'

export interface Parsed {
  diagram: Diagram
  /** Lines the parser refused to interpret, with the reason. Empty when the whole source was understood. */
  refused: string[]
}

const ARROW = /^(.+?)\s*(<?)(-{2,}|\.{2,})(>?)\s*(.+?)(?:\s*:\s*(.+))?$/
const DECLARED = /^(component|package|node|folder|cloud|database|state|artifact|frame|rectangle)\s+(.+)$/
const QUOTED_ALIAS = /^["'](.+?)["']\s+as\s+([A-Za-z_][\w-]*)$/
const BRACKET_ALIAS = /^\[(.+?)\]\s+as\s+([A-Za-z_][\w-]*)$/
const BRACKET = /^\[(.+?)\]$/
const UNSUPPORTED = /^(actor|participant|usecase|class|object|note|legend|alt|opt|loop|par|group\s|ref\s|activate|deactivate|destroy|create|newpage)\b/
const IGNORED = /^(skinparam|!theme|!define|!include|hide|show|scale|left to right direction|top to bottom direction|together)\b/

interface Builder {
  nodes: Map<string, DiagramNode>
  edges: DiagramEdge[]
  groups: DiagramGroup[]
  open: DiagramGroup[]
}

function ensure(builder: Builder, id: string, label?: string): void {
  const existing = builder.nodes.get(id)
  if (existing === undefined) {
    builder.nodes.set(id, { id, role: 'normal', ...(label === undefined ? {} : { label }) })
    for (const group of builder.open) if (!group.members.includes(id)) group.members.push(id)
    return
  }
  if (label !== undefined && (existing.label === undefined || existing.label === '')) existing.label = label
  for (const group of builder.open) if (!group.members.includes(id)) group.members.push(id)
}

/** A component reference: `[text]`, `X`, or a quoted name. Returns the id and the label it carried. */
function reference(token: string): { id: string; label?: string } {
  const text = token.trim()
  const bracket = BRACKET.exec(text)
  if (bracket !== null) {
    const label = bracket[1].trim()
    return { id: label, label }
  }
  const quoted = /^["'](.+?)["']$/.exec(text)
  if (quoted !== null) return { id: quoted[1], label: quoted[1] }
  return { id: text }
}

export function fromPlantUml(source: string, title = 'plantuml'): Parsed {
  const lines = source.split(/\r?\n/)
  const refused: string[] = []
  const builder: Builder = { nodes: new Map(), edges: [], groups: [], open: [] }
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
    if (UNSUPPORTED.test(line)) {
      refused.push(where + '`' + (line.split(/\s/)[0] ?? '') + '` is not a diagram this renderer draws')
      return
    }

    if (line === '}') {
      const closing = builder.open.pop()
      if (closing !== undefined) builder.groups.push(closing)
      return
    }

    if (line.endsWith('{')) {
      const declaration = line.slice(0, -1).trim()
      const declared = DECLARED.exec(declaration)
      const label = declared === null ? declaration.replace(/^["']|["']$/g, '') : declared[2].replace(/^["']|["']$/g, '')
      groupCount += 1
      builder.open.push({ id: 'group-' + String(groupCount), label, members: [] })
      return
    }

    const declared = DECLARED.exec(line)
    if (declared !== null) {
      const rest = declared[2].trim()
      const quoted = QUOTED_ALIAS.exec(rest)
      if (quoted !== null) {
        ensure(builder, quoted[2], quoted[1])
        return
      }
      const bracketed = BRACKET_ALIAS.exec(rest)
      if (bracketed !== null) {
        ensure(builder, bracketed[2], bracketed[1])
        return
      }
      if (/^["'](.+?)["']$/.test(rest)) return // a group heading with no alias: nothing to draw
      const reference_ = reference(rest)
      ensure(builder, reference_.id, reference_.label)
      return
    }

    if (line === '[*] --> [*]') return

    const startMarker = /^\[\*\]\s*-->\s*(.+)$/.exec(line)
    if (startMarker !== null) {
      const target = reference(startMarker[1])
      ensure(builder, target.id, target.label)
      if (startId === undefined) startId = target.id
      return
    }

    const arrow = ARROW.exec(line)
    if (arrow !== null) {
      const left = arrow[2] === '<' ? arrow[5] : arrow[1]
      const right = arrow[2] === '<' ? arrow[1] : arrow[5]
      const from = reference(left)
      const to = reference(right)
      ensure(builder, from.id, from.label)
      ensure(builder, to.id, to.label)
      builder.edges.push({ from: from.id, to: to.id, label: (arrow[6] ?? '').trim(), ...(arrow[3].startsWith('.') ? { dashed: true } : {}) })
      return
    }

    const single = BRACKET.exec(line)
    if (single !== null) {
      ensure(builder, single[1].trim(), single[1].trim())
      return
    }

    refused.push(where + '`' + line + '` is not something this renderer draws')
  })

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

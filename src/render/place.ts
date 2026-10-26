/**
 * Where the boxes go.
 *
 * Two placements, chosen by the source:
 *
 * - **layered** (no groups): breadth-first rows, centred, no containment - the shape a state machine wants.
 * - **tree** (groups present): a group is a block, its members stack inside it, a nested group is a block inside
 *   its parent, and the top level stacks - the shape an architecture diagram wants, because a package whose
 *   members float somewhere else on the page is not showing containment at all.
 *
 * Split out of the painter so the two questions stay separate: this module decides positions, `paint.ts` decides
 * what to draw between them. A change to edge routing cannot move a box, and a change to nesting cannot move a
 * line.
 */

import { rankStates } from './layout.js'
import type { Diagram, DiagramGroup, DiagramNode } from './model.js'

/** Geometry of one placed box, before anything is drawn. */
export type Box = { x: number; y: number; width: number; height: number }

/** What a placement returns: every box, every drawn boundary, and how wide the content is. */
export interface Placement {
  boxes: Map<string, Box>
  groupRects: Map<string, Box>
  width: number
}

/** Geometry constants shared by both placements. */
export const MARGIN = 20
const NODE_HEIGHT = 34
const ROW_GAP = 58
const COLUMN_GAP = 30
const MIN_NODE_WIDTH = 88
const MAX_NODE_WIDTH = 220
const CHAR_WIDTH = 7.2
/** A boundary's inner padding and the strip its name sits in. */
const GROUP_PADDING = 10
const GROUP_HEADER = 16
/** Between two blocks stacked inside a boundary, and between two top-level blocks. */
const BLOCK_GAP = 14

/** A box wide enough for its label, clamped so a long id cannot dominate the page. */
export const nodeWidth = (label: string): number => Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, label.length * CHAR_WIDTH + 26))



/** The layered placement: breadth-first rows, centred, no containment. */
function placeByRanks(diagram: Diagram, nodes: DiagramNode[], top: number): Placement {
  const ranked = rankStates(diagram.nodes, diagram.edges, diagram.init)
  const rows: string[][] = [...ranked.rows]
  if (ranked.unreachable.length > 0) rows.push(ranked.unreachable)

  const boxes = new Map<string, Box>()
  let widest = 0
  rows.forEach((row, index) => {
    const widths = row.map((id) => nodeWidth(id))
    widest = Math.max(widest, widths.reduce((total, width) => total + width, 0) + Math.max(0, row.length - 1) * COLUMN_GAP)
    let x = 0
    row.forEach((id, position) => {
      boxes.set(id, { x, y: top + index * (NODE_HEIGHT + ROW_GAP), width: widths[position], height: NODE_HEIGHT })
      x += widths[position] + COLUMN_GAP
    })
  })
  rows.forEach((row) => {
    const rowWidth = row.reduce((total, id) => total + (boxes.get(id) as Box).width, 0) + Math.max(0, row.length - 1) * COLUMN_GAP
    const offset = (widest - rowWidth) / 2
    for (const id of row) (boxes.get(id) as Box).x += offset + MARGIN
  })
  return { boxes, groupRects: new Map(), width: widest + MARGIN * 2 }
}

/**
 * Which group each id belongs to, and which group contains which.
 *
 * Membership is read from `members`; containment is read from `parent`, because only the parser knows where a
 * boundary was written. A model assembled by hand may omit `parent`, and then containment is inferred from
 * member sets - the tightest superset wins - which is the best such a model can offer.
 *
 * Guards, because a model is data and data can be wrong: a parent that does not exist is ignored, a group that
 * contains itself or closes a cycle is treated as a root, and a member claimed by two groups belongs to the
 * tightest one, so a nested boundary is not drawn around nothing.
 */
function groupTree(groups: DiagramGroup[]): { owner: Map<string, string>; children: Map<string, string[]>; roots: string[] } {
  const byId = new Map(groups.map((group) => [group.id, group] as const))

  const owner = new Map<string, string>()
  const bySize = [...groups].sort((left, right) => left.members.length - right.members.length)
  for (const group of bySize) {
    for (const member of group.members) if (!owner.has(member)) owner.set(member, group.id)
  }

  const declared = (group: DiagramGroup): string | undefined => {
    const parent = group.parent
    if (parent === undefined || parent === group.id) return undefined
    return byId.has(parent) ? parent : undefined
  }

  const members = new Map(groups.map((group) => [group.id, new Set(group.members)] as const))
  const infer = (group: DiagramGroup): string | undefined => {
    let best: { id: string; size: number } | undefined
    for (const other of groups) {
      if (other.id === group.id) continue
      const outer = members.get(other.id) as Set<string>
      const inner = members.get(group.id) as Set<string>
      if (inner.size === 0 || inner.size >= outer.size) continue
      let contained = true
      for (const member of inner) {
        if (!outer.has(member)) {
          contained = false
          break
        }
      }
      if (contained && (best === undefined || outer.size < best.size)) best = { id: other.id, size: outer.size }
    }
    return best?.id
  }

  const parentOf = new Map<string, string>()
  for (const group of groups) {
    const parent = declared(group) ?? infer(group)
    if (parent !== undefined) parentOf.set(group.id, parent)
  }
  // A cycle would recurse forever: walk up from each group and drop the link that closes the loop.
  for (const group of groups) {
    const seen = new Set<string>([group.id])
    let cursor = parentOf.get(group.id)
    while (cursor !== undefined) {
      if (seen.has(cursor)) {
        parentOf.delete(cursor)
        break
      }
      seen.add(cursor)
      cursor = parentOf.get(cursor)
    }
  }

  const children = new Map<string, string[]>()
  const roots: string[] = []
  for (const group of groups) {
    const parent = parentOf.get(group.id)
    if (parent === undefined) roots.push(group.id)
    else children.set(parent, [...(children.get(parent) ?? []), group.id])
  }
  return { owner, children, roots }
}

interface Measured {
  width: number
  height: number
}

/** The tree placement: a boundary is a block, its contents stack inside it, the top level stacks. */
function placeByGroups(diagram: Diagram, nodes: DiagramNode[], top: number): Placement {
  const groups = diagram.groups as DiagramGroup[]
  const byId = new Map(groups.map((group) => [group.id, group] as const))
  const { owner, children, roots } = groupTree(groups)

  // Nodes that belong to no group, and the first-seen order that keeps a source's own ordering visible.
  const order = new Map(nodes.map((node, index) => [node.id, index] as const))
  const loose = nodes.filter((node) => !owner.has(node.id)).map((node) => node.id)

  const nodeIds = new Set(nodes.map((node) => node.id))
  const rawContents = (groupId: string): string[] => {
    const group = byId.get(groupId) as DiagramGroup
    const own = [...new Set(group.members)].filter((member) => owner.get(member) === groupId && nodeIds.has(member))
    const nested = children.get(groupId) ?? []
    return [...own, ...nested]
  }
  // A boundary with nothing inside it is not drawn: an empty box claims a containment the source never stated.
  const contents = (groupId: string): string[] => rawContents(groupId).filter((child) => !byId.has(child) || rawContents(child).length > 0)

  const measure = (id: string): Measured => {
    if (!byId.has(id)) return { width: nodeWidth(id), height: NODE_HEIGHT }
    const items = contents(id)
    const sizes = items.map(measure)
    return {
      width: Math.max(MIN_NODE_WIDTH, ...sizes.map((size) => size.width)) + GROUP_PADDING * 2,
      height: GROUP_HEADER + GROUP_PADDING * 2 + sizes.reduce((total, size) => total + size.height, 0) + Math.max(0, items.length - 1) * BLOCK_GAP,
    }
  }

  const boxes = new Map<string, Box>()
  const groupRects = new Map<string, Box>()

  const place = (id: string, x: number, y: number): Measured => {
    const size = measure(id)
    if (!byId.has(id)) {
      boxes.set(id, { x, y, width: size.width, height: NODE_HEIGHT })
      return size
    }
    groupRects.set(id, { x, y, width: size.width, height: size.height })
    let cursor = y + GROUP_HEADER + GROUP_PADDING
    const inner = size.width - GROUP_PADDING * 2
    const ordered = [...contents(id)].sort((left, right) => firstIndex(left) - firstIndex(right))
    for (const child of ordered) {
      const childSize = measure(child)
      place(child, x + GROUP_PADDING + (inner - childSize.width) / 2, cursor)
      cursor += childSize.height + BLOCK_GAP
    }
    return size
  }

  // Top level: loose nodes and root groups, in the order the source named them.
  const visibleRoots = roots.filter((id) => contents(id).length > 0)
  // A block takes the earliest position of anything inside it, so a group is drawn where its first member was
  // named - not after every loose node, which put a downstream box above the packages it depends on.
  const firstIndex = (id: string): number => {
    // `order` holds every node, and a block is only ever asked about when it has contents.
    if (!byId.has(id)) return order.get(id) as number
    return Math.min(...contents(id).map(firstIndex))
  }
  const topItems = [...loose, ...visibleRoots].sort((left, right) => firstIndex(left) - firstIndex(right))
  const sizes = topItems.map(measure)
  const width = Math.max(MIN_NODE_WIDTH, ...sizes.map((size) => size.width))
  let cursor = top
  for (const item of topItems) {
    const size = measure(item)
    place(item, MARGIN + (width - size.width) / 2, cursor)
    cursor += size.height + BLOCK_GAP
  }
  return { boxes, groupRects, width: width + MARGIN * 2 }
}

/**
 * Place every box of a diagram.
 *
 * The choice of placement is a property of the source, not of the caller: a drawing that declares boundaries is
 * read as containers and gets the tree; one that does not is read as a machine and gets the ranks.
 */
export function place(diagram: Diagram, top: number): Placement {
  const groups = diagram.groups ?? []
  return groups.length > 0 ? placeByGroups(diagram, diagram.nodes, top) : placeByRanks(diagram, diagram.nodes, top)
}

/**
 * Where the boxes go.
 *
 * The drawing is placed by the layered pipeline, in the order the mature implementations run it: cycle breaking turns
 * the graph into a DAG, layering gives every box a row, dummy nodes give every long edge a lane, ordering reduces the
 * crossings, and coordinate assignment decides the x of each lane and box. This module composes those stages; it does
 * not decide any of them itself. Each stage is a pure module next door, so it can be asserted without a canvas.
 *
 * Two decompositions sit around the pipeline. A level - the top of the drawing, or the inside of a boundary - is
 * split into weakly connected components, each laid out on its own and then packed onto the page, so a wide
 * subgraph cannot squeeze an unrelated one. A boundary is a node in its parent's layer whose size is whatever its
 * contents need, and its inside is laid out by the same pipeline; that is how nesting is drawn.
 *
 * What comes out is geometry only: a box per node, a rectangle per boundary, and - for a long edge - the lane its
 * dummies reserved, so the painter can draw one polyline through it instead of searching around the boxes.
 */

import { aspectOf, packRectangles, weakComponents } from './components.js'
import { assignChannels } from './channels.js'
import { assignCoordinates } from './coords.js'
import { breakCycles } from './cycle-break.js'
import { addDummies } from './dummy.js'
import { layer } from './layer.js'
import { seedOrder, type LayoutEdge, type LayoutGraph } from './layout.js'
import { order } from './order.js'
import { measure, MIN_NODE_WIDTH, type Measured as TextBox } from './text.js'
import { planBands } from './wrap.js'
import type { Diagram, DiagramGroup, DiagramNode } from './model.js'

/** Geometry of one placed box, before anything is drawn. */
export type Box = { x: number; y: number; width: number; height: number }

/** A point in the drawing's own coordinates. */
export interface Point {
  x: number
  y: number
}

/** The lane a long edge's dummies reserved, in layout order: from the layout source down to the layout target. */
export interface Lane {
  /** One point per gap the edge crosses, at the lane's own x: it keeps its own order, and the painter walks it. */
  points: Point[]
  /** True when the layout runs opposite to the source's arrow, so the painter walks the lane backwards. */
  reversed: boolean
}

/** What a placement returns: every box, every drawn boundary, every reserved lane, and how wide the content is. */
export interface Placement {
  boxes: Map<string, Box>
  groupRects: Map<string, Box>
  width: number
  lanes: Map<number, Lane>
  /** The height of the one horizontal run an edge between two adjacent rows needs. */
  runs: Map<number, number>
  /** Edges whose two ends ended up in different wrapped columns: they are read across, not down. */
  across: Set<number>
}

/** Geometry constants in one place: a container with different proportions changes these, not the rules. */
export const MARGIN = 20
/** The strip between two layers: room for a route and, when the level has labels, for one to sit in. */
const LAYER_GAP = 44
const LABELLED_LAYER_GAP = 54
/** The space between two boxes in one layer. */
const NODE_GAP = 30
/** How far a lane keeps from a box in a row it crosses, and the least two lanes in one gap may share. */
const LANE_CLEARANCE = 12
const LANE_SPACING = 14
/** Two components are two drawings on one page, so they get a wider gap than two boxes. */
const COMPONENT_GAP = 30
/** A boundary's inner padding and the strip its name sits in. */
const GROUP_PADDING = 10
const GROUP_HEADER = 16

/** The text a node will draw, measured from its label - the id is what the source called it, not what it says. */
export function textOf(node: DiagramNode): TextBox {
  return measure(node.label !== undefined && node.label !== '' ? node.label : node.id)
}

/** One thing placed at a level: a box, or a boundary whose size came from its own contents. */
interface Entity {
  id: string
  group: boolean
  width: number
  height: number
}

/** The geometry of one level (the page, or one boundary's inside) relative to its own top-left corner. */
interface LevelLayout {
  width: number
  height: number
  items: Map<string, { box: Box; group: boolean }>
  lanes: Map<number, Lane>
  runs: Map<number, number>
  across: Set<number>
}

/** Which group each id belongs to, and which group contains which. */
interface GroupTree {
  /** The group a node is drawn inside, when it is drawn inside one at all. */
  owner: Map<string, string>
  /** The group a group is drawn inside. */
  parentOf: Map<string, string>
  children: Map<string, string[]>
  roots: string[]
}

/**
 * Read membership and containment off the model, which is data and can be wrong.
 *
 * Membership is read from `members`; containment from `parent`, because only the parser knows where a boundary was
 * written - a hand-written model may omit it, and then the tightest member-set that contains this one is the best
 * guess available. Guards, because a model is data: a parent that does not exist is ignored, a group that contains
 * itself or closes a cycle is treated as a root, and a member claimed by two groups belongs to the tightest one.
 */
function groupTree(groups: DiagramGroup[]): GroupTree {
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
  return { owner, parentOf, children, roots }
}

/** One weakly connected component of a level, placed on its own. */
type Piece = LevelLayout

export function place(diagram: Diagram, top: number): Placement {
  const groups = diagram.groups ?? []
  const nodes: DiagramNode[] = []
  const seenNode = new Set<string>()
  for (const node of diagram.nodes) {
    if (seenNode.has(node.id)) continue
    seenNode.add(node.id)
    nodes.push(node)
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const))
  const groupById = new Map(groups.map((group) => [group.id, group] as const))
  const tree = groupTree(groups)

  // The order the source wrote things in: the fallback order wherever connectivity says nothing.
  const appearance = new Map<string, number>()
  for (const node of nodes) if (!appearance.has(node.id)) appearance.set(node.id, appearance.size)
  for (const group of groups) if (!appearance.has(group.id)) appearance.set(group.id, appearance.size)

  const visible = new Set<string>()
  const asked = new Map<string, boolean>()
  const isVisible = (id: string): boolean => {
    const known = asked.get(id)
    if (known !== undefined) return known
    const group = groupById.get(id)
    if (group === undefined) {
      asked.set(id, false)
      return false
    }
    let found = false
    for (const member of group.members) {
      if (tree.owner.get(member) === id && nodeById.has(member)) {
        found = true
        break
      }
    }
    if (!found) {
      for (const child of tree.children.get(id) ?? []) {
        if (isVisible(child)) {
          found = true
          break
        }
      }
    }
    asked.set(id, found)
    if (found) visible.add(id)
    return found
  }
  // Every group is asked, not only the roots: a nested group's visibility is what tells its parent it has contents.
  for (const group of groups) isVisible(group.id)

  const directNodes = (scope: string): string[] => nodes.filter((node) => tree.owner.get(node.id) === scope).map((node) => node.id)
  const directGroups = (scope: string): string[] => (tree.children.get(scope) ?? []).filter((child) => visible.has(child))

  const firstIndexCache = new Map<string, number>()
  const firstIndexOf = (id: string): number => {
    const cached = firstIndexCache.get(id)
    if (cached !== undefined) return cached
    if (nodeById.has(id)) return appearance.get(id) as number
    const members = (groupById.get(id) as DiagramGroup).members
      .filter((member) => tree.owner.get(member) === id && nodeById.has(member))
      .map((member) => appearance.get(member) as number)
    const children = directGroups(id).map(firstIndexOf)
    const all = [...members, ...children]
    const found = all.length === 0 ? (appearance.get(id) ?? Number.MAX_SAFE_INTEGER) : Math.min(...all)
    firstIndexCache.set(id, found)
    return found
  }

  /** Which group or node a diagram node is drawn as, at one level; `undefined` when it is outside that level. */
  const entityAt = (scope: string | undefined, id: string): string | undefined => {
    // An edge may name a boundary instead of a box: it attaches to the boundary's own rectangle. A group is
    // an entity at the level it is drawn in, and a nested group belongs to its outermost drawn ancestor there.
    const boundary = groupById.get(id)
    if (boundary !== undefined) {
      if (!visible.has(id)) return undefined
      if (scope === undefined) {
        let cursor = id
        while (tree.parentOf.has(cursor)) cursor = tree.parentOf.get(cursor) as string
        return cursor
      }
      return tree.parentOf.get(id) === scope ? id : undefined
    }
    if (!nodeById.has(id)) return undefined
    const group = tree.owner.get(id)
    if (scope === undefined) {
      if (group === undefined || !visible.has(group)) return id
      let cursor = group
      while (tree.parentOf.has(cursor)) cursor = tree.parentOf.get(cursor) as string
      return cursor
    }
    if (group === scope) return id
    if (group === undefined) return undefined
    return tree.parentOf.get(group) === scope && visible.has(group) ? group : undefined
  }

  const groupSizes = new Map<string, { width: number; height: number }>()
  const groupLayouts = new Map<string, LevelLayout>()
  const measureGroup = (id: string): { width: number; height: number } => {
    const cached = groupSizes.get(id)
    if (cached !== undefined) return cached
    const inside = buildLevel(id)
    const size = {
      width: Math.max(MIN_NODE_WIDTH, inside.width) + GROUP_PADDING * 2,
      height: inside.height + GROUP_HEADER + GROUP_PADDING * 2,
    }
    groupSizes.set(id, size)
    groupLayouts.set(id, inside)
    return size
  }

  const entityOf = (id: string): Entity => {
    const node = nodeById.get(id)
    if (node !== undefined) {
      const text = textOf(node)
      return { id, group: false, width: text.width, height: text.height }
    }
    const size = measureGroup(id)
    return { id, group: true, width: size.width, height: size.height }
  }

  const entitiesIn = (scope: string | undefined): Entity[] => {
    const found: Entity[] = []
    if (scope === undefined) {
      for (const node of nodes) {
        const group = tree.owner.get(node.id)
        if (group === undefined || !visible.has(group)) found.push(entityOf(node.id))
      }
      for (const root of tree.roots) if (visible.has(root)) found.push(entityOf(root))
    } else {
      for (const id of directNodes(scope)) found.push(entityOf(id))
      for (const id of directGroups(scope)) found.push(entityOf(id))
    }
    return found.sort((left, right) => firstIndexOf(left.id) - firstIndexOf(right.id))
  }

  const edgesIn = (scope: string | undefined): LayoutEdge[] => {
    const found: LayoutEdge[] = []
    diagram.edges.forEach((edge, index) => {
      if (edge.from === edge.to) return
      const from = entityAt(scope, edge.from)
      const to = entityAt(scope, edge.to)
      if (from === undefined || to === undefined || from === to) return
      found.push({ index, from, to })
    })
    return found
  }

  /** The entity that holds the initial state at this level, which is where layer zero is pinned. */
  const pinnedAt = (scope: string | undefined): string | undefined => {
    if (diagram.init === undefined) return undefined
    const entity = entityAt(scope, diagram.init)
    return entity === diagram.init || (entity !== undefined && groupById.has(entity)) ? entity : undefined
  }

  /**
   * Lay out one weakly connected component: the pipeline, unshortened.
   *
   * A component has its own layers, its own ordering and its own coordinates. Nothing outside it can move it.
   */
  const layoutPiece = (entities: Entity[], edges: LayoutEdge[], pinned: string | undefined, seed: Map<string, number>): Piece => {
    const byId = new Map(entities.map((entity) => [entity.id, entity] as const))
    const graph: LayoutGraph = {
      nodes: entities.map((entity) => ({ id: entity.id, width: entity.width, height: entity.height })),
      edges,
      ...(pinned === undefined ? {} : { init: pinned }),
    }
    const broken = breakCycles(graph)
    const layered = layer(graph, broken.edges)
    const augmented = addDummies(layered, broken.edges)
    const ordered = order(augmented.layers, augmented.chains, seed)
    const gap = edges.some((edge) => (diagram.edges[edge.index]?.label ?? '') !== '') ? LABELLED_LAYER_GAP : LAYER_GAP
    const coordinates = assignCoordinates(
      {
        layers: ordered.layers,
        chains: augmented.chains,
        sizeOf: (id) => {
          const entity = byId.get(id)
          return entity === undefined ? { width: 0, height: 0 } : { width: entity.width, height: entity.height }
        },
        chainOf: augmented.chainOf,
      },
      { gap: NODE_GAP, layerGap: gap },
    )
    const bands = planBands(coordinates.layerWidth, coordinates.layerHeight, gap)
    const bandOfLayer = new Array<number>(coordinates.layerHeight.length).fill(0)
    bands.bands.forEach((band, index) => {
      for (let depth = band.first; depth <= band.last; depth += 1) bandOfLayer[depth] = index
    })
    const layerTop: number[] = []
    for (const band of bands.bands) {
      let y = 0
      for (let depth = band.first; depth <= band.last; depth += 1) {
        layerTop[depth] = y
        y += coordinates.layerHeight[depth] + gap
      }
    }

    const items = new Map<string, { box: Box; group: boolean }>()
    ordered.layers.forEach((row, depth) => {
      const shift = bands.bands[bandOfLayer[depth]].offsetX
      const top = layerTop[depth]
      const rowHeight = coordinates.layerHeight[depth]
      for (const id of row) {
        const entity = byId.get(id)
        if (entity === undefined) continue
        const centre = coordinates.x.get(id) ?? 0
        items.set(id, {
          box: {
            x: centre + shift - entity.width / 2,
            y: top + (rowHeight - entity.height) / 2,
            width: entity.width,
            height: entity.height,
          },
          group: entity.group,
        })
      }
    })

    // An edge whose ends sit in two different columns is read across the page, not down it: the painter draws it
    // out of the side of one box and into the side of the other, which is where a wrapped reading order turns.
    const across = new Set<number>()
    for (const edge of edges) {
      const from = layered.layerOf.get(edge.from)
      const to = layered.layerOf.get(edge.to)
      if (from === undefined || to === undefined) continue
      if (bandOfLayer[from] !== bandOfLayer[to]) across.add(edge.index)
    }

    // The channels: where each long edge's lane runs and where the runs between two rows sit. A lane is only worth
    // reserving when both ends are boxes - a lane that ends on a boundary has no box to arrive at - and one that
    // crosses a band boundary is two lanes with different column offsets. Those edges get the router instead.
    const laneProposal = new Map<string, number>()
    for (const chain of augmented.chains) {
      if (chain.path.length <= 2) continue
      const lane = augmented.chainOf.get(chain.path[1])
      const fromLayer = layered.layerOf.get(chain.path[0])
      if (lane === undefined || fromLayer === undefined) continue
      const proposed = coordinates.x.get(lane)
      if (proposed === undefined) continue
      laneProposal.set(lane, proposed + bands.bands[bandOfLayer[fromLayer]].offsetX)
    }
    const itemBoxes = new Map<string, Box>()
    for (const [id, item] of items) itemBoxes.set(id, item.box)
    const channels = assignChannels(
      {
        layers: ordered.layers,
        chains: augmented.chains,
        chainOf: augmented.chainOf,
        boxes: itemBoxes,
        layerY: layerTop,
        layerHeight: coordinates.layerHeight,
        laneX: laneProposal,
      },
      { clearance: LANE_CLEARANCE, spacing: LANE_SPACING },
    )
    const lanes = new Map<number, Lane>()
    for (const chain of augmented.chains) {
      if (chain.path.length <= 2) continue
      const start = byId.get(chain.path[0])
      const end = byId.get(chain.path[chain.path.length - 1])
      if (start === undefined || end === undefined || start.group || end.group) continue
      const fromLayer = layered.layerOf.get(chain.path[0])
      const toLayer = layered.layerOf.get(chain.path[chain.path.length - 1])
      if (fromLayer === undefined || toLayer === undefined) continue
      if (bandOfLayer[fromLayer] !== bandOfLayer[toLayer]) continue
      const channel = channels.lanes.get(chain.index)
      if (channel === undefined) continue
      lanes.set(chain.index, {
        points: channel.y.map((y) => ({ x: channel.x, y })),
        reversed: broken.reversed.has(chain.index),
      })
    }
    const runs = new Map<number, number>()
    for (const [edgeIndex, y] of channels.runs) if (!across.has(edgeIndex)) runs.set(edgeIndex, y)

    let right = 0
    let bottom = 0
    for (const entry of items.values()) {
      right = Math.max(right, entry.box.x + entry.box.width)
      bottom = Math.max(bottom, entry.box.y + entry.box.height)
    }
    return { width: right, height: bottom, items, lanes, runs, across }
  }

  const cache = new Map<string, LevelLayout>()
  function buildLevel(scope: string | undefined): LevelLayout {
    const key = scope ?? ''
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    const entities = entitiesIn(scope)
    if (entities.length === 0) {
      const empty: LevelLayout = { width: 0, height: 0, items: new Map(), lanes: new Map(), runs: new Map(), across: new Set() }
      cache.set(key, empty)
      return empty
    }
    const edges = edgesIn(scope)
    const pinned = pinnedAt(scope)
    const seed = seedOrder({ nodes: entities.map((entity) => ({ id: entity.id, width: entity.width, height: entity.height })), edges, ...(pinned === undefined ? {} : { init: pinned }) })
    const components = weakComponents(entities, edges)
    const pieces: Piece[] = []
    for (const members of components) {
      const inside = new Set(members)
      const pieceEntities = entities.filter((entity) => inside.has(entity.id))
      const pieceEdges = edges.filter((edge) => inside.has(edge.from) && inside.has(edge.to))
      const pin = pinned !== undefined && inside.has(pinned) ? pinned : undefined
      pieces.push(layoutPiece(pieceEntities, pieceEdges, pin, seed))
    }
    const packed = packRectangles(pieces.map((piece) => ({ width: piece.width, height: piece.height })), { gap: COMPONENT_GAP })
    const layout: LevelLayout = { width: packed.width, height: packed.height, items: new Map(), lanes: new Map(), runs: new Map(), across: new Set() }
    pieces.forEach((piece, index) => {
      for (const edgeIndex of piece.across) layout.across.add(edgeIndex)
      const at = packed.placements[index]
      for (const [id, item] of piece.items) {
        layout.items.set(id, { box: { x: item.box.x + at.x, y: item.box.y + at.y, width: item.box.width, height: item.box.height }, group: item.group })
      }
      for (const [edgeIndex, lane] of piece.lanes) {
        layout.lanes.set(edgeIndex, { points: lane.points.map((point) => ({ x: point.x + at.x, y: point.y + at.y })), reversed: lane.reversed })
      }
      for (const [edgeIndex, y] of piece.runs) layout.runs.set(edgeIndex, y + at.y)
    })
    cache.set(key, layout)
    return layout
  }

  const root = buildLevel(undefined)
  const boxes = new Map<string, Box>()
  const groupRects = new Map<string, Box>()
  const lanes = new Map<number, Lane>()
  const runs = new Map<number, number>()
  const across = new Set<number>()
  const placeLevel = (layout: LevelLayout, originX: number, originY: number): void => {
    for (const edgeIndex of layout.across) across.add(edgeIndex)
    for (const [id, item] of layout.items) {
      const box = { x: originX + item.box.x, y: originY + item.box.y, width: item.box.width, height: item.box.height }
      if (item.group) {
        groupRects.set(id, box)
        const inside = groupLayouts.get(id) as LevelLayout
        placeLevel(inside, box.x + (box.width - inside.width) / 2, box.y + GROUP_HEADER + GROUP_PADDING)
        continue
      }
      boxes.set(id, box)
    }
    for (const [edgeIndex, lane] of layout.lanes) {
      lanes.set(edgeIndex, { points: lane.points.map((point) => ({ x: point.x + originX, y: point.y + originY })), reversed: lane.reversed })
    }
    for (const [edgeIndex, y] of layout.runs) runs.set(edgeIndex, y + originY)
  }
  placeLevel(root, MARGIN, top)

  let right = MARGIN
  for (const box of boxes.values()) right = Math.max(right, box.x + box.width)
  for (const box of groupRects.values()) right = Math.max(right, box.x + box.width)
  return { boxes, groupRects, width: right + MARGIN, lanes, runs, across }
}

/** The aspect ratio of a placement, for the tests that check a drawing is a page and not a strip. */
export function placementAspect(placement: Placement): number {
  let right = 0
  let bottom = 0
  for (const box of [...placement.boxes.values(), ...placement.groupRects.values()]) {
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  }
  return aspectOf(right, bottom)
}

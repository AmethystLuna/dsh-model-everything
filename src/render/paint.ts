/**
 * Geometry: what a diagram turns into, in coordinates.
 *
 * A drawing has to survive three containers - inline in a conversation, full-screen, and a persistent
 * sidebar tab - so nothing here knows about pixel size. It emits a content-sized canvas and lets the
 * container scale it: the same numbers serve a 360px card and a 1200px whiteboard.
 *
 * Two placements, chosen by the source:
 *
 * - **layered** (no groups): breadth-first rows, forward edges dropping straight down, back edges on a side
 *   channel clear of every box, self loops as small loops. The shape a state machine wants.
 * - **tree** (groups present): a group is a block, its members stack inside it, a nested group is a block
 *   inside its parent, and the top level stacks. The shape an architecture diagram wants, because a package
 *   whose members float somewhere else on the page is not showing containment at all.
 *
 * Edges are placed from where the boxes ended up, so neither placement needs to tell the edge code which one
 * ran: "below" is a straight line, "beside" is horizontal, "above" routes around.
 *
 * Pure: a diagram in, shapes out, every decision assertable.
 */

import { MARGIN, place, textOf, type Box } from './place.js'
import { anchor, facingSides, routeEdge, type Ports, type Side } from './route.js'
import { textWidth } from './text.js'
import { palette, roleForVerdict, type ColourRole, type Palette, type PaletteOptions } from './palette.js'
import { labelOf, type Diagram, type DiagramGroup, type DiagramNode, type NodeShape } from './model.js'

export interface Point {
  x: number
  y: number
}

export interface BoxShape {
  kind: 'box'
  x: number
  y: number
  width: number
  height: number
  /** The lines to draw, already wrapped; `label` keeps the whole text for anything that reads the shape. */
  label: string
  lines: string[]
  /** The symbol to draw. Undefined means a rectangle. */
  shape?: NodeShape
  colour: ColourRole
  initial: boolean
}

export interface LinkShape {
  kind: 'link'
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
  labelX: number
  labelY: number
  colour: ColourRole
}

export interface PathShape {
  kind: 'path'
  points: Point[]
  label: string
  labelX: number
  labelY: number
  colour: ColourRole
}

/** A boundary around several states: a package, a layer, a subgraph. */
export interface GroupShape {
  kind: 'group'
  /** The group's own id, so a container can fold it without guessing from the label. */
  id: string
  x: number
  y: number
  width: number
  height: number
  label: string
  colour: ColourRole
}

export interface CaptionShape {
  kind: 'caption'
  x: number
  y: number
  lines: string[]
  colour: ColourRole
}

export interface TitleShape {
  kind: 'title'
  x: number
  y: number
  text: string
  colour: ColourRole
}

export type Shape = GroupShape | BoxShape | LinkShape | PathShape | CaptionShape | TitleShape

export interface Canvas {
  width: number
  height: number
  shapes: Shape[]
}

/** Geometry constants in one place: a container with different proportions changes these, not the rules. */
const MIN_NODE_WIDTH = 88
const MAX_NODE_WIDTH = 220
const CHAR_WIDTH = 7.2

const nodeWidth = (label: string): number => Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, label.length * CHAR_WIDTH + 26))

const TITLE_HEIGHT = 26
const NODE_HEIGHT = 34
const CAPTION_CHARS = 78
const CAPTION_LINE = 15
const CAPTION_GAP = 16
const CAPTION_CHAR_WIDTH = 6.2

/** Which colour a box earns from its role. One mapping, used by every container. */
export function roleOfNode(node: DiagramNode): ColourRole {
  if (node.role === 'error') return 'fail'
  if (node.role === 'warning') return 'findings'
  if (node.role === 'muted') return 'muted'
  return 'edge'
}

/** Wrap on spaces; break a token longer than the line rather than let it overflow the canvas. */
function wrap(text: string, limit: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter((part) => part !== '')) {
    const candidate = line === '' ? word : line + ' ' + word
    if (candidate.length <= limit) {
      line = candidate
      continue
    }
    if (line !== '') lines.push(line)
    line = ''
    let rest = word
    while (rest.length > limit) {
      lines.push(rest.slice(0, limit))
      rest = rest.slice(limit)
    }
    line = rest
  }
  if (line !== '') lines.push(line)
  return lines.length === 0 ? [''] : lines
}

/** The colour a caption earns, read from the verdict it quotes. */
function captionRole(caption: string): ColourRole {
  return roleForVerdict(caption.split(' — ')[0] as string)
}


/**
 * Where an edge's label goes.
 *
 * A label dropped at the midpoint lands on a box as soon as the two ends are not vertically aligned - the defect a
 * reader sees as "text on top of a box". Graphviz solves it by making the label a node the layout must make room
 * for; without a layout that can do that, the label walks along its own edge and takes the first position that is
 * clear of every box, falling back to the midpoint when the whole edge is crowded.
 */
function placeLabel(
  label: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  boxes: Iterable<Box>,
  placed: Array<{ x: number; y: number; width: number; height: number }> = [],
  ordinal = 0,
  offsets: Array<{ t: number; dx: number }> = [
    { t: 0.5, dx: 0 },
    { t: 0.5, dx: 26 },
    { t: 0.5, dx: -26 },
    { t: 0.42, dx: 26 },
    { t: 0.58, dx: -26 },
    { t: 0.5, dx: 52 },
    { t: 0.5, dx: -52 },
    { t: 0.5, dx: 100 },
    { t: 0.5, dx: -100 },
    { t: 0.82, dx: 0 },
    { t: 0.18, dx: 0 },
    { t: 0.3, dx: 0 },
    { t: 0.7, dx: 0 },
  ],
): { x: number; y: number } {
  const width = textWidth(label)
  const height = 12
  const hits = (x: number, y: number, w: number, other: { x: number; y: number; width: number; height: number }): boolean =>
    x - w / 2 < other.x + other.width + 3 && x + w / 2 > other.x - 3 && y < other.y + other.height + 3 && y + height > other.y - 3
  const clear = (x: number, y: number, w: number): boolean => {
    for (const box of boxes) if (hits(x, y, w, box)) return false
    for (const earlier of placed) if (hits(x, y, w, earlier)) return false
    return true
  }
  // A second label on the same source moves along and down: the two describe different branches of one decision,
  // and stacking them is what made them unreadable.
  const centre = (x: number, y: number): { x: number; y: number } => ({ x: x - width / 2, y })
  for (const candidate of offsets) {
    const x = from.x + (to.x - from.x) * candidate.t + candidate.dx
    const y = from.y + (to.y - from.y) * candidate.t + ordinal * 14
    if (clear(x, y, width)) return centre(x, y)
  }
  return centre(from.x + (to.x - from.x) * 0.5, from.y + (to.y - from.y) * 0.5)
}


/** The furthest right and bottom point any shape reaches. */
function drawnExtent(shapes: Shape[]): { width: number; height: number } {
  let width = 0
  let height = 0
  const consider = (x: number, y: number): void => {
    if (x > width) width = x
    if (y > height) height = y
  }
  for (const shape of shapes) {
    switch (shape.kind) {
      case 'box':
      case 'group':
        consider(shape.x + shape.width, shape.y + shape.height)
        break
      case 'link':
        consider(Math.max(shape.x1, shape.x2), Math.max(shape.y1, shape.y2))
        if (shape.label !== '') consider(shape.labelX + textWidth(shape.label), shape.labelY + 12)
        break
      case 'path': {
        for (const point of shape.points) consider(point.x, point.y)
        if (shape.label !== '') consider(shape.labelX + textWidth(shape.label), shape.labelY + 12)
        break
      }
      case 'caption':
      case 'title':
        consider(textWidth((shape as { lines?: string[]; text?: string }).lines?.[0] ?? '') + shape.x, shape.y + 12)
        break
    }
  }
  return { width, height }
}

export function paintWith(diagram: Diagram, overrides: Partial<Palette> = {}, options: PaletteOptions = {}): { canvas: Canvas; colours: Palette } {
  const colours = palette(overrides, options)
  const shapes: Shape[] = []

  const groups = diagram.groups ?? []
  const topOffset = MARGIN + TITLE_HEIGHT
  const placement = place(diagram, topOffset)
  const { boxes, groupRects } = placement

  // Boundaries first, so everything else is painted on top of them.
  for (const group of groups) {
    const rect = groupRects.get(group.id)
    if (rect === undefined) continue
    shapes.push({ kind: 'group', id: group.id, x: rect.x, y: rect.y, width: rect.width, height: rect.height, label: group.label, colour: 'muted' })
  }

  const drawn = new Set<string>()
  // A Map iterator is consumed by the first pass: collision checks need a list.
  const boxList = Array.from(boxes.values())
  const labelRects: Array<{ x: number; y: number; width: number; height: number }> = []
  const labelsFrom = new Map<string, number>()
  for (const node of diagram.nodes) {
    // A state id may repeat in a malformed model: the first placement wins and the repeat is skipped.
    if (drawn.has(node.id)) continue
    const box = boxes.get(node.id) as Box
    drawn.add(node.id)
    const text = textOf(node)
    shapes.push({
      kind: 'box',
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      label: labelOf(node),
      lines: text.lines,
      ...(node.shape === undefined ? {} : { shape: node.shape }),
      colour: roleOfNode(node),
      initial: diagram.init === node.id,
    })
  }

  const roleById = new Map(diagram.nodes.map((node) => [node.id, roleOfNode(node)] as const))

  // Ports: every edge on the same side of the same box takes its own point along that side, spaced evenly and
  // centred on the side. One anchor per side is what made an in-edge and an out-edge meet in a single pixel.
  const facing = diagram.edges.map((edge) => {
    const source = boxes.get(edge.from)
    const target = boxes.get(edge.to)
    return source === undefined || target === undefined || edge.from === edge.to ? undefined : facingSides(source, target)
  })
  const slots = new Map<string, number>()
  const counts = new Map<string, number>()
  for (const [index, entry] of facing.entries()) {
    if (entry === undefined) continue
    for (const key of [diagram.edges[index].from + ':' + entry.exit, diagram.edges[index].to + ':' + entry.entry]) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const portOf = (boxId: string, side: Side): Point => {
    const box = boxes.get(boxId) as Box
    const key = boxId + ':' + side
    const index = slots.get(key) ?? 0
    slots.set(key, index + 1)
    const spread = (index - ((counts.get(key) ?? 1) - 1) / 2) * 20
    const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value))
    if (side === 'top') return { x: box.x + clamp(box.width / 2 + spread, 10, box.width - 10), y: box.y }
    if (side === 'bottom') return { x: box.x + clamp(box.width / 2 + spread, 10, box.width - 10), y: box.y + box.height }
    if (side === 'left') return { x: box.x, y: box.y + clamp(box.height / 2 + spread, 8, box.height - 8) }
    return { x: box.x + box.width, y: box.y + clamp(box.height / 2 + spread, 8, box.height - 8) }
  }
  const anchorsFor = new Map<number, Ports>()
  for (const [index, entry] of facing.entries()) {
    if (entry === undefined) continue
    const edge = diagram.edges[index]
    anchorsFor.set(index, {
      exit: portOf(edge.from, entry.exit),
      entry: portOf(edge.to, entry.entry),
      exitSide: entry.exit,
      entrySide: entry.entry,
    })
  }

  for (const [edgeIndex, edge] of diagram.edges.entries()) {
    const source = boxes.get(edge.from)
    const target = boxes.get(edge.to)
    if (source === undefined || target === undefined) continue
    const colour = roleById.get(edge.from) as ColourRole
    // Placement decided where things are; "below", "beside" and "above" are read from the result.
    const sameRow = Math.abs(target.y - source.y) < NODE_HEIGHT / 2

    if (edge.from === edge.to) {
      const x = source.x + source.width
      const y = source.y + source.height / 2
      shapes.push({
        kind: 'path',
        points: [
          { x, y: y - 9 },
          { x: x + 14, y: y - 9 },
          { x: x + 14, y: y + 9 },
          { x, y: y + 9 },
        ],
        label: edge.label,
        labelX: x + 20,
        labelY: y,
        colour,
      })
      continue
    }

    // One router decides every edge: the sparse grid when a box is in the way, and a straight line when none is.
    // Three hand-written cases used to decide this by comparing coordinates, and each of them could draw through a
    // box the comparison had not considered - a horizontal edge with a box between its ends was the common one.
    const anchors = anchorsFor.get(edgeIndex)
    const route = routeEdge(source, target, boxList, anchors)
    const ordinal = labelsFrom.get(edge.from) ?? 0
    labelsFrom.set(edge.from, ordinal + 1)

    if (route.routed) {
      // The label walks along the longest straight run of the route, which is where there is room for it.
      // The chord across the middle of the route: it runs through open space by construction, unlike a stub that
      // hugs the box it just left.
      const middle = Math.max(1, Math.floor(route.points.length / 2))
      const longest = {
        from: route.points[Math.max(0, middle - 1)],
        to: route.points[Math.min(route.points.length - 1, middle)],
        length: 0,
      }
      const spot = placeLabel(edge.label, longest.from, longest.to, boxList, labelRects, ordinal)
      labelRects.push({ x: spot.x, y: spot.y, width: textWidth(edge.label), height: 12 })
      shapes.push({
        kind: 'path',
        points: route.points,
        label: edge.label,
        labelX: spot.x + textWidth(edge.label) / 2,
        labelY: spot.y,
        colour,
      })
      continue
    }

    const sides = facingSides(source, target)
    const exit = anchors?.exit ?? anchor(source, sides.exit)
    const entry = anchors?.entry ?? anchor(target, sides.entry)
    const spot = placeLabel(edge.label, exit, entry, boxList, labelRects, ordinal)
    labelRects.push({ x: spot.x, y: spot.y, width: textWidth(edge.label), height: 12 })
    shapes.push({
      kind: 'link',
      x1: exit.x,
      y1: exit.y,
      x2: entry.x,
      y2: entry.y,
      label: edge.label,
      labelX: spot.x + textWidth(edge.label) / 2,
      labelY: spot.y,
      colour,
    })
  }

  shapes.push({ kind: 'title', x: MARGIN, y: MARGIN + 12, text: diagram.title, colour: 'text' })

  const contentRight = Math.max(
    MARGIN,
    ...Array.from(boxes.values(), (box) => box.x + box.width),
    ...Array.from(groupRects.values(), (rect) => rect.x + rect.width),
  )
  const captionLines = wrap(diagram.caption, CAPTION_CHARS)
  const captionWidth = Math.max(...captionLines.map((line) => line.length * CAPTION_CHAR_WIDTH)) + MARGIN * 2
  const width = Math.max(contentRight + MARGIN, captionWidth, 240)

  const contentBottom = Math.max(
    topOffset,
    ...Array.from(boxes.values(), (box) => box.y + box.height),
    ...Array.from(groupRects.values(), (rect) => rect.y + rect.height),
  )
  const captionTop = contentBottom + CAPTION_GAP
  shapes.push({ kind: 'caption', x: MARGIN, y: captionTop, lines: captionLines, colour: captionRole(diagram.caption) })
  const height = captionTop + captionLines.length * CAPTION_LINE + MARGIN / 2

  // Everything drawn counts, including the parts that leave the box grid: an edge routed beside the drawing and a
  // label wider than the gap between two boxes were both cut off at the right edge.
  const extent = drawnExtent(shapes)
  const canvasWidth = Math.max(width, extent.width + MARGIN)
  const canvasHeight = Math.max(height, extent.height + MARGIN)

  return { canvas: { width: Math.round(canvasWidth), height: Math.round(canvasHeight), shapes }, colours }
}

export function paint(diagram: Diagram, overrides: Partial<Palette> = {}): Canvas {
  return paintWith(diagram, overrides).canvas
}

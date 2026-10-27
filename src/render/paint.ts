/**
 * Geometry: what a diagram turns into, in coordinates.
 *
 * A drawing has to survive three containers - inline in a conversation, full-screen, and a persistent
 * sidebar tab - so nothing here knows about pixel size. It emits a content-sized canvas and lets the
 * container scale it: the same numbers serve a 360px card and a 1200px whiteboard.
 *
 * The drawing is placed by the layered pipeline (`place.ts`), which also says which lane a long edge reserved.
 * Edges are drawn from where the boxes ended up, in two ways only: a long edge follows its lane as one polyline,
 * and everything else goes through the orthogonal router. Which side of a box an edge leaves by is read off the
 * route, not picked by comparing the boxes' centres: a route between two rows arrives vertically, so the endpoint
 * is snapped onto the top or bottom perimeter in the direction the route approaches, and two edges on the same
 * side take separate points along it.
 *
 * Pure: a diagram in, shapes out, every decision assertable.
 */

import { MARGIN, place, textOf, type Box } from './place.js'
import { PORT_INSET } from './channels.js'
import { approachSides, crossesBox, routeEdge, simplify, type Ports, type Side } from './route.js'
import { textWidth } from './text.js'
import { palette, roleForVerdict, type ColourRole, type Palette, type PaletteOptions } from './palette.js'
import { labelOf, type Diagram, type DiagramEdge, type DiagramGroup, type DiagramNode, type EdgeArrow, type NodeShape } from './model.js'

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
  /** A dashed line, when the notation distinguished one. */
  dashed?: boolean
  /** The arrow the source edge stated. Undefined means the plain arrow every edge has been drawn with. */
  arrow?: EdgeArrow
}

export interface PathShape {
  kind: 'path'
  points: Point[]
  label: string
  labelX: number
  labelY: number
  colour: ColourRole
  dashed?: boolean
  arrow?: EdgeArrow
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

/** Which side of each box an edge leaves by and arrives at, and, for a long edge, the lane x it meets there. */
interface Facing {
  exit: Side
  entry: Side
  at?: number
}

export interface Canvas {
  width: number
  height: number
  shapes: Shape[]
}

/** Geometry constants in one place: a container with different proportions changes these, not the rules. */
const TITLE_HEIGHT = 26
const CAPTION_CHARS = 78
const CAPTION_LINE = 15
const CAPTION_GAP = 16
const CAPTION_CHAR_WIDTH = 6.2

/** The closest two ports on one side may sit, so two edges never leave from the same pixel. */
const PORT_SEPARATION = 14

/**
 * Spread the ports of one side along it: each stays as close to the point it asked for as the gap to its neighbours
 * allows, and the whole row is kept on the box.
 *
 * This is the same monotone fit coordinate assignment uses on x, applied to one side of one box: a forward pass that
 * keeps every port at least `PORT_SEPARATION` to the right of the one before it, then a backward pass that pulls the
 * row back onto the box without closing those gaps.
 */
function packPorts(wanted: number[], low: number, high: number): number[] {
  const placed: number[] = []
  let previous = low - PORT_SEPARATION
  for (const value of wanted) {
    previous = Math.min(high, Math.max(value, previous + PORT_SEPARATION))
    placed.push(previous)
  }
  let next = high + PORT_SEPARATION
  for (let index = placed.length - 1; index >= 0; index -= 1) {
    next = Math.max(low, Math.min(placed[index], next - PORT_SEPARATION))
    placed[index] = next
  }
  return placed
}

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
  segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [],
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
    // A label on top of a line is as unreadable as one on top of a box.
    const left = x - w / 2 - 2
    const right = x + w / 2 + 2
    const top2 = y - 2
    const bottom2 = y + 14
    for (const segment of segments) {
      const minX = Math.min(segment.x1, segment.x2)
      const maxX = Math.max(segment.x1, segment.x2)
      const minY = Math.min(segment.y1, segment.y2)
      const maxY = Math.max(segment.y1, segment.y2)
      if (right > minX && left < maxX && bottom2 > minY && top2 < maxY) return false
    }
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
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = []
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

  // Ports. The side comes from the route, not from comparing the two boxes' centres: a layered drawing runs
  // downwards, so an edge between two rows leaves the bottom and arrives at the top, and a back edge does the
  // opposite. Where along the side the port sits follows the drawing: a long edge takes the point its lane meets, so
  // the lane leaves and arrives square on, and a short edge points at the box it joins. Two edges that want the same
  // place are spaced apart, so two ports never share a pixel.
  const facing = diagram.edges.map((edge, index): Facing | undefined => {
    const source = boxes.get(edge.from)
    const target = boxes.get(edge.to)
    if (source === undefined || target === undefined || edge.from === edge.to) return undefined
    // A wrapped drawing is read in columns: the edge from the bottom of one column to the top of the next leaves
    // and arrives at the side, which is the direction that reading order travels.
    const sides = placement.across.has(index)
      ? target.x + target.width / 2 >= source.x + source.width / 2
        ? { exit: 'right' as Side, entry: 'left' as Side }
        : { exit: 'left' as Side, entry: 'right' as Side }
      : approachSides(source, target)
    const lane = placement.lanes.get(index)
    if (lane === undefined || lane.points.length === 0) return sides
    // A lane runs down the page, so its ends face the rows above and below wherever the box centres are.
    const down = target.y > source.y
    return { exit: down ? 'bottom' : 'top', entry: down ? 'top' : 'bottom', at: lane.points[0].x }
  })
  const wanted = new Map<string, number>()
  const slotKey = (boxId: string, side: Side, index: number): string => boxId + ':' + side + ':' + String(index)
  /** Where a port may sit on one side: `corner` relaxes the margin, because a side that is crowded uses its corners. */
  const bounds = (box: Box, vertical: boolean, corner: boolean): { low: number; high: number } => {
    const inset = corner ? 2 : vertical ? PORT_INSET : 8
    return vertical
      ? { low: box.x + inset, high: box.x + box.width - inset }
      : { low: box.y + inset, high: box.y + box.height - inset }
  }
  const clampTo = (box: Box, vertical: boolean, value: number, corner: boolean): number => {
    const span = bounds(box, vertical, corner)
    return Math.min(span.high, Math.max(span.low, value))
  }
  for (const [index, entry] of facing.entries()) {
    if (entry === undefined) continue
    const edge = diagram.edges[index]
    const from = boxes.get(edge.from) as Box
    const to = boxes.get(edge.to) as Box
    const vertical = entry.exit === 'bottom' || entry.exit === 'top'
    const middle = (box: Box): number => (vertical ? box.x + box.width / 2 : box.y + box.height / 2)
    const fromMiddle = middle(from)
    const toMiddle = middle(to)
    // Both ports sit on one line - and the edge is a straight run - when the source's middle falls on the target's
    // side; otherwise the line is the target's middle clamped into the source's side, which is as close to a straight
    // run as a box that does not overlap the other allows. A long edge asks for the point its own lane meets instead,
    // and takes the corner nearest it when the lane runs outside the box: that edge turns anyway, and a straight edge
    // made to give up its port would gain two bends for nothing.
    const corner = entry.at !== undefined
    const target = bounds(to, vertical, false)
    const chosen =
      entry.at ?? (fromMiddle >= target.low && fromMiddle <= target.high ? fromMiddle : clampTo(from, vertical, toMiddle, false))
    wanted.set(slotKey(edge.from, entry.exit, index), clampTo(from, vertical, chosen, corner))
    wanted.set(slotKey(edge.to, entry.entry, index), clampTo(to, vertical, chosen, corner))
  }
  const sides = new Map<string, Array<{ index: number; wanted: number }>>()
  for (const [index, entry] of facing.entries()) {
    if (entry === undefined) continue
    const edge = diagram.edges[index]
    sides.set(edge.from + ':' + entry.exit, [
      ...(sides.get(edge.from + ':' + entry.exit) ?? []),
      { index, wanted: wanted.get(slotKey(edge.from, entry.exit, index)) as number },
    ])
    sides.set(edge.to + ':' + entry.entry, [
      ...(sides.get(edge.to + ':' + entry.entry) ?? []),
      { index, wanted: wanted.get(slotKey(edge.to, entry.entry, index)) as number },
    ])
  }
  // Pack every side, then hand each entry the position its exit was given: a pair that faced each other sat on one x
  // before packing, and an edge the packing had to move should keep its straight run rather than gain two bends.
  let placedPort = new Map<string, number>()
  for (let round = 0; round < 3; round += 1) {
    placedPort = new Map<string, number>()
    for (const [key, list] of sides) {
      const [boxId, side] = key.split(':') as [string, Side]
      const box = boxes.get(boxId) as Box
      const vertical = side === 'bottom' || side === 'top'
      const span = bounds(box, vertical, true)
      const order = [...list].sort((left, right) => left.wanted - right.wanted || left.index - right.index)
      const packed = packPorts(
        order.map((entry) => clampTo(box, vertical, entry.wanted, true)),
        span.low,
        span.high,
      )
      order.forEach((entry, at) => placedPort.set(slotKey(boxId, side, entry.index), packed[at]))
    }
    let moved = false
    for (const [index, entry] of facing.entries()) {
      if (entry === undefined) continue
      const edge = diagram.edges[index]
      const vertical = entry.exit === 'bottom' || entry.exit === 'top'
      if (!vertical) continue
      const exit = placedPort.get(slotKey(edge.from, entry.exit, index)) as number
      if (Math.abs(exit - (placedPort.get(slotKey(edge.to, entry.entry, index)) as number)) < 0.01) continue
      // Only an entry that can reach the exit's x asks for it: a box that does not span it keeps its own point.
      const target = boxes.get(edge.to) as Box
      if (Math.abs(clampTo(target, true, exit, true) - exit) > 0.01) continue
      for (const slot of sides.get(edge.to + ':' + entry.entry) as Array<{ index: number; wanted: number }>) {
        if (slot.index !== index) continue
        slot.wanted = exit
        moved = true
      }
    }
    if (!moved) break
  }
  const portOf = (boxId: string, side: Side, edgeIndex: number): Point => {
    const box = boxes.get(boxId) as Box
    const vertical = side === 'bottom' || side === 'top'
    const coordinate = placedPort.get(slotKey(boxId, side, edgeIndex)) ?? (vertical ? box.x + box.width / 2 : box.y + box.height / 2)
    if (side === 'top') return { x: coordinate, y: box.y }
    if (side === 'bottom') return { x: coordinate, y: box.y + box.height }
    if (side === 'left') return { x: box.x, y: coordinate }
    return { x: box.x + box.width, y: coordinate }
  }
  const anchorsFor = new Map<number, Ports>()
  for (const [index, entry] of facing.entries()) {
    if (entry === undefined) continue
    const edge = diagram.edges[index]
    anchorsFor.set(index, {
      exit: portOf(edge.from, entry.exit, index),
      entry: portOf(edge.to, entry.entry, index),
      exitSide: entry.exit,
      entrySide: entry.entry,
    })
  }

  /** The longest straight run of a polyline: where a label has the most room. */
  const longestRun = (points: Point[]): { from: Point; to: Point } => {
    let best = { from: points[0], to: points[points.length - 1], length: -1 }
    for (let index = 0; index + 1 < points.length; index += 1) {
      const from = points[index]
      const to = points[index + 1]
      const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
      if (length > best.length) best = { from, to, length }
    }
    return best
  }

  /** Paint one edge as a polyline: its label walks along the longest run, and its segments join the collision set. */
  const paintPath = (edge: DiagramEdge, points: Point[], colour: ColourRole): void => {
    const ordinal = labelsFrom.get(edge.from) ?? 0
    labelsFrom.set(edge.from, ordinal + 1)
    const run = longestRun(points)
    const spot = placeLabel(edge.label, run.from, run.to, boxList, labelRects, ordinal, segments)
    labelRects.push({ x: spot.x, y: spot.y, width: textWidth(edge.label), height: 12 })
    for (let index = 0; index + 1 < points.length; index += 1) {
      const from = points[index]
      const to = points[index + 1]
      segments.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y })
    }
    shapes.push({
      kind: 'path',
      points,
      label: edge.label,
      labelX: spot.x + textWidth(edge.label) / 2,
      labelY: spot.y,
      colour,
      ...(edge.dashed === undefined ? {} : { dashed: edge.dashed }),
      ...(edge.arrow === undefined ? {} : { arrow: edge.arrow }),
    })
  }

  /** Two points are a line and more of them are a polyline; both carry the label and join the collision set. */
  const paintRoute = (edge: DiagramEdge, points: Point[], colour: ColourRole): void => {
    if (points.length > 2) {
      paintPath(edge, points, colour)
      return
    }
    const exit = points[0]
    const entry = points[points.length - 1]
    const ordinal = labelsFrom.get(edge.from) ?? 0
    labelsFrom.set(edge.from, ordinal + 1)
    const spot = placeLabel(edge.label, exit, entry, boxList, labelRects, ordinal, segments)
    labelRects.push({ x: spot.x, y: spot.y, width: textWidth(edge.label), height: 12 })
    segments.push({ x1: exit.x, y1: exit.y, x2: entry.x, y2: entry.y })
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
      ...(edge.dashed === undefined ? {} : { dashed: edge.dashed }),
      ...(edge.arrow === undefined ? {} : { arrow: edge.arrow }),
    })
  }

  /** Does any segment of this route pass through a box other than its own two ends? */
  const clearOfBoxes = (points: Point[], from: Box, to: Box): boolean => {
    for (let index = 0; index + 1 < points.length; index += 1) {
      const start = points[index]
      const end = points[index + 1]
      for (const box of boxList) {
        if (box === from || box === to) continue
        if (crossesBox(start.x, start.y, end.x, end.y, box)) return false
      }
    }
    return true
  }

  for (const [edgeIndex, edge] of diagram.edges.entries()) {
    const source = boxes.get(edge.from)
    const target = boxes.get(edge.to)
    if (source === undefined || target === undefined) continue
    const colour = roleById.get(edge.from) as ColourRole

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
        ...(edge.dashed === undefined ? {} : { dashed: edge.dashed }),
        ...(edge.arrow === undefined ? {} : { arrow: edge.arrow }),
      })
      continue
    }

    const anchors = anchorsFor.get(edgeIndex)

    // A long edge follows the lane the channel stage gave it: down the exit stub, across to the lane's x on the run
    // the gap was assigned, down the lane, and across to the entry stub. The spine carries one point per gap, so the
    // two runs are the places where a port and the lane disagree, and everything between them is one straight drop.
    const lane = placement.lanes.get(edgeIndex)
    if (lane !== undefined && lane.points.length > 0 && anchors !== undefined) {
      const waypoints = lane.reversed ? [...lane.points].reverse() : lane.points
      const points: Point[] = [anchors.exit]
      let previous = anchors.exit
      for (const waypoint of waypoints) {
        if (Math.abs(previous.x - waypoint.x) > 0.5 && Math.abs(previous.y - waypoint.y) > 0.5) points.push({ x: previous.x, y: waypoint.y })
        points.push(waypoint)
        previous = waypoint
      }
      if (Math.abs(previous.x - anchors.entry.x) > 0.5 && Math.abs(previous.y - anchors.entry.y) > 0.5) points.push({ x: anchors.entry.x, y: previous.y })
      points.push(anchors.entry)
      paintPath(edge, simplify(points), colour)
      continue
    }

    // Two rows with nothing between them: the edge is the two-bend run the channel stage stacked, which cannot cross
    // a box because the whole run sits in the empty strip between the rows. A wrapped drawing puts columns side by
    // side, so a run that would still meet a box is handed to the router instead.
    const runY = placement.runs.get(edgeIndex)
    if (runY !== undefined && anchors !== undefined) {
      const points = simplify([anchors.exit, { x: anchors.exit.x, y: runY }, { x: anchors.entry.x, y: runY }, anchors.entry])
      if (clearOfBoxes(points, source, target)) {
        paintRoute(edge, points, colour)
        continue
      }
    }

    paintRoute(edge, routeEdge(source, target, boxList, anchors).points, colour)
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

/**
 * The two decompositions a drawing needs before it can be packed.
 *
 * **Weakly connected components.** Two subgraphs with no edge between them are two drawings that happen to share a
 * page. Laying them out together makes them share one set of layers, so the wider one sets every column width and
 * the narrower one is squeezed beside it; moving one moves the other. Split first, lay each out on its own, then pack
 * the rectangles.
 *
 * **Packing.** A pile of rectangles has to become a page. The target is the aspect ratio a page and a screen share -
 * 1.6 - and a shelf packer is enough to get there: sort by height, fill a shelf until the next rectangle would make
 * the drawing wider than the page it is aiming at, then start the next shelf. No overlap, and a deterministic order,
 * so the same rectangles always pack the same way.
 *
 * Pure, and asserted on the rectangles themselves.
 */

export interface SizedRectangle {
  width: number
  height: number
}

export interface PackedRectangle {
  x: number
  y: number
  width: number
  height: number
}

/** The aspect ratio a page and a landscape screen share. */
const PAGE_ASPECT = 1.6

/**
 * The nodes of each weakly connected component, in the order the nodes were written.
 *
 * An isolated node is a component of its own: it is not noise, it is a drawing with nothing joining it, and the
 * packer is what decides where it goes.
 */
export function weakComponents(
  nodes: ReadonlyArray<{ id: string }>,
  edges: ReadonlyArray<{ from: string; to: string }>,
): string[][] {
  const known = new Set(nodes.map((node) => node.id))
  const neighbours = new Map<string, string[]>()
  const link = (from: string, to: string): void => {
    neighbours.set(from, [...(neighbours.get(from) ?? []), to])
  }
  for (const edge of edges) {
    if (!known.has(edge.from) || !known.has(edge.to) || edge.from === edge.to) continue
    link(edge.from, edge.to)
    link(edge.to, edge.from)
  }
  const seen = new Set<string>()
  const components: string[][] = []
  for (const node of nodes) {
    if (seen.has(node.id)) continue
    const members: string[] = []
    const queue = [node.id]
    seen.add(node.id)
    for (let head = 0; head < queue.length; head += 1) {
      const id = queue[head]
      members.push(id)
      for (const next of neighbours.get(id) ?? []) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    components.push(members)
  }
  return components
}

export interface PackOptions {
  /** The empty strip kept between two rectangles, on both axes. */
  gap?: number
  /** The page the packer aims at; the drawing comes out as close to it as the rectangles allow. */
  aspect?: number
}

/**
 * Pack rectangles into a page of roughly `aspect`, using shelves.
 *
 * The shelf width is derived from the total area and the target aspect: that is the width at which a perfect grid
 * would have the wanted shape, so a shelf that fills it lands near the target. Rectangles are taken tallest first,
 * which is what keeps a shelf from being mostly empty air above a short rectangle.
 */
export function packRectangles(rectangles: ReadonlyArray<SizedRectangle>, options: PackOptions = {}): {
  placements: PackedRectangle[]
  width: number
  height: number
} {
  const gap = options.gap ?? 30
  const aspect = options.aspect ?? PAGE_ASPECT
  if (rectangles.length === 0) return { placements: [], width: 0, height: 0 }

  const area = rectangles.reduce((total, rectangle) => total + (rectangle.width + gap) * (rectangle.height + gap), 0)
  const targetWidth = Math.max(gap, Math.sqrt(area * aspect))
  const order = rectangles
    .map((rectangle, index) => ({ rectangle, index }))
    .sort((left, right) => right.rectangle.height - left.rectangle.height || right.rectangle.width - left.rectangle.width || left.index - right.index)

  const placements: PackedRectangle[] = rectangles.map((rectangle) => ({ x: 0, y: 0, width: rectangle.width, height: rectangle.height }))
  let x = 0
  let y = 0
  let shelfHeight = 0
  let width = 0
  for (const entry of order) {
    const rectangle = entry.rectangle
    if (x > 0 && x + rectangle.width > targetWidth) {
      y += shelfHeight + gap
      x = 0
      shelfHeight = 0
    }
    placements[entry.index] = { x, y, width: rectangle.width, height: rectangle.height }
    x += rectangle.width + gap
    width = Math.max(width, x - gap)
    shelfHeight = Math.max(shelfHeight, rectangle.height)
  }
  return { placements, width, height: y + shelfHeight }
}

/** The aspect ratio of a box, as a number a reader can compare against the page's. */
export function aspectOf(width: number, height: number): number {
  if (width <= 0 || height <= 0) return 1
  return Math.max(width, height) / Math.min(width, height)
}

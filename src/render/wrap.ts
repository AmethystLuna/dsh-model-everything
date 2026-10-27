/**
 * Wrapping: turning one endless column into a page.
 *
 * A chain of twelve boxes has twelve layers, and layering alone draws it as a single column taller than anything a
 * reader can take in - a strip, not a drawing. Graphviz and ELK both answer this with a wrapping pass: cut the layer
 * sequence into bands and stand the bands side by side, so reading order becomes "down the page, then the next
 * column", the way text wraps.
 *
 * The cut is chosen, not guessed: each candidate number of bands is scored by how close the packed page gets to the
 * aspect ratio a page and a landscape screen share, and the best one wins. A drawing that is already close to that
 * shape is left alone - wrapping exists for the strip, not for every tall drawing.
 *
 * Pure: layer sizes in, band ranges and offsets out. The caller applies them.
 */

/** The aspect ratio a page and a landscape screen share. */
const PAGE_ASPECT = 1.6

/** A drawing shorter than this many layers is read better stacked, whatever its proportions. */
const MIN_LAYERS_TO_WRAP = 4

/** A drawing that is not this tall relative to its width is not a strip. */
const STRIP_RATIO = 2

export interface BandRange {
  /** The first and last layer the band holds, inclusive. */
  first: number
  last: number
  /** How far right the band stands, relative to the first one. */
  offsetX: number
}

export interface BandPlan {
  bands: BandRange[]
  width: number
  height: number
}

/** The height of a run of layers with the gap between them. */
function runHeight(layerHeight: number[], first: number, last: number, gap: number): number {
  let total = 0
  for (let index = first; index <= last; index += 1) {
    total += layerHeight[index]
    if (index < last) total += gap
  }
  return total
}

/** The width of a run of layers: the widest layer sets it. */
function runWidth(layerWidth: number[], first: number, last: number): number {
  let widest = 0
  for (let index = first; index <= last; index += 1) widest = Math.max(widest, layerWidth[index])
  return widest
}

/** How far the packed page is from the target shape, in log space so half and double count the same. */
function shapeError(width: number, height: number, aspect: number): number {
  if (width <= 0 || height <= 0) return Infinity
  const ratio = Math.max(width, height) / Math.min(width, height)
  return Math.abs(Math.log(ratio / aspect))
}

export function planBands(layerWidth: number[], layerHeight: number[], gap: number, aspect: number = PAGE_ASPECT): BandPlan {
  const count = layerWidth.length
  if (count === 0) return { bands: [], width: 0, height: 0 }
  const single: BandPlan = {
    bands: [{ first: 0, last: count - 1, offsetX: 0 }],
    width: runWidth(layerWidth, 0, count - 1),
    height: runHeight(layerHeight, 0, count - 1, gap),
  }
  if (count < MIN_LAYERS_TO_WRAP || single.height <= single.width * STRIP_RATIO) return single

  const columnGap = gap * 2
  let best = single
  let bestError = shapeError(single.width, single.height, aspect)
  for (let bands = 2; bands < count; bands += 1) {
    const base = Math.floor(count / bands)
    const extra = count % bands
    const ranges: Array<{ first: number; last: number }> = []
    let cursor = 0
    for (let band = 0; band < bands; band += 1) {
      const size = base + (band < extra ? 1 : 0)
      ranges.push({ first: cursor, last: cursor + size - 1 })
      cursor += size
    }
    let width = columnGap * (bands - 1)
    let height = 0
    for (const range of ranges) {
      width += runWidth(layerWidth, range.first, range.last)
      height = Math.max(height, runHeight(layerHeight, range.first, range.last, gap))
    }
    if (shapeError(width, height, aspect) >= bestError) continue
    const planned: BandRange[] = []
    let offsetX = 0
    for (const range of ranges) {
      planned.push({ first: range.first, last: range.last, offsetX })
      offsetX += runWidth(layerWidth, range.first, range.last) + columnGap
    }
    best = { bands: planned, width, height }
    bestError = shapeError(width, height, aspect)
  }
  return best
}

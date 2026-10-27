/**
 * Shapes to SVG markup.
 *
 * The one module that knows tags, so it is also the one place where a shape can silently disappear if a
 * writer forgets a case: the writer table has an entry per shape kind, and the caller counts the drops
 * instead of hiding them.
 *
 * Three containers read this output - an inline card, a full-screen view, and a sidebar tab - so the markup
 * carries no size of its own beyond its `viewBox`: the container decides how large the drawing is, and the
 * same string serves a thumbnail and a whiteboard.
 *
 * Pure, and the output is asserted as text: escaping, geometry, arrowheads, wrapped captions.
 */

/**
 * A box's label, one `tspan` per line.
 *
 * The lines were wrapped before the box was placed, so the text fits by construction; a single `<text>` with the
 * whole label is what used to overflow the box and print on top of its neighbours.
 */
function boxText(shape: { x: number; y: number; width: number; height: number; label: string; lines?: string[] }, stroke: string): string {
  const lines = shape.lines === undefined || shape.lines.length === 0 ? [shape.label] : shape.lines
  const lineHeight = 15
  const first = shape.y + shape.height / 2 - ((lines.length - 1) * lineHeight) / 2 + 4
  const spans = lines
    .map((line, index) => '<tspan x="' + n(shape.x + shape.width / 2) + '" y="' + n(first + index * lineHeight) + '">' + escape(line) + '</tspan>')
    .join('')
  return '<text font-size="11" text-anchor="middle" fill="' + stroke + '">' + spans + '</text>'
}


import type { Canvas, Shape } from './paint.js'
import type { Palette } from './palette.js'

/** One decimal place is enough at any zoom, and it keeps the markup readable. */
const n = (value: number): string => {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

const escape = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

type Writer<K extends Shape['kind']> = (shape: Extract<Shape, { kind: K }>, colours: Palette) => string

const writers: { [K in Shape['kind']]: Writer<K> } = {
  // A boundary is a dashed rectangle with its name in the top-left corner, drawn under everything else.
  group: (shape, colours) => {
    const stroke = colours[shape.colour]
    // The id travels in the markup so a container can fold a boundary by delegation, without re-deriving which
    // group a click landed on from its position or its label.
    return (
      '<g data-group-id="' + escape(shape.id) + '" style="cursor:pointer">' +
      '<rect x="' + n(shape.x) + '" y="' + n(shape.y) + '" width="' + n(shape.width) + '" height="' + n(shape.height) +
      '" rx="8" fill="none" stroke="' + stroke + '" stroke-width="1" stroke-dasharray="4 3" />' +
      '<text x="' + n(shape.x + 6) + '" y="' + n(shape.y + 12) + '" font-size="10" fill="' + stroke + '">' + escape(shape.label) + '</text>' +
      '</g>'
    )
  },
  box: (shape, colours) => {
    const stroke = colours[shape.colour]
    const width = shape.initial ? 2.5 : 1
    return (
      '<rect x="' + n(shape.x) + '" y="' + n(shape.y) + '" width="' + n(shape.width) + '" height="' + n(shape.height) +
      '" rx="6" fill="' + colours.surface + '" stroke="' + stroke + '" stroke-width="' + n(width) + '" />' +
      boxText(shape, stroke)
    )
  },
  link: (shape, colours) => {
    const stroke = colours[shape.colour]
    const arrow = arrowHead(shape.x1, shape.y1, shape.x2, shape.y2, stroke)
    return (
      '<line x1="' + n(shape.x1) + '" y1="' + n(shape.y1) + '" x2="' + n(shape.x2) + '" y2="' + n(shape.y2) +
      '" stroke="' + stroke + '" stroke-width="1" />' + arrow + edgeLabel(shape.label, shape.labelX, shape.labelY, colours)
    )
  },
  path: (shape, colours) => {
    const stroke = colours[shape.colour]
    const points = shape.points.map((point) => n(point.x) + ',' + n(point.y)).join(' ')
    const last = shape.points[shape.points.length - 1]
    const before = shape.points[shape.points.length - 2] ?? last
    return (
      '<polyline points="' + points + '" fill="none" stroke="' + stroke + '" stroke-width="1" stroke-linejoin="round" />' +
      arrowHead(before.x, before.y, last.x, last.y, stroke) + edgeLabel(shape.label, shape.labelX, shape.labelY, colours)
    )
  },
  title: (shape, colours) => {
    return '<text x="' + n(shape.x) + '" y="' + n(shape.y) + '" font-size="12" fill="' + colours[shape.colour] + '">' + escape(shape.text) + '</text>'
  },
  caption: (shape, colours) => {
    const colour = colours[shape.colour]
    const lines = shape.lines
      .map((line, index) => '<tspan x="' + n(shape.x) + '" dy="' + (index === 0 ? 0 : 15) + '">' + escape(line) + '</tspan>')
      .join('')
    return '<text x="' + n(shape.x) + '" y="' + n(shape.y + 11) + '" font-size="10" text-anchor="middle" fill="' + colour + '">' + lines + '</text>'
  },
}

/** A small filled triangle at the end of a segment, pointing along it. */
function arrowHead(x1: number, y1: number, x2: number, y2: number, stroke: string): string {
  const length = Math.hypot(x2 - x1, y2 - y1)
  if (length < 1) return ''
  const ux = (x2 - x1) / length
  const uy = (y2 - y1) / length
  const size = 7
  const half = 3.2
  const baseX = x2 - ux * size
  const baseY = y2 - uy * size
  const left = n(baseX - uy * half) + ',' + n(baseY + ux * half)
  const right = n(baseX + uy * half) + ',' + n(baseY - ux * half)
  return '<polygon points="' + n(x2) + ',' + n(y2) + ' ' + left + ' ' + right + '" fill="' + stroke + '" />'
}

/** An edge label, or nothing when the edge carries no event. */
function edgeLabel(label: string, x: number, y: number, colours: Palette): string {
  // Total on purpose: a malformed edge must lose its label, not the whole drawing.
  if (typeof label !== 'string' || label === '') return ''
  return '<text x="' + n(x) + '" y="' + n(y) + '" font-size="10" fill="' + colours.muted + '">' + escape(label) + '</text>'
}

export function toSvg(canvas: Canvas, colours: Palette, label?: string): { markup: string; dropped: number } {
  let dropped = 0
  const body: string[] = []
  for (const shape of canvas.shapes) {
    const writer = writers[shape.kind] as ((shape: Shape, colours: Palette) => string) | undefined
    if (writer === undefined) {
      dropped += 1
      continue
    }
    body.push(writer(shape, colours))
  }
  const header =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n(canvas.width) + ' ' + n(canvas.height) +
    '" width="' + n(canvas.width) + '" height="' + n(canvas.height) + '" role="img"' +
    (label === undefined ? '' : ' aria-label="' + escape(label) + '"') +
    ' font-family="system-ui, -apple-system, Segoe UI, sans-serif">'
  // The surface is part of the drawing, not the container's business: a page that paints its own layers - a
  // wallpaper, a themed panel - would otherwise change the contrast of a picture it knows nothing about.
  const background =
    '<rect x="0" y="0" width="' + n(canvas.width) + '" height="' + n(canvas.height) +
    '" fill="' + colours.background + '" />'
  return { markup: header + background + body.join('') + '</svg>', dropped }
}

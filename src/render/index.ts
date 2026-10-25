/**
 * The renderer's front door: whatever notation arrived, one drawing comes out.
 *
 * Three containers read this - the tool card, the full-screen view and the sidebar whiteboard - and each of
 * them wants the same two things: shapes to draw and markup to embed. Neither knows which notation produced
 * them, and neither needs to.
 *
 * Pure apart from the optional file write, which is the CLI's whole job.
 */

import { writeFileSync } from 'node:fs'
import { fromMermaid } from './from-mermaid.js'
import { fromPlantUml } from './from-plantuml.js'
import type { Diagram } from './model.js'
import { paintWith, type Canvas } from './paint.js'
import type { Palette } from './palette.js'
import { toSvg } from './svg.js'

export type Notation = 'mermaid' | 'plantuml'

export interface RenderInput {
  /** The notation, or `auto` to read it off the first non-empty line. */
  notation?: Notation | 'auto'
  source: string
  title?: string
}

export interface Rendered {
  diagram: Diagram
  canvas: Canvas
  /** Ready to embed: an `<svg>` with a viewBox and no fixed pixel size of its own. */
  markup: string
  /** Which notation the source turned out to be. */
  notation: Notation
  /** Lines the parser refused, with their reason. Empty when the whole source was understood. */
  refused: string[]
  /** Shapes the SVG writer had no case for. Must be zero; reported rather than hidden. */
  dropped: number
}

/** Read the notation off the source: PlantUML starts with `@startuml` or `@startmindmap`-style markers. */
export function detectNotation(source: string): Notation {
  const head = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '' && !line.startsWith("'") && !line.startsWith('//'))
  if (head === undefined) return 'mermaid'
  return /^@start/.test(head) ? 'plantuml' : 'mermaid'
}

export function render(input: RenderInput, overrides: Partial<Palette> = {}): Rendered {
  const notation = input.notation === undefined || input.notation === 'auto' ? detectNotation(input.source) : input.notation
  const parsed =
    notation === 'plantuml'
      ? fromPlantUml(input.source, input.title ?? 'plantuml')
      : fromMermaid(input.source, input.title ?? 'mermaid')
  const { canvas, colours } = paintWith(parsed.diagram, overrides)
  const written = toSvg(canvas, colours, parsed.diagram.title + ': ' + parsed.diagram.caption)
  return {
    diagram: parsed.diagram,
    canvas,
    markup: written.markup,
    notation,
    refused: parsed.refused,
    dropped: written.dropped,
  }
}

/** Write the drawing where a document can link to it. Returns the path and the byte count. */
export function writeSvg(input: RenderInput, path: string, overrides: Partial<Palette> = {}): { path: string; bytes: number; rendered: Rendered } {
  const rendered = render(input, overrides)
  writeFileSync(path, rendered.markup, 'utf8')
  return { path, bytes: rendered.markup.length, rendered }
}

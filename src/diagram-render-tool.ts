/**
 * The drawing tool: source text in, SVG out.
 *
 * One job per file: this module declares the tool and nothing else, so the documentation generator that walks
 * `*-tool` modules finds it, and so a change to the drawing never touches the reviewing.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { render, type Notation } from './render/index.js'
import { schemeNames, type PaletteScheme } from './render/palette.js'
import { writeSvg } from './render/write.js'

export const DIAGRAM_TOOL_NAME = 'diagram_render'

export const diagramRenderTool = defineTool({
  name: DIAGRAM_TOOL_NAME,
  description:
    'Draw a diagram from its source text and get back SVG. Accepts Mermaid (flowchart, stateDiagram) and PlantUML (component, package, state) for the subset this renderer draws, lays out boxes and arrows itself, and reports every line it refused with its line number instead of drawing half a diagram. Pass `out` to write the SVG next to a document. This tool draws; it does not parse a diagram back into a model, and it does not review one - uml_parse and uml_review do that.',
  parameters: {
    source: {
      type: 'string',
      description: 'The diagram source text, in Mermaid or PlantUML syntax.',
    },
    notation: {
      type: 'string',
      enum: ['auto', 'mermaid', 'plantuml'],
      description: 'Which notation `source` is written in. Default auto: read from the first meaningful line.',
    },
    title: {
      type: 'string',
      description: 'The heading drawn above the diagram. Defaults to the component configuration.',
    },
    scheme: {
      type: 'string',
      enum: schemeNames(),
      description: 'Colour scheme. Default: the standard light palette. print is greyscale, for a drawing that will be printed or embedded in a plain document.',
    },
    out: {
      type: 'string',
      description: 'Write the SVG here and report the path. Relative paths resolve against the session workspace.',
    },
  },
  output: {
    schema: { type: 'json', description: 'Drawing result: the notation used, the counts, every refused line, and the SVG markup.' },
    render(_args, value) {
      const result = value as Record<string, unknown>
      const lines: string[] = []
      const refused = Array.isArray(result.refused) ? (result.refused as string[]) : []
      lines.push(
        'dsh-diagram/v1  notation=' + String(result.notation) + '  nodes=' + String(result.nodes) + '  edges=' + String(result.edges) +
          (Number(result.groups) > 0 ? '  groups=' + String(result.groups) : '') +
          (result.path === undefined ? '' : '  written=' + String(result.path)),
      )
      lines.push('CAPTION  ' + String(result.caption))
      if (refused.length > 0) {
        lines.push('')
        lines.push('REFUSED  ' + String(refused.length) + ' line(s) - the drawing covers the rest')
        for (const line of refused) lines.push('  ' + line)
        lines.push('NEXT  Fix or delete the refused lines, or render them in a tool that supports them. The drawing you got does not show them.')
      } else {
        lines.push('NEXT  Every line was drawn. Paste the SVG where the diagram belongs, or pass `out` to write it next to the document.')
      }
      return [{ type: 'text' as const, text: lines.join('\n') }]
    },
  },
  timeoutMs: 10_000,
  isConcurrencySafe: () => true,
  async execute(args: { source?: unknown; notation?: unknown; title?: unknown; out?: unknown; scheme?: unknown }) {
    const source = typeof args.source === 'string' ? args.source : ''
    if (source.trim() === '') {
      // One shape for every answer, so the output contract has nothing to special-case.
      return {
        ok: false,
        notation: 'mermaid',
        nodes: 0,
        edges: 0,
        groups: 0,
        caption: 'no source',
        refused: ['source is empty: pass the diagram text to draw'],
        dropped: 0,
        svg: '',
      }
    }
    const notation = args.notation === 'mermaid' || args.notation === 'plantuml' ? (args.notation as Notation) : 'auto'
    const title = typeof args.title === 'string' && args.title.trim() !== '' ? args.title.trim() : undefined
    // The argument validator has already held this to the shipped schemes; an unknown value falls back rather
    // than throwing, because a stale deployment may still send one.
    const scheme = schemeNames().includes(args.scheme as PaletteScheme) ? (args.scheme as PaletteScheme) : 'default'
    const rendered = render({ source, notation, ...(title === undefined ? {} : { title }) }, {}, { scheme })
    const written =
      typeof args.out === 'string' && args.out.trim() !== ''
        ? writeSvg({ source, notation, ...(title === undefined ? {} : { title }) }, args.out.trim(), {}, { scheme })
        : undefined

    return {
      ok: rendered.refused.length === 0,
      notation: rendered.notation,
      nodes: rendered.diagram.nodes.length,
      edges: rendered.diagram.edges.length,
      groups: rendered.diagram.groups?.length ?? 0,
      caption: rendered.diagram.caption,
      refused: rendered.refused,
      dropped: rendered.dropped,
      ...(written === undefined ? {} : { path: written.path, bytes: written.bytes }),
      svg: rendered.markup,
    }
  },
})

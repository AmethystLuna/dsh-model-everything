/**
 * The diagram component: one row, one switch, one tool.
 *
 * A separate component rather than a feature of the tools above it, because drawing has nothing to do with
 * verifying. It can be on while the tools are off, off while they are on, and it carries no engine: a
 * deployment that only wants pictures of its Mermaid diagrams installs the same package and leaves the rest
 * of it alone.
 *
 * The switch is `config.enabled`, live, exactly like the routing gate: a deployment can turn the drawing off
 * at boot, from the Plugins page, or by disabling this row, and none of those touches the tools or the
 * skills.
 */

import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { render, type Notation } from './render/index.js'
import { checkBudget, DEFAULT_LIMITS, type BudgetLimits } from './render/budget.js'
import { diffStructure } from './render/diff.js'
import { collapse } from './render/collapse.js'
import { writeSvg } from './render/write.js'

/** The default a deployment inherits: on, because a component nobody knows about is a component nobody uses. */
const DEFAULT_ENABLED = true

/**
 * A live boolean, or a plain one on a host that predates the live wrapper.
 *
 * `live` is what makes the Plugins page switch take effect without a restart; the value it returns is read
 * through {@link enabledOf} rather than compared, because both shapes have been seen in the wild.
 */
const liveBoolean = (z as unknown as { live?: (schema: unknown) => unknown }).live

export interface Config {
  /** Whether the diagram tool is registered. Read through {@link enabledOf}. */
  enabled: unknown
  /** The title a drawing carries when the caller did not name one. */
  defaultTitle: string
}

export const Config = z.object({
  enabled:
    liveBoolean === undefined
      ? z.boolean().default(DEFAULT_ENABLED)
      : (liveBoolean(z.boolean().default(DEFAULT_ENABLED)) as never),
  defaultTitle: z.string().default('diagram'),
})

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
      enum: ['default', 'high-contrast', 'print'],
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
    const scheme = args.scheme === 'high-contrast' || args.scheme === 'print' ? args.scheme : 'default'
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

/** Read the switch as a boolean, whichever shape this host produced. */
export function enabledOf(config: Config): boolean {
  const value = config.enabled as boolean | { get: () => boolean }
  return typeof value === 'boolean' ? value : value.get()
}


export const DIAGRAM_REVIEW_TOOL_NAME = 'diagram_review'

/** Read the three caps a caller may override, ignoring anything that is not a positive number. */
function limitsOf(args: { maxMembers?: unknown; maxDepth?: unknown; maxNodes?: unknown }): BudgetLimits {
  const pick = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
  return {
    maxMembers: pick(args.maxMembers, DEFAULT_LIMITS.maxMembers),
    maxDepth: pick(args.maxDepth, DEFAULT_LIMITS.maxDepth),
    maxNodes: pick(args.maxNodes, DEFAULT_LIMITS.maxNodes),
  }
}

export const diagramReviewTool = defineTool({
  name: DIAGRAM_REVIEW_TOOL_NAME,
  description:
    'Review the structure of a diagram from its source text: how wide each boundary is, how deep they nest, and how many nodes the drawing holds, against budgets you can set. Accepts the same Mermaid and PlantUML subset as diagram_render and reports what it measured, so an empty report cannot be mistaken for a clean one. Read `verdict`, never `ok`. This reviews structure; it does not draw (diagram_render does) and it does not check behaviour (model_verify does).',
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
    maxMembers: {
      type: 'integer',
      description: 'How many direct children a boundary may hold. Default 7: more than a handful of boxes stops reading as a package.',
    },
    maxDepth: {
      type: 'integer',
      description: 'How deep boundaries may nest. Default 3.',
    },
    maxNodes: {
      type: 'integer',
      description: 'How many nodes the whole drawing may hold. Default 40.',
    },
  },
  output: {
    schema: { type: 'json', description: 'Structural review: the verdict, one finding per breached budget, and what was measured.' },
    render(_args, value) {
      const report = value as Record<string, unknown>
      const findings = Array.isArray(report.findings) ? (report.findings as Array<Record<string, unknown>>) : []
      const measured = (report.measured ?? {}) as Record<string, unknown>
      const lines: string[] = []
      lines.push(
        'dsh-diagram/review/v1  verdict=' + String(report.verdict) + '  ' + String(findings.length) + ' finding(s)',
      )
      lines.push(
        'MEASURED  nodes=' + String(measured.nodes) + '  groups=' + String(measured.groups) + '  deepest=' + String(measured.deepest) +
          (measured.widest === null || measured.widest === undefined ? '' : '  widest=' + JSON.stringify(measured.widest)),
      )
      for (const finding of findings) {
        lines.push('  [' + String(finding.severity) + '/' + String(finding.code) + '] ' + String(finding.message))
      }
      for (const line of Array.isArray(report.refused) ? (report.refused as string[]) : []) {
        lines.push('  refused ' + line)
      }
      if (findings.length === 0) lines.push('NEXT  The drawing is inside every budget. That says nothing about whether the system it describes is right.')
      else lines.push('NEXT  Split or fold the groups named above, or raise the budget if the medium is larger than a conversation pane.')
      return [{ type: 'text' as const, text: lines.join('\n') }]
    },
  },
  timeoutMs: 10_000,
  isConcurrencySafe: () => true,
  async execute(args: { source?: unknown; notation?: unknown; maxMembers?: unknown; maxDepth?: unknown; maxNodes?: unknown }) {
    const source = typeof args.source === 'string' ? args.source : ''
    const notation = args.notation === 'mermaid' || args.notation === 'plantuml' ? (args.notation as Notation) : 'auto'
    if (source.trim() === '') {
      return {
        ok: false,
        verdict: 'fail' as const,
        findings: [{ code: 'D0_NO_SOURCE', severity: 'error', message: 'source is empty: pass the diagram text to review' }],
        measured: { nodes: 0, groups: 0, deepest: 0, widest: null },
        refused: [],
      }
    }
    const rendered = render({ source, notation })
    const report = checkBudget(rendered.diagram, limitsOf(args))
    return {
      ok: report.verdict !== 'fail',
      verdict: report.verdict,
      // Plain JSON fields: a finding whose `group` is absent must not carry an undefined key.
      findings: report.findings.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
        ...(finding.group === undefined ? {} : { group: finding.group }),
      })),
      measured: report.measured,
      refused: rendered.refused,
    }
  },
})


export const DIAGRAM_DIFF_TOOL_NAME = 'diagram_diff'

/** Parse one side of a comparison, reporting which side failed to produce a drawing. */
function sideOf(source: string, notation: Notation | 'auto', which: 'before' | 'after'): { diagram?: ReturnType<typeof render>['diagram']; refused: string[]; problem?: string } {
  if (source.trim() === '') return { refused: [], problem: which + ' is empty: pass the diagram text for that side' }
  const rendered = render({ source, notation })
  if (rendered.diagram.nodes.length === 0) {
    return { refused: rendered.refused, problem: which + ' produced no nodes (' + String(rendered.refused.length) + ' line(s) refused)' }
  }
  return { diagram: rendered.diagram, refused: rendered.refused }
}

export const diagramDiffTool = defineTool({
  name: DIAGRAM_DIFF_TOOL_NAME,
  description:
    'Compare the containment structure of two diagrams: which boundaries are new or gone, which were renamed, which moved inside another, and which nodes changed owner. Accepts the same Mermaid and PlantUML subset as diagram_render. This decides what moved, never whether the move is better - read `verdict`, never `ok`. It does not diff report files (report_diff does) and it does not draw (diagram_render does).',
  parameters: {
    before: {
      type: 'string',
      description: 'The earlier diagram source.',
    },
    after: {
      type: 'string',
      description: 'The later diagram source.',
    },
    notation: {
      type: 'string',
      enum: ['auto', 'mermaid', 'plantuml'],
      description: 'Which notation both sides are written in. Default auto: decided per side from its first meaningful line.',
    },
  },
  output: {
    schema: { type: 'json', description: 'Structural diff: the verdict, every change with the id it is about, and the sizes of both sides.' },
    render(_args, value) {
      const report = value as Record<string, unknown>
      const changes = Array.isArray(report.changes) ? (report.changes as Array<Record<string, unknown>>) : []
      const measured = (report.measured ?? {}) as Record<string, Record<string, number>>
      const lines: string[] = []
      lines.push('dsh-diagram/diff/v1  verdict=' + String(report.verdict) + '  ' + String(changes.length) + ' change(s)')
      lines.push(
        'MEASURED  before=' + String(measured.before?.nodes) + ' node(s)/' + String(measured.before?.groups) + ' group(s)' +
          '  after=' + String(measured.after?.nodes) + ' node(s)/' + String(measured.after?.groups) + ' group(s)',
      )
      for (const change of changes) lines.push('  [' + String(change.severity) + '/' + String(change.code) + '] ' + String(change.message))
      if (changes.length === 0) lines.push('NEXT  The structure is unchanged. That is all this compares: node text, edges and guards are not part of it.')
      else lines.push('NEXT  Read each change against the design intent: a move is a decision, and this tool only reports that it happened.')
      return [{ type: 'text' as const, text: lines.join('\n') }]
    },
  },
  timeoutMs: 10_000,
  isConcurrencySafe: () => true,
  async execute(args: { before?: unknown; after?: unknown; notation?: unknown }) {
    const notation = args.notation === 'mermaid' || args.notation === 'plantuml' ? (args.notation as Notation) : 'auto'
    const before = sideOf(typeof args.before === 'string' ? args.before : '', notation, 'before')
    const after = sideOf(typeof args.after === 'string' ? args.after : '', notation, 'after')
    const problems = [before.problem, after.problem].filter((problem): problem is string => problem !== undefined)
    if (before.diagram === undefined || after.diagram === undefined) {
      return {
        ok: false,
        verdict: 'fail' as const,
        changes: problems.map((problem) => ({ code: 'D1_SIDE_UNREADABLE', severity: 'error', kind: 'removed', subject: '-', message: problem })),
        measured: {
          before: { nodes: before.diagram?.nodes.length ?? 0, groups: before.diagram?.groups?.length ?? 0 },
          after: { nodes: after.diagram?.nodes.length ?? 0, groups: after.diagram?.groups?.length ?? 0 },
        },
      }
    }
    const report = diffStructure(before.diagram, after.diagram)
    return {
      ok: report.verdict !== 'fail',
      verdict: report.verdict,
      changes: report.changes.map((change) => ({
        code: change.code,
        severity: change.severity,
        kind: change.kind,
        subject: change.subject,
        message: change.message,
      })),
      measured: report.measured,
    }
  },
})

export interface ComponentContext {
  tools: { register(definition: unknown): () => void }
}

export function apply(ctx: ComponentContext, config: Config): void {
  if (!enabledOf(config)) return
  ctx.tools.register(diagramRenderTool)
  ctx.tools.register(diagramReviewTool)
  ctx.tools.register(diagramDiffTool)
}

export const inject = ['tools']

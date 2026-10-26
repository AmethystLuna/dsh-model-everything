/**
 * The structural review tool: budgets against one drawing.
 *
 * One job per file: this module declares the tool and nothing else, so the documentation generator that walks
 * `*-tool` modules finds it, and so a change to the drawing never touches the reviewing.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { render, type Notation } from './render/index.js'
import { checkBudget, DEFAULT_LIMITS, type BudgetLimits } from './render/budget.js'

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



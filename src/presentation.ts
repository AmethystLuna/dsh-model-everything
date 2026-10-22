/**
 * What a UI shows for a report, separated from what the model reads.
 *
 * A report is written for a model: it names every check, every finding and the next step, because the
 * model has to act on all of it. A reader wants four things instead - did it run, what does it decide,
 * what is the first thing wrong, what to do next - and wants the rest folded away.
 *
 * Two host hooks carry that split:
 *
 * - `output.presentationMeta` projects a small JSON payload the host persists on the result; a client
 *   card narrows it without parsing prose.
 * - `presentResult` returns the card body from that payload, so a UI that supports it shows the summary
 *   and a UI that does not falls back to the raw text. The model-facing content never changes.
 *
 * Both are pure and replayable: they read the persisted value, never the filesystem.
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { routeFor } from './routing.js'
import type { ToolResultView } from '@deepseek-ai/dsh-tools'

/** One finding, as a card needs it: a code to name it and a sentence to read. */
export interface CardFinding {
  code: string
  severity: string
  message: string
}

/** The payload a client card narrows. Small on purpose: a card is a summary, not a second report. */
export interface ReportCard {
  verdict?: string
  verdictReason?: string
  errors: number
  warnings: number
  checksRun?: number
  first: CardFinding | null
  /** The one step a reader should take, already a sentence. */
  next: string | null
  /** Which family produced this, so a card can pick an icon and a colour without parsing codes. */
  family: string
  /** What this family owns, and where the case just outside it goes. One table, not a second prose copy. */
  route?: { owns: string; instead: string }
}

const SHORT = 160

function shorten(text: string, limit = SHORT): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : flat.slice(0, limit - 1).trimEnd() + '…'
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * Project a report into the card payload.
 *
 * Read defensively: this runs on replay too, and a payload that once had a shape may come back with a
 * field missing. A card that throws would take the whole session view with it.
 */
export function reportCard(value: unknown, family: string): ReportCard {
  const report = record(value) ?? {}
  const findings = array(report.findings)
    .map((entry) => record(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== undefined)
  const severity = (entry: Record<string, unknown>): string => String(entry.severity ?? 'info')
  const errors = findings.filter((entry) => severity(entry) === 'error')
  const warnings = findings.filter((entry) => severity(entry) === 'warning')
  const summary = record(report.summary)
  const checksRun = typeof summary?.checksRun === 'number'
    ? summary.checksRun
    : array(report.checks).length > 0
      ? array(report.checks).length
      : undefined
  const first = errors[0] ?? warnings[0]
  const next = array(report.nextSteps).map((step) => String(step))[0]
  return {
    ...(typeof report.verdict === 'string' ? { verdict: report.verdict } : {}),
    ...(typeof report.verdictReason === 'string' ? { verdictReason: shorten(report.verdictReason) } : {}),
    errors: errors.length,
    warnings: warnings.length,
    ...(checksRun === undefined ? {} : { checksRun }),
    first: first === undefined
      ? null
      : { code: String(first.code ?? 'UNKNOWN'), severity: severity(first), message: shorten(String(first.message ?? '')) },
    next: next === undefined ? null : shorten(next),
    family,
    ...(routeFor(family) === undefined
      ? {}
      : { route: { owns: routeFor(family)?.owns ?? '', instead: routeFor(family)?.notFor.tool ?? '' } }),
  }
}

/** The card body: four lines, in the order a reader asks the questions. */
export function cardBlocks(card: ReportCard): ContentBlock[] {
  const lines: string[] = []
  const head = card.verdict === undefined ? card.family : card.verdict.toUpperCase()
  const counts = card.checksRun === undefined
    ? `${String(card.errors)} error(s), ${String(card.warnings)} warning(s)`
    : `${String(card.checksRun)} checks · ${String(card.errors)} error(s) · ${String(card.warnings)} warning(s)`
  lines.push(head + '  —  ' + counts)
  if (card.verdictReason !== undefined) lines.push(card.verdictReason)
  if (card.first !== null) {
    lines.push((card.first.severity === 'error' ? '✗ ' : '⚠ ') + card.first.code + ': ' + card.first.message)
  }
  if (card.next !== null) lines.push('next: ' + card.next)
  return [{ type: 'text', text: lines.join('\n') }]
}

/**
 * `presentResult` for a report tool: render the card from the persisted payload, and fall back to the
 * raw content by returning undefined when there is none.
 */
export function reportResultView(family: string) {
  return (_args: unknown, result: { content: ContentBlock[]; meta?: unknown }): ToolResultView | undefined => {
    const card = record(result.meta) as unknown as ReportCard | undefined
    if (card === undefined || card === null) return undefined
    if (card.verdict === undefined && card.next === null && card.first === null) return undefined
    return { card: 'generic', title: family + '  ' + (card.verdict ?? '') , content: cardBlocks(card) }
  }
}

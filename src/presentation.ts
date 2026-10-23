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
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'

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
  /** `model_edit`: the changes this call applied, as the report lists them. */
  changes?: Array<{ kind: string; what: string; detail?: string }>
  /** `model_edit` and `report_diff`: how the findings moved, when either report could compare. */
  delta?: { added: number; removed: number; changed: number; addedErrors: number }
  /** `report_diff`: the first finding the change adds, so a card can lead with it. */
  firstAdded?: CardFinding
  /** `report_diff`: the current report's own verdict, which differs from the delta's when a clean change lands on a failing report. */
  currentVerdict?: string
  /** The artifact a translation or a rendering produced, as the first lines of it. */
  source?: { label: string; lines: string[]; total: number }
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
  // Two shapes live under one payload: the families with a top-level `findings` array, and the verify
  // family, whose findings sit inside `checks` and whose counts live in `summary`. Reading only the first
  // shape made a failing verification card say "0 error(s)" while its own verdict said fail.
  if (findings.length === 0) {
    for (const check of array(report.checks)) {
      for (const entry of array(record(check)?.findings)) {
        const finding = record(entry)
        if (finding !== undefined) findings.push(finding)
      }
    }
  }
  const severity = (entry: Record<string, unknown>): string => String(entry.severity ?? 'info')
  const errors = findings.filter((entry) => severity(entry) === 'error')
  const warnings = findings.filter((entry) => severity(entry) === 'warning')
  const summary = record(report.summary)
  const summaryErrors = typeof summary?.errors === 'number' ? summary.errors : undefined
  const summaryWarnings = typeof summary?.warnings === 'number' ? summary.warnings : undefined
  const checksRun = typeof summary?.checksRun === 'number'
    ? summary.checksRun
    : array(report.checks).length > 0
      ? array(report.checks).length
      : undefined
  const first = errors[0] ?? warnings[0]
  const next = array(report.nextSteps).map((step) => String(step))[0]
  const deltaSummary = record(record(report.reportDelta)?.summary) ?? record(report.summary)
  const delta = deltaSummary === undefined
    ? undefined
    : {
        added: Number(deltaSummary.added ?? 0),
        removed: Number(deltaSummary.removed ?? 0),
        changed: Number(deltaSummary.changed ?? 0),
        addedErrors: Number(deltaSummary.addedErrors ?? 0),
      }
  const changes = array(report.changes)
    .map((entry) => record(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== undefined)
    .map((entry) => ({ kind: String(entry.kind ?? '?'), what: String(entry.what ?? ''), ...(typeof entry.detail === 'string' && entry.detail !== '' ? { detail: entry.detail } : {}) }))
  const firstAddedRaw = (array(report.added).map((entry) => record(entry)).find((entry) => entry !== undefined && String(entry.severity ?? '') === 'error')
    ?? array(report.added).map((entry) => record(entry)).find((entry) => entry !== undefined))
  return {
    ...(typeof report.verdict === 'string' ? { verdict: report.verdict } : {}),
    ...(typeof report.verdictReason === 'string' ? { verdictReason: shorten(report.verdictReason) } : {}),
    errors: summaryErrors ?? errors.length,
    warnings: summaryWarnings ?? warnings.length,
    ...(checksRun === undefined ? {} : { checksRun }),
    first: first === undefined
      ? null
      : { code: String(first.code ?? 'UNKNOWN'), severity: severity(first), message: shorten(String(first.message ?? '')) },
    next: next === undefined ? null : shorten(next),
    family,
    ...(routeFor(family) === undefined
      ? {}
      : { route: { owns: routeFor(family)?.owns ?? '', instead: routeFor(family)?.notFor.tool ?? '' } }),
    ...(changes.length === 0 ? {} : { changes }),
    ...(delta === undefined ? {} : { delta }),
    ...(firstAddedRaw === undefined ? {} : { firstAdded: { code: String(firstAddedRaw.code ?? '?'), severity: String(firstAddedRaw.severity ?? 'info'), message: shorten(String(firstAddedRaw.message ?? '')) } }),
    ...(typeof report.currentVerdict === 'string' ? { currentVerdict: report.currentVerdict } : {}),
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
  if (card.source !== undefined) {
    lines.push('')
    const shown = card.source.lines.length
    lines.push(card.source.label + (card.source.total > shown ? ' (first ' + String(shown) + ' of ' + String(card.source.total) + ' lines)' : ''))
    lines.push(...card.source.lines)
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

/**
 * `presentResult` for a report tool: render the card from the persisted payload, and fall back to the
 * raw content by returning undefined when there is none.
 */
/** The last path segment, for a title. No `node:path` here: this runs on replay too. */
function lastSegment(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '' && part !== '.')
  return parts[parts.length - 1] ?? path
}

/**
 * The pending card for a report tool: a title naming the artifact, and the file to follow.
 *
 * From the arguments only, because a UI calls this during streaming and again on replay; the file has not
 * been opened at that point and must not be.
 */

/**
 * The card payload with the artifact previewed.
 *
 * A translation and a rendering both produce text a reader wants to see the shape of, and neither should
 * paste the whole file into a card: the preview is bounded, and it says how much it left out. The report
 * keeps the artifact in full for whoever needs it.
 */
export function cardWithSource(value: unknown, family: string, text: string | undefined, label: string, limit = 14): ReportCard {
  const card = reportCard(value, family)
  if (text === undefined || text.trim() === '') return card
  const all = text.split(String.fromCharCode(10))
  const lines = all.slice(0, limit)
  return { ...card, source: { label, lines, total: all.length } }
}

export function reportCallView(family: string) {
  return (args: unknown): ToolCallView | undefined => {
    const a = record(args) ?? {}
    const path = ['modelPath', 'repoPath', 'path']
      .map((key) => a[key])
      .find((value): value is string => typeof value === 'string' && value !== '')
    const kind = family === 'model_edit' ? 'edit' : family.startsWith('uml_') ? 'search' : 'other'
    const title = path === undefined ? family : family + '  ' + lastSegment(path)
    return { card: 'generic', title, kind, ...(path === undefined ? {} : { locations: [{ path }] }) }
  }
}

/**
 * The card for `model_edit`: what changed, and what the change did to the findings.
 *
 * Both lists are already in the report, so this is a rendering of the same value rather than a second
 * computation - the rule every card here follows.
 */
export function editCardBlocks(card: ReportCard): ContentBlock[] {
  const changes = card.changes ?? []
  const lines: string[] = []
  const head = card.verdict === undefined ? card.family : card.verdict.toUpperCase()
  lines.push(head + (changes.length === 0 ? '  —  no change was applied' : '  —  ' + String(changes.length) + ' change(s)'))
  for (const change of changes.slice(0, 6)) {
    lines.push('· ' + change.kind + ' ' + change.what + (change.detail === undefined ? '' : ' (' + change.detail + ')'))
  }
  if (changes.length > 6) lines.push('· … ' + String(changes.length - 6) + ' more in the report')
  if (card.delta !== undefined) {
    lines.push('findings: added ' + String(card.delta.added) + ' (' + String(card.delta.addedErrors) + ' error) · removed ' + String(card.delta.removed) + ' · changed ' + String(card.delta.changed))
  }
  if (card.next !== null) lines.push('next: ' + card.next)
  return [{ type: 'text', text: lines.join('\n') }]
}

/**
 * The card for `report_diff`: does this change add anything, read as counts and the first added error.
 *
 * A diff's `verdict` is about the delta, so the card leads with the delta and never with the current
 * report's own verdict - the two differ exactly when a clean change lands on an already-failing report.
 */
export function diffCardBlocks(card: ReportCard): ContentBlock[] {
  const delta = card.delta
  const lines: string[] = []
  const head = card.verdict === undefined ? card.family : card.verdict.toUpperCase()
  lines.push(head + '  —  added ' + String(delta?.added ?? 0) + ' (' + String(delta?.addedErrors ?? 0) + ' error) · removed ' + String(delta?.removed ?? 0) + ' · changed ' + String(delta?.changed ?? 0))
  if (card.currentVerdict !== undefined) lines.push('the current report on its own: ' + card.currentVerdict)
  if (card.firstAdded !== undefined) lines.push('✗ ' + card.firstAdded.code + ': ' + card.firstAdded.message)
  if ((delta?.added ?? 0) === 0) lines.push('nothing was added: this change is accepted by the "no new findings" rule')
  if (card.next !== null) lines.push('next: ' + card.next)
  return [{ type: 'text', text: lines.join('\n') }]
}

/** `presentResult` for `model_edit`, falling back to the generic card when the payload has no changes. */
export function editResultView(family: string) {
  return (_args: unknown, result: { content: ContentBlock[]; meta?: unknown }): ToolResultView | undefined => {
    const card = record(result.meta) as unknown as ReportCard | undefined
    if (card === undefined || card === null) return undefined
    const changeCount = card.changes === undefined ? '' : '  ·  ' + String(card.changes.length) + ' change(s)'
    return { card: 'generic', title: family + '  ' + (card.verdict ?? '') + changeCount, content: editCardBlocks(card) }
  }
}

export function reportResultView(family: string) {
  return (_args: unknown, result: { content: ContentBlock[]; meta?: unknown }): ToolResultView | undefined => {
    const card = record(result.meta) as unknown as ReportCard | undefined
    if (card === undefined || card === null) return undefined
    if (card.verdict === undefined && card.next === null && card.first === null) return undefined
    return { card: 'generic', title: family + '  ' + (card.verdict ?? '') , content: cardBlocks(card) }
  }
}

/** `presentResult` for `report_diff`: the delta leads, never the current report's own verdict. */
export function diffResultView(family: string) {
  return (_args: unknown, result: { content: ContentBlock[]; meta?: unknown }): ToolResultView | undefined => {
    const card = record(result.meta) as unknown as ReportCard | undefined
    if (card === undefined || card === null) return undefined
    return { card: 'generic', title: family + '  ' + (card.verdict ?? ''), content: diffCardBlocks(card) }
  }
}

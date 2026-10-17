import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from './json-value.js'
import { diffReports } from './baseline.js'
import { refusalVerdict } from './engine.js'
import { renderReportText } from './report-view.js'

export const REPORT_DIFF_TOOL_NAME = 'report_diff'

/**
 * Turn a refusal into a report the model can route on.
 *
 * `diffReports` throws when a side is not a report, which is the right thing at the engine boundary -
 * there is nothing to compare and no verdict to give. The tool boundary has a different obligation:
 * malformed input has to come back as something with a code, never as a raw throw. This is the same
 * shape the UML tools use, with a code of this tool's own.
 */
function refusal(error: unknown): JsonValue {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, ran: false, ...refusalVerdict(message), errorCode: 'REPORT_INVALID', error: message } as unknown as JsonValue
}

/**
 * Model-visible DSH tool that compares two reports of the same family — the accepted
 * "violations must not increase" acceptance criterion, computed instead of eyeballed.
 * A finding's identity is its check + code + machine-readable locator, so a reworded
 * message reads as `changed`, and two runs over the same input add nothing.
 */
export const reportDiffTool = defineTool({
  name: REPORT_DIFF_TOOL_NAME,
  description:
    'Compare two reports of the same family, to accept a change by what it added rather than by reading two reports: `baseline` (earlier) against `current` (newer). Use it to accept a slice by "no new findings". Findings match on a stable identity: check id, code, and a locator built from `evidence` and `path`. Reworded prose counts as `changed`, not as new. Returns added, removed and changed findings, plus `summary`. It does not look at a single artefact and it does not produce a report of its own: for the first look at one, call the domain tool directly (`model_verify`, `model_datamodel_verify`, `model_design_review`, `uml_review`, `uml_structure_verify`, `model_interleaving_scan`), then compare what those two calls returned. `verdict` is about the delta: a newly added error finding fails it. `currentVerdict` keeps the run\'s own verdict, so a clean delta over a failing report still shows as failing. Two runs over the same input add nothing. Both sides have to be reports this can compare: a refusal, a run that examined nothing, and a report from another family are refused with `REPORT_INVALID` instead of being compared, because a finding absent from an incomparable roster would otherwise read as resolved.',
  parameters: {
    baseline: {
      type: 'json',
      required: true,
      description: 'The earlier report (any family: verify, compose, datamodel, uml review, structure, concurrency).',
    },
    current: {
      type: 'json',
      required: true,
      description: 'The current report to compare against the baseline.',
    },
    reportView: {
      type: 'string',
      enum: ['digest', 'full'],
      description: 'digest (default) prints the readable body; full prints the structured diff report.',
    },
  },
  output: {
    schema: {
      type: 'json',
      description: 'Baseline diff report: added/removed/changed findings, delta verdict, current verdict, summary and next steps.',
    },
    render(args, value) {
      return [{ type: 'text' as const, text: renderReportText(value, { full: args.reportView === 'full' }) }]
    },
  },
  timeoutMs: 10_000,
  isConcurrencySafe: () => true,
  async execute(args) {
    try {
      return diffReports(args.baseline, args.current) as unknown as JsonValue
    } catch (error) {
      return refusal(error)
    }
  },
})

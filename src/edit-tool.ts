/**
 * `model_edit`: change a model file by naming the change, then see what the engine now says.
 *
 * The loop this replaces is edit-and-re-verify: hand back the whole model, get the whole report,
 * repeat. Here the file holds the model, an operation holds the change, and the report carries the
 * structural diff plus the difference in findings - so one call answers "what did I change, and did
 * it fix anything".
 *
 * The description is written for the decision, not the schema: when this tool pays, when another
 * one does, and what it refuses.
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

import { diffReports } from './baseline.js'
import { applyEdits, readModelFile } from './editor.js'
import { REPORT_SCHEMAS, runVerification } from './engine.js'
import { editResultView, reportCallView, reportCard } from './presentation.js'
import type { JsonValue } from './json-value.js'
import { optionRefusal } from './option-shape.js'
import { renderReportText } from './report-view.js'

export const MODEL_EDIT_TOOL_NAME = 'model_edit'

export const modelEditTool = defineTool({
  name: MODEL_EDIT_TOOL_NAME,
  description:
    'Change a model file by naming one change, then see what the engine now decides. Use it to fix a model over several rounds: write the model to a file once, then add a state, tighten a guard, drop a transition and let the report show whether the finding went away. ' +
    'It answers with the structural diff and, unless you set verify: false, the difference in findings - new errors, gone findings, before and after verdict - so one call replaces edit-then-verify-then-compare. ' +
    'It refuses an edit that would leave an invalid model and writes nothing, so the file is always verifiable. ' +
    'Do not use it to build a model from nothing (write the file or verify inline first), to check work that is not a state machine (`model_datamodel_verify`, `model_design_review`), or to judge the design as a whole (`model_verify` reports; this tool only compares its own edit).',
  parameters: {
    modelPath: {
      type: 'string',
      required: true,
      description: 'Path to the model file to edit. It must already exist; the edit is applied to a copy and written back atomically.',
    },
    ops: {
      type: 'json',
      required: true,
      description:
        'Ordered list of operations, applied as one batch. Compact form: {addState: "c"} · {removeState: "c"} · {addTransition: ["from", "event", "to"]} · {removeTransition: ["from", "event"]} · {updateTransition: ["from", "event", {guard: ...}]} · {set: ["/path", value]} · {remove: "/path"}. Long form ({op: ..., state/transition/path/value}) works too, and addState/addTransition take the full object when you need terminal, guard, updates or cost.',
    },
    reportView: {
      type: 'string',
      enum: ['digest', 'full'],
      description: 'digest (default) prints the changes and the report delta; full prints the structured result, which report_diff needs.',
    },
    allowInvalid: {
      type: 'boolean',
      description: 'Write the batch even when the result does not validate. Use it only for an edit that needs two calls with a broken model in between; the reply then carries validationErrors, and the next verification will refuse the file.',
    },
    verify: {
      type: 'boolean',
      description: 'Run the engine on the model before and after the edit and return the difference in findings. Default true; pass false for a batch of edits where only the final state matters.',
    },
  },
  output: {
    schema: {
      type: 'json',
      description: 'the edit result: structural changes, the new verdict, and the report delta when verify ran.',
    },
    render(args, value) {
      return [{ type: 'text' as const, text: renderReportText(value, { full: args.reportView === 'full' }) }]
    },
    // The card a UI shows, separated from the text the model reads.
    presentationMeta(_args, value) {
      return reportCard(value, MODEL_EDIT_TOOL_NAME) as unknown as JsonValue
    },
  },
  presentCall: reportCallView(MODEL_EDIT_TOOL_NAME),
  presentResult: editResultView(MODEL_EDIT_TOOL_NAME),

  timeoutMs: 20_000,
  isConcurrencySafe: () => false,
  async execute(args) {
    try {
      const before = readModelFile(args.modelPath).model
      const verify = args.verify !== false
      const beforeReport = verify ? runVerification(before) : undefined
      const { model, changes, valid, errors } = applyEdits(args.modelPath, args.ops, { allowInvalid: args.allowInvalid === true })
      const afterReport = verify ? runVerification(model) : undefined
      // A model that did not decide anything (checksRun 0 - the engine refused its shape) has no
      // findings to compare. Diffing it would raise, and it would raise after the file was written,
      // so the reply would claim nothing ran while the edit had landed. Say there is no delta instead.
      const decided = (report: typeof beforeReport): boolean => (report?.summary?.checksRun ?? 0) > 0
      const compare = beforeReport !== undefined && afterReport !== undefined && decided(beforeReport) && decided(afterReport)
      const delta = compare ? diffReports(beforeReport, afterReport) : undefined
      const noDelta = verify && !compare ? (decided(beforeReport) ? 'the edited model did not decide anything, so there is no after-report to compare' : 'the model before the edit did not decide anything, so there is no before-report to compare') : undefined
      const verdict = afterReport?.verdict ?? 'pass'
      const reason =
        (afterReport === undefined ? 'edit applied, not verified: ' : '') +
        changes.map((change) => `${change.kind} ${change.what}${change.detail === '' ? '' : ' (' + change.detail + ')'}`).join('; ') +
        (delta === undefined ? (noDelta === undefined ? '' : ` — ${noDelta}`) : ` — verdict ${String(beforeReport?.verdict ?? '?')} -> ${String(delta.currentVerdict ?? '?')}`)
      return {
        ok: true,
        ran: true,
        schema: REPORT_SCHEMAS.edit,
        verdict,
        verdictReason: reason,
        changes,
        ...(valid ? {} : { modelValid: false, validationErrors: errors }),
        // `undefined` is not lossless JSON: with verify off there is no hash to report, so the field
        // is omitted rather than filled with nothing.
        ...(afterReport === undefined ? {} : { hashes: { hashSpec: afterReport.hashSpec, modelHash: afterReport.modelHash } }),
        ...(beforeReport === undefined ? {} : { before: { verdict: beforeReport.verdict, modelHash: beforeReport.modelHash } }),
        ...(afterReport === undefined ? {} : { after: { verdict: afterReport.verdict, errors: afterReport.summary?.errors, warnings: afterReport.summary?.warnings } }),
        ...(delta === undefined ? {} : { reportDelta: delta }),
        nextSteps:
          delta === undefined
            ? [noDelta === undefined
                ? 'The file now holds the edited model. Run `model_verify` with its `modelPath` when the edits are done.'
                : 'The edit is on disk. Run `model_verify` on the file: it now decides whether this is a valid model.']
            : delta.added.length === 0 && delta.removed.length === 0
              ? ['The edit moved nothing in the findings. Change the part of the model the finding names, or report the finding as unresolved.']
              : [],
      } as unknown as JsonValue
    } catch (error) {
      return optionRefusal(error, 'EDIT_OPTION_INVALID') as unknown as JsonValue
    }
  },
})

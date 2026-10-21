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
        'Ordered list of operations. addState {state:{id, terminal?}} · removeState {id} · addTransition {transition:{from, event, to, guard?, updates?, cost?}} · removeTransition {from, event} · updateTransition {from, event, patch} · set {path, value} (JSON pointer) · remove {path}.',
    },
    reportView: {
      type: 'string',
      enum: ['digest', 'full'],
      description: 'digest (default) prints the changes and the report delta; full prints the structured result, which report_diff needs.',
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
  },
  timeoutMs: 20_000,
  isConcurrencySafe: () => false,
  async execute(args) {
    try {
      const before = readModelFile(args.modelPath).model
      const verify = args.verify !== false
      const beforeReport = verify ? runVerification(before) : undefined
      const { model, changes } = applyEdits(args.modelPath, args.ops)
      const afterReport = verify ? runVerification(model) : undefined
      const delta = beforeReport !== undefined && afterReport !== undefined ? diffReports(beforeReport, afterReport) : undefined
      const verdict = afterReport?.verdict ?? 'pass'
      const reason =
        (afterReport === undefined ? 'edit applied, not verified: ' : '') +
        changes.map((change) => `${change.kind} ${change.what}${change.detail === '' ? '' : ' (' + change.detail + ')'}`).join('; ') +
        (delta === undefined ? '' : ` — verdict ${String(beforeReport?.verdict ?? '?')} -> ${String(delta.currentVerdict ?? '?')}`)
      return {
        ok: true,
        ran: true,
        schema: REPORT_SCHEMAS.edit,
        verdict,
        verdictReason: reason,
        changes,
        hashes: { hashSpec: afterReport?.hashSpec, modelHash: afterReport?.modelHash },
        ...(beforeReport === undefined ? {} : { before: { verdict: beforeReport.verdict, modelHash: beforeReport.modelHash } }),
        ...(afterReport === undefined ? {} : { after: { verdict: afterReport.verdict, errors: afterReport.summary?.errors, warnings: afterReport.summary?.warnings } }),
        ...(delta === undefined ? {} : { reportDelta: delta }),
        nextSteps:
          delta === undefined
            ? ['The file now holds the edited model. Run `model_verify` with its `modelPath` when the edits are done.']
            : delta.added.length === 0 && delta.removed.length === 0
              ? ['The edit moved nothing in the findings. Change the part of the model the finding names, or report the finding as unresolved.']
              : [],
      } as unknown as JsonValue
    } catch (error) {
      return optionRefusal(error, 'EDIT_OPTION_INVALID') as unknown as JsonValue
    }
  },
})

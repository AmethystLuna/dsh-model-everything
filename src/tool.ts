import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from './json-value.js'
import { runVerification } from './engine.js'
import { renderReportText } from './report-view.js'
import { cardWithDiagram, machineDrawable, reportCallView, reportCard, reportResultView } from './presentation.js'
import { OptionShapeError, optionRefusal, requireObjectOption } from './option-shape.js'
import { oneOf } from './model-file.js'

export const MODEL_VERIFY_TOOL_NAME = 'model_verify'

/**
 * Model-visible DSH tool wrapping the bundled TypeScript verification engine.
 * The model passes a LogicModelV1 object; the engine validates it and returns
 * the 22-check report (S1-S8 structural, A1-A14), or a 26-check
 * report when beforeModel is supplied (D1 behavioral preservation, D2
 * invariant continuity, D3 regression delta, D4 deadlock/liveness regression).
 * This is the dsh-native path: the model is built and run here, with no
 * template to fill in by hand.
 */
export const modelVerifyTool = defineTool({
  name: MODEL_VERIFY_TOOL_NAME,
  description:
    'Verify one state machine: does this LogicModelV1 reach a state it must not, deadlock, livelock, or leave an invariant undecided. Model shape: schemaVersion 1, init, states ({id, terminal?}), transitions ({from, event, to, guard?, updates?, cost?}), plus optional variables, invariants, concurrentPairs, boundaryChecks, resourcePairs, idempotentEvents and narrative. Guards are structured: {variable, op, value}, {all}, {any} or {not}. Invariants cover never-states, var-in-range, event-before-state, leads-to, sequence, atomicity, budget, probability and deadline. `cost` defaults to 1 and drives the path-cost-against-budget check. `weight` defaults to 1 and makes the model a DTMC, which is what the probabilistic-reachability check needs. A state with `maxTicks` needs top-level `tickEvents`, or the deadline check reports it as over-resident. The schema is closed: an undeclared key is a validation error. Keys starting with `_` are metadata: ignored, kept out of `modelHash`, and echoed as `metadataKeys`. Variables support monotonic inc and dec. Pass `beforeModel` and `stateMapping` to compare the two models of a refactor for behaviour preservation, invariant continuity and deadlock regression. For two or more machines interacting, use `model_compose_verify` instead: this tool decides one machine at a time. Read `verdict`, never `ok`. The full schema is in the `model_verify` skill: references/dsh-model-schema.md.',
  parameters: {
    model: {
      type: 'json',
      description: 'LogicModelV1 state machine model to verify. Pass this, or modelPath, not both.',
    },
    modelPath: {
      type: 'string',
      description: 'Path to a JSON file holding the model, instead of inlining it. Formatting does not matter: whitespace, a BOM and pretty printing all parse. Relative paths resolve against the process working directory, which is the session workspace.',
    },
    maxStates: {
      type: 'integer',
      description: 'Maximum runtime states to explore. Default 10000.',
    },
    maxPermutationEvents: {
      type: 'integer',
      description: 'Maximum event count for A3 order permutation. Default 5.',
    },
    beforeModel: {
      type: 'json',
      description: 'Optional BEFORE LogicModelV1 state machine model for refactoring/migration regression comparison.',
    },
    stateMapping: {
      type: 'json',
      description: 'Optional object mapping BEFORE state ids to AFTER state ids. Omit for identity mapping (same state names).',
    },
    check: {
      type: 'string',
      description: 'Print one check in full when the digest truncated it. Pass the check id the CHECKS line lists (for example A9); the per-check budget no longer applies, and an id this report does not carry is answered with the ids that it does.',
    },
    reportView: {
      type: 'string',
      enum: ['digest', 'full'],
      description: 'digest (default) prints the readable body; full prints the structured report, which report_diff needs.',
    },
  },
  output: {
    schema: {
      type: 'json',
      description: 'this plugin verification report with summary and per-check findings.',
    },
    render(args, value) {
      return [{ type: 'text' as const, text: renderReportText(value, { full: args.reportView === 'full', check: args.check }) }]
    },
    // The card a UI shows, separated from the text the model reads.
    presentationMeta(args, value) {
      return cardWithDiagram(value, MODEL_VERIFY_TOOL_NAME, machineDrawable(args.model)) as unknown as JsonValue
    },
  },
  presentCall: reportCallView(MODEL_VERIFY_TOOL_NAME),
  presentResult: reportResultView(MODEL_VERIFY_TOOL_NAME),
  timeoutMs: 10_000,
  isConcurrencySafe: () => true,
  async execute(args) {
    try {
      // `stateMapping` is declared `json`, so a string, a list or a map to non-strings all arrive here, and the
      // engine reads the option with `mapping[state] ?? state`: every one of those quietly became the identity
      // mapping. A renamed state then read as "A was removed and A2 was added" - a D1 error produced by the shape
      // of an option rather than by the refactor, which is the one thing a regression comparison must not do.
      requireObjectOption(args.stateMapping, 'stateMapping', 'VERIFY_OPTION_INVALID')
      const mapping = args.stateMapping as Record<string, unknown> | undefined
      if (mapping !== undefined) {
        if (args.beforeModel === undefined) {
          throw new OptionShapeError(
            'VERIFY_OPTION_INVALID',
            'stateMapping was passed without beforeModel: the mapping says how BEFORE state ids turn into AFTER ones, so there is nothing to map. Pass beforeModel, or omit the mapping.',
          )
        }
        const [from, to] = Object.entries(mapping).find(([, value]) => typeof value !== 'string' || value === '') ?? []
        if (from !== undefined) {
          throw new OptionShapeError(
            'VERIFY_OPTION_INVALID',
            'stateMapping.' + from + ' is not a state id (it is ' + (Array.isArray(to) ? 'an array' : to === null ? 'null' : 'a ' + typeof to) + '). Every value is the AFTER state id the BEFORE state maps to, so it has to be a non-empty string.',
          )
        }
      }
      const model = oneOf(args.model, args.modelPath, 'model', 'modelPath', 'VERIFY_OPTION_INVALID')
      return runVerification(model, {
        maxStates: args.maxStates,
        maxPermutationEvents: args.maxPermutationEvents,
        beforeModel: args.beforeModel,
        stateMapping: mapping as Record<string, string> | undefined,
      }) as unknown as JsonValue
    } catch (error) {
      return optionRefusal(error, 'VERIFY_OPTION_INVALID') as unknown as JsonValue
    }
  },
})

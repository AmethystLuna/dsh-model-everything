import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from './json-value.js'
import { runCompositionVerification } from './engine.js'
import { reportCard, reportResultView } from './presentation.js'
import type { SharedAccess, SharedLocation } from './engine.js'
import { OptionShapeError, optionRefusal, requireArrayOption } from './option-shape.js'
import { renderReportText } from './report-view.js'

export const COMPOSE_TOOL_NAME = 'model_compose_verify'

/**
 * DSH tool wrapping multi-machine composition verification:
 * product-space reachability with rendezvous handshakes (C1 deadlock, C2 sync), and the shared
 * locations the machines both touch (C3 declarations, C4 unordered write, C5 non-atomic update).
 */
export const modelComposeTool = defineTool({
  name: COMPOSE_TOOL_NAME,
  description:
    'Check two or more LogicModelV1 machines together. Pass the models in `machines`. Pass `rendezvous` for handshake events: these fire only when every declaring machine is enabled at once, and a terminal machine stops taking part. Other events advance one machine, so a machine waiting on a handshake can take any number of its own steps first. There is no rate ratio and no fairness bound. Pass `shared` for locations two machines both touch and `accesses` to say which machine event reads or writes one: C3 reports a declaration that names something the composition does not have, C4 an unordered write to one location both machines write, and C5 a read-modify-write pair the model does not make atomic (the lost-update interleaving). Two accesses that name the same `protectedBy` lock are treated as exclusive; that the lock is held across the whole operation is a single-machine question this tool does not answer. Returns C1 deadlocks (no machine can advance, and one is not terminal) and C2 handshakes that never fire. Both name the reason per machine, and C1 gives the shortest counterexample. `maxStates` caps the search; a capped run says so. It decides what no single machine can show: a handshake that never fires, or a node where no machine may advance because of the others. One machine on its own is `model_verify`. Read `verdict` and `verdictReason`.',
  parameters: {
    machines: {
      type: 'json',
      required: true,
      description: 'Array of LogicModelV1 state-machine models to compose (two or more).',
    },
    rendezvous: {
      type: 'json',
      description: 'Optional array of handshake event names shared by the machines.',
    },
    shared: {
      type: 'json',
      description: 'Optional array of shared locations: { id, initial? }. Without one, nothing is shared between the machines.',
    },
    accesses: {
      type: 'json',
      description: 'Optional array of { machine, event, location, kind: "read" | "write" | "read-write", protectedBy? }. A read-write is a read-modify-write: two of them that are not mutually exclusive lose an update.',
    },
    maxStates: {
      type: 'integer',
      description: 'Maximum composite states to explore. Default 10000.',
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
      description: 'Composition verification report with C1/C2 findings and, when shared locations are declared, C3/C4/C5.',
    },
    render(args, value) {
      return [{ type: 'text' as const, text: renderReportText(value, { full: args.reportView === 'full', check: args.check }) }]
    },
    // The card a UI shows, separated from the text the model reads.
    presentationMeta(_args, value) {
      return reportCard(value, COMPOSE_TOOL_NAME) as unknown as JsonValue
    },
  },  presentResult: reportResultView(COMPOSE_TOOL_NAME),

  timeoutMs: 10_000,
  isConcurrencySafe: () => true,
  async execute(args) {
    try {
      // `machines` is declared `json`, so a string reached `machinesInput.forEach` as a raw TypeError. The
      // array-ness is the tool's contract; check it here and refuse with a code that names the option.
      requireArrayOption(args.machines, 'machines', 'COMPOSE_OPTION_INVALID')
      if (args.machines !== undefined && (args.machines as unknown[]).length === 0) {
        throw new OptionShapeError('COMPOSE_OPTION_INVALID', 'machines is an empty array. A composition needs at least two machines to compose; with none there is nothing to decide.')
      }
      if (args.shared !== undefined) requireArrayOption(args.shared, 'shared', 'COMPOSE_OPTION_INVALID')
      if (args.accesses !== undefined) requireArrayOption(args.accesses, 'accesses', 'COMPOSE_OPTION_INVALID')
      return runCompositionVerification(args.machines as unknown[], {
        rendezvous: args.rendezvous as string[] | undefined,
        shared: args.shared as SharedLocation[] | undefined,
        accesses: args.accesses as SharedAccess[] | undefined,
        maxStates: args.maxStates,
      }) as unknown as JsonValue
    } catch (error) {
      return optionRefusal(error, 'COMPOSE_OPTION_INVALID') as unknown as JsonValue
    }
  },
})

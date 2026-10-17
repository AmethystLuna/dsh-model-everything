import { defineTool } from '@deepseek-ai/dsh-tools';
import { runCompositionVerification } from './engine.js';
import { OptionShapeError, optionRefusal, requireArrayOption } from './option-shape.js';
import { renderReportText } from './report-view.js';
export const COMPOSE_TOOL_NAME = 'model_compose_verify';
/**
 * DSH tool wrapping multi-machine composition verification:
 * product-space reachability with rendezvous handshakes (C1 deadlock, C2 sync).
 */
export const modelComposeTool = defineTool({
    name: COMPOSE_TOOL_NAME,
    description: 'Check two or more LogicModelV1 machines together. Pass the models in `machines`. Pass `rendezvous` for handshake events: these fire only when every declaring machine is enabled at once, and a terminal machine stops taking part. Other events advance one machine, so a machine waiting on a handshake can take any number of its own steps first. There is no rate ratio and no fairness bound. Returns C1 deadlocks (no machine can advance, and one is not terminal) and C2 handshakes that never fire. Both name the reason per machine, and C1 gives the shortest counterexample. `maxStates` caps the search; a capped run says so. It decides what no single machine can show: a handshake that never fires, or a node where no machine may advance because of the others. One machine on its own is `model_verify`. Read `verdict` and `verdictReason`.',
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
        maxStates: {
            type: 'integer',
            description: 'Maximum composite states to explore. Default 10000.',
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
            description: 'Composition verification report with C1/C2 findings.',
        },
        render(args, value) {
            return [{ type: 'text', text: renderReportText(value, { full: args.reportView === 'full' }) }];
        },
    },
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
        try {
            // `machines` is declared `json`, so a string reached `machinesInput.forEach` as a raw TypeError. The
            // array-ness is the tool's contract; check it here and refuse with a code that names the option.
            requireArrayOption(args.machines, 'machines', 'COMPOSE_OPTION_INVALID');
            if (args.machines !== undefined && args.machines.length === 0) {
                throw new OptionShapeError('COMPOSE_OPTION_INVALID', 'machines is an empty array. A composition needs at least two machines to compose; with none there is nothing to decide.');
            }
            return runCompositionVerification(args.machines, {
                rendezvous: args.rendezvous,
                maxStates: args.maxStates,
            });
        }
        catch (error) {
            return optionRefusal(error, 'COMPOSE_OPTION_INVALID');
        }
    },
});

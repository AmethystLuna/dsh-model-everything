/**
 * `model_automaton_verify`: what language does this machine accept, and is it the one it claims.
 *
 * The description is written for the decision. A conformance claim - "the implementation allows every run
 * the specification allows" - is a language inclusion, and the two machines can be small while the
 * question is still beyond a reading: the witness is a word nobody thought to try.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { verifyAutomaton } from './automaton.js';
import { optionRefusal } from './option-shape.js';
import { renderReportText } from './report-view.js';
import { reportCallView, reportCard, reportResultView } from './presentation.js';
export const MODEL_AUTOMATON_TOOL_NAME = 'model_automaton_verify';
export const modelAutomatonTool = defineTool({
    name: MODEL_AUTOMATON_TOOL_NAME,
    description: 'Decide a finite-word automaton: what it accepts, whether it is empty, whether a state is a trap, and whether its language equals, contains or is contained in another automaton. Use it for a conformance claim - the protocol the code implements against the one the specification draws - where the answer is a word that one machine accepts and the other rejects, not an opinion. ' +
        'Give `other` to compare two automata; `relation` picks equivalent (default), subset (the first is contained in the second) or superset. A failed relation returns the shortest witness word. ' +
        'Determinism, reachability and trap states are reported whether or not `other` is given. ' +
        'It decides finite words over an explicit alphabet. Liveness, fairness, timing and infinite words are out of scope: a Büchi or timed model is a different family, and this tool does not build one. For reachability or deadlock in a single state machine use `model_verify`; for machines that must handshake use `model_compose_verify`.',
    parameters: {
        automaton: {
            type: 'json',
            required: true,
            description: 'The automaton: {states: [ids], alphabet: [symbols], transitions: [{from, symbol, to}], init, accepting: [ids]}. An NFA is accepted and determinised; nondeterminism is reported.',
        },
        other: {
            type: 'json',
            description: 'The automaton to compare against, in the same shape. Omit to check this one on its own.',
        },
        relation: {
            type: 'string',
            enum: ['equivalent', 'subset', 'superset'],
            description: 'Which language relation `other` must stand in. Default equivalent. subset: the first is contained in the second; superset: the second is contained in the first.',
        },
        reportView: {
            type: 'string',
            enum: ['digest', 'full'],
            description: 'digest (default) prints the readable body; full prints the structured result.',
        },
    },
    output: {
        schema: {
            type: 'json',
            description: 'the automaton report: verdict, findings, the witness word when a relation fails, and hashes of the inputs.',
        },
        render(args, value) {
            return [{ type: 'text', text: renderReportText(value, { full: args.reportView === 'full' }) }];
        },
        // The card a UI shows, separated from the text the model reads: a verdict and the first thing wrong,
        // never the whole report.
        presentationMeta(args, value) {
            return reportCard(value, MODEL_AUTOMATON_TOOL_NAME);
        },
    },
    presentCall: reportCallView(MODEL_AUTOMATON_TOOL_NAME),
    presentResult: reportResultView(MODEL_AUTOMATON_TOOL_NAME),
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
        try {
            return verifyAutomaton(args.automaton, {
                ...(args.other === undefined ? {} : { other: args.other }),
                ...(args.relation === undefined ? {} : { relation: args.relation }),
            });
        }
        catch (error) {
            return optionRefusal(error, 'AUTOMATON_OPTION_INVALID');
        }
    },
});

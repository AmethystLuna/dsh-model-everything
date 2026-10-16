import { defineTool } from '@deepseek-ai/dsh-tools';
import { REPORT_SCHEMAS } from './engine.js';
import { runDesignReview } from './design-engine.js';
import { renderReportText } from './report-view.js';
export const DESIGN_TOOL_NAME = 'model_design_review';
/**
 * Model-visible DSH tool that reviews a *design*: the shape of its dependency graph, and the
 * contracts the design states about itself.
 *
 * This is not `model_verify`. That one asks whether a machine can misbehave; this one asks
 * whether a design keeps its own declarations - which layer may depend on which, which
 * responsibility owns which dependency, which subtype may refuse which event. Two engines,
 * two questions, two verdicts that mean different things.
 */
export const designTool = defineTool({
    name: DESIGN_TOOL_NAME,
    description: 'Hold a design to the contracts it declares about itself: layering, responsibility ownership, substitutability, interface width. For auditing a dependency diagram against a matrix use `uml_structure_verify`; this one decides the declarations the design makes about itself and reports the shape of its graph. Violations of a declaration decide `verdict`: DES1 cycle, DES2 layer order, DES3 boundary leak, DES5 unplaced node, DES6 missing required dependency, DES7 substitutability, DES9 split interface. Signals are facts, not defects: DES4 load-bearing element, DES8 uncalled operation, DES10 responsibility gap, DES11 abstraction on a concrete type. A check with nothing to hold the design to is `skip`, not `pass`. `facts` has ranks, fan-in/out, components, density, cyclomatic complexity, and the fewest edges whose removal makes the graph acyclic (exact for a small cyclic part, an upper bound past that: `feedbackArcsExact` says which). Read `verdict`, never `ok`.',
    parameters: {
        model: {
            type: 'json',
            required: true,
            description: 'DesignModelV1: {schemaVersion: 1, architecture: {nodes: [ids], edges: [[from, to]]}, types?: [{name, stereotype, extends?, implements?, operations?, transitions?, forbids?, responsibilities?, dependsOn?, uses?, layer?}], declare?: {layers?, boundaries?, allowedEdges?, requiredEdges?}}. The schema is closed: an unknown key is refused rather than ignored. `types` is what makes the principle checks possible - with no `extends` there is no substitutability to decide, with no `uses` no interface can be called fat, and no `responsibilities` means nothing to compare the dependencies against.',
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
            description: 'Design review report: every check with its status, `violations` (they decide the verdict), `signals`, `facts` (graph features), summary and next steps.',
        },
        render(args, value) {
            return [{ type: 'text', text: renderReportText(value, { full: args.reportView === 'full' }) }];
        },
    },
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
        if (args.model === undefined) {
            return {
                ok: false,
                ran: false,
                verdict: 'fail',
                verdictReason: 'the tool did not run: pass `model`, a DesignModelV1 with schemaVersion, architecture and the declarations to review it against',
                schema: REPORT_SCHEMAS.design,
                errorCode: 'DESIGN_INPUT',
                error: 'design review needs `model`',
            };
        }
        return runDesignReview(args.model);
    },
});

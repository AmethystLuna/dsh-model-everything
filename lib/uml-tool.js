import { defineTool } from '@deepseek-ai/dsh-tools';
import { createHash } from 'node:crypto';
import { REPORT_SCHEMAS, DEFAULT_HASH_SPEC, valueHash, refusalVerdict, verdictOf, verdictOfFindings } from './engine.js';
import { renderUml, parseUml, parseFindings, reviewUml, explainLabels, checkUmlIntent, UmlError, UML_DIAGRAMS, } from './uml.js';
import { renderReportText } from './report-view.js';
/**
 * The UML front end as four tools, one per job.
 *
 * The split follows the jobs a caller actually has: draw a diagram from a model, read a
 * diagram into a model, audit a diagram or a model, and read the label contract the parser
 * accepts. Bundling them behind one action parameter made every caller read four jobs to
 * find one, and made the tool description a summary of all four.
 *
 * The family list is not written here. It is read from the engine (`UML_DIAGRAMS`), so adding
 * a UML diagram type is a change in the engine and its family module and touches no tool:
 * the schema, the enum and every description follow from the table.
 */
/** Every family the front end knows, in the engine's order. A new family is one edit there. */
const FAMILIES = [...UML_DIAGRAMS];
export const UML_RENDER_TOOL_NAME = 'uml_render';
export const UML_PARSE_TOOL_NAME = 'uml_parse';
export const UML_REVIEW_TOOL_NAME = 'uml_review';
export const UML_LABELS_TOOL_NAME = 'uml_explain_labels';
const reportViewParameter = {
    type: 'string',
    enum: ['digest', 'full'],
    description: 'digest (default) prints the diagram or the report body; full prints the structured result as JSON.',
};
const notationParameter = {
    type: 'string',
    enum: ['auto', 'mermaid', 'plantuml'],
    description: 'Diagram language. Default auto: detected from the text where there is text, mermaid where a model is drawn.',
};
const kindParameter = {
    type: 'string',
    enum: FAMILIES,
    description: 'UML diagram family. Default state. A family the chosen notation cannot express is refused with the reason, never approximated silently.',
};
const intentParameter = {
    type: 'string',
    enum: ['present', 'verify', 'fidelity'],
    description: 'What the artifact is for, declared up front: present = a human will read it; verify = it must be readable as a model by the verification engine; fidelity = the render-and-reparse proof is the point. A view that cannot serve the declared intent is refused before any work, with errorCode UML_INTENT_UNSERVABLE, UML_VIEW_UNREPRESENTABLE or UML_INTENT_MISMATCH. Omit it and nothing changes.',
};
const reportOutput = {
    schema: { type: 'json', description: 'The result: diagram source, a family model, or a modelling review report with findings, round-trip fidelity and next steps.' },
    render(args, value) {
        // A rendered diagram is source text: the body prints it verbatim, once.
        return [{ type: 'text', text: renderReportText(value, { full: args.reportView === 'full' }) }];
    },
};
/** Draw a model as diagram source. */
export const umlRenderTool = defineTool({
    name: UML_RENDER_TOOL_NAME,
    description: 'Render a model as UML diagram source. Takes a LogicModelV1 state machine, or the model of another family (use case, class, object, package, component, deployment), and returns Mermaid or PlantUML text that draws it. Use it to turn a verified machine into a diagram a reader can check, or to produce a diagram someone can edit. It never invents structure the model does not have: a construct the notation cannot carry becomes a warning. PlantUML activity is refused instead of approximated, and a family the notation has no view for is refused with the reason. Declare `intent` to have a view that cannot serve the declared purpose refused before any work.',
    parameters: {
        model: { type: 'json', required: true, description: 'The model to draw: a LogicModelV1 (state machine) or a family model such as a use case or structure model.' },
        notation: notationParameter,
        kind: kindParameter,
        maxSteps: { type: 'integer', description: 'Cap on the sequence trace length when rendering kind=sequence. Default 60.' },
        intent: intentParameter,
        reportView: reportViewParameter,
    },
    output: reportOutput,
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
        try {
            if (args.model === undefined)
                return errorResult('uml_render needs a model: a LogicModelV1 or a family model object');
            const notation = (args.notation === undefined || args.notation === 'auto' ? 'mermaid' : args.notation);
            const result = renderUml(args.model, notation, (args.kind ?? 'state'), args.maxSteps, args.intent);
            return {
                ok: true,
                ran: true,
                ...verdictOf(0, result.warnings.length),
                schema: REPORT_SCHEMAS.umlRender,
                action: 'render',
                notation: result.notation,
                kind: result.diagram,
                diagram: result.primary,
                hashes: { diagram: createHash('sha256').update(result.primary).digest('hex') },
                warnings: result.warnings,
            };
        }
        catch (error) {
            return refusal(error);
        }
    },
});
/** Read diagram text into the model of the family it declares. */
export const umlParseTool = defineTool({
    name: UML_PARSE_TOOL_NAME,
    description: 'Read UML diagram text into a model. Mermaid and PlantUML are both accepted, and the family is detected from the text: a state machine or activity diagram becomes a LogicModelV1 the verification engine can run, while a use case, class, object, package, component or deployment diagram becomes that family model. Read the verdict, not ok: a diagram whose family has no module in this build is refused with errorCode UML_NOT_A_STATE_DIAGRAM, and the refusal names the family it found. A sequence diagram is refused as well, because a trace cannot reconstruct a machine, and so is text that is not a UML diagram at all.',
    parameters: {
        diagram: { type: 'string', required: true, description: 'The UML source text to read.' },
        notation: notationParameter,
        intent: intentParameter,
        reportView: reportViewParameter,
    },
    output: reportOutput,
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
        try {
            if (args.diagram === undefined)
                return errorResult('uml_parse needs diagram text (Mermaid or PlantUML)');
            checkUmlIntent(args.intent, 'parse');
            const result = parseUml(args.diagram, (args.notation ?? 'auto'));
            // The parser notes are the parse verdict: an ignored line is information the model
            // does not carry, so ok: true only ever means the parser ran.
            const findings = parseFindings(result);
            return {
                ok: true,
                ran: true,
                ...parseVerdict(result, findings),
                schema: REPORT_SCHEMAS.umlParse,
                action: 'parse',
                notation: result.notation,
                kind: result.diagram,
                family: result.family,
                model: result.model,
                labels: result.labels,
                findings,
                discardedConstructs: result.discardedConstructs,
                discardedEdges: result.discardedEdges,
                hashes: { hashSpec: DEFAULT_HASH_SPEC, modelHash: valueHash(result.model), diagram: createHash('sha256').update(args.diagram).digest('hex') },
                warnings: result.warnings,
            };
        }
        catch (error) {
            return refusal(error);
        }
    },
});
/** Audit the modelling: the diagram, the model, or the two against each other. */
export const umlReviewTool = defineTool({
    name: UML_REVIEW_TOOL_NAME,
    description: 'Audit UML modelling, and report what a reader would get wrong. Give it a model (is this machine well modelled?), a diagram (what does this diagram actually say?), or both (does the diagram carry the model it is presented with?). It reports structural defects such as unreachable states, dead ends, ambiguous or non-exhaustive branches, isolated nodes and cycles, plus documentation gaps and the fidelity check that re-renders the model and reads it back. Read the verdict, not ok. A family diagram gets its own family checks: use case defects, or the dependency-graph checks for a structure diagram. This audits the modelling; behaviour needs model_verify.',
    parameters: {
        model: { type: 'json', description: 'The model to review: a LogicModelV1 or a family model. Provide it, the diagram, or both.' },
        diagram: { type: 'string', description: 'UML source text to review. Provide it, the model, or both.' },
        notation: notationParameter,
        kind: kindParameter,
        roundTrip: { type: 'boolean', description: 'Render and re-read the model to prove the diagram carries it. Default true.' },
        maxSteps: { type: 'integer', description: 'Cap on the sequence trace used for the fidelity check.' },
        intent: intentParameter,
        reportView: reportViewParameter,
    },
    output: reportOutput,
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
        try {
            if (args.model === undefined && args.diagram === undefined)
                return errorResult('uml_review needs a model, diagram text, or both');
            const report = reviewUml({
                model: args.model,
                diagram: args.diagram,
                notation: (args.notation ?? 'auto'),
                diagramKind: (args.kind ?? 'state'),
                roundTrip: args.roundTrip,
                maxSteps: args.maxSteps,
                intent: args.intent,
            });
            return report;
        }
        catch (error) {
            return refusal(error);
        }
    },
});
/** Print the label and comment contract the parser accepts. */
export const umlExplainLabelsTool = defineTool({
    name: UML_LABELS_TOOL_NAME,
    description: 'Print the label and comment conventions the UML parser accepts, for one notation: the accepted label spellings, the form the renderer writes, the directives that pin what the notation cannot spell, and which lines are ignored. No diagram is needed. Use it when a hand-written diagram reports label drift or ignored lines and the reason is not obvious from the source.',
    parameters: {
        notation: notationParameter,
        reportView: reportViewParameter,
    },
    output: reportOutput,
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
        const notation = (args.notation === undefined || args.notation === 'auto' ? 'mermaid' : args.notation);
        return {
            ok: true,
            ran: true,
            ...verdictOf(0, 0),
            schema: REPORT_SCHEMAS.umlExplainLabels,
            action: 'explain-labels',
            ...explainLabels(notation),
        };
    },
});
/** The parse verdict counts parser notes as findings: an ignored line is information the model does not carry. */
function parseVerdict(result, findings) {
    const errors = findings.filter((finding) => finding.severity === 'error').length;
    const warnings = findings.filter((finding) => finding.severity === 'warning').length + result.warnings.length;
    const firstCode = findings.find((finding) => finding.severity === 'error')?.code ?? findings.find((finding) => finding.severity === 'warning')?.code;
    return verdictOf(errors, warnings, firstCode);
}
/** A front-end refusal travels as a failed result, with the code that says why. */
function refusal(error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResult(message, error instanceof UmlError ? error.code : undefined);
}
function errorResult(message, errorCode = 'UML_INPUT') {
    return { ok: false, ran: false, ...refusalVerdict(message), errorCode, error: message };
}

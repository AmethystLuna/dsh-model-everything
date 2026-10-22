import { defineTool } from '@deepseek-ai/dsh-tools';
import { REPORT_SCHEMAS, DEFAULT_HASH_SPEC, modelHash, refusalVerdict, validateModel, verdictOf } from './engine.js';
import { reportCard, reportResultView } from './presentation.js';
import { ExportError, exportModel } from './exporters.js';
import { renderReportText } from './report-view.js';
/** The model hash of an export's input, when the input validates (the success path always does). */
function exportHashes(model) {
    const validation = validateModel(model);
    return validation.ok
        ? { hashSpec: DEFAULT_HASH_SPEC, modelHash: modelHash(validation.model) }
        : { hashSpec: DEFAULT_HASH_SPEC };
}
export const EXPORT_TOOL_NAME = 'model_export';
/**
 * DSH tool wrapping the external-tool exporters: turn a LogicModelV1 machine into
 * native input for the tool this plugin routes to (UPPAAL / TLA+ / PRISM / SPIN).
 * v1 translates the core machine; unrepresentable invariants become warnings.
 */
export const modelExportTool = defineTool({
    name: EXPORT_TOOL_NAME,
    description: 'Translate a LogicModelV1 into the input language of an external checker - UPPAAL, TLA+, PRISM or SPIN - for a property this plugin does not decide itself (symbolic model checking, unbounded induction, expected reward). format is one of uppaal (.xta + queries), tla (TLC spec + safety property), prism (.pm + .pctl), spin (Promela + ltl). This tool does not verify anything: for the checks it can decide use `model_verify`. Booleans are exported as 0/1 integers; invariants the target cannot express are returned as warnings, never silently dropped. Returns { ok, format, primary, extras?, warnings? } or { ok: false, error } when the model is invalid or the PRISM enumeration is too large.',
    parameters: {
        model: {
            type: 'json',
            required: true,
            description: 'LogicModelV1 state-machine model to export.',
        },
        format: {
            type: 'string',
            required: true,
            enum: ['uppaal', 'tla', 'prism', 'spin'],
            description: 'Target tool format.',
        },
        reportView: {
            type: 'string',
            enum: ['digest', 'full'],
            description: 'digest (default) prints the generated file verbatim; full prints the structured result as JSON.',
        },
    },
    output: {
        schema: {
            type: 'json',
            description: 'Export result with generated file content.',
        },
        render(args, value) {
            return [{ type: 'text', text: renderReportText(value, { full: args.reportView === 'full' }) }];
        },
        // The card a UI shows, separated from the text the model reads.
        presentationMeta(_args, value) {
            return reportCard(value, EXPORT_TOOL_NAME);
        },
    }, presentResult: reportResultView(EXPORT_TOOL_NAME),
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
        try {
            const result = exportModel(args.model, args.format);
            const warnings = result.warnings ?? [];
            const nextSteps = [];
            if (warnings.length > 0)
                nextSteps.push('The target notation cannot express some invariants; the warnings name each one — verify them in the target tool rather than assuming they carried over.');
            nextSteps.push('Run the exported file through its own tool (verify/compile) before trusting the translation; this plugin guarantees the encoding, not the target checker\'s verdict.');
            return {
                ok: true,
                ran: true,
                ...verdictOf(0, warnings.length),
                schema: REPORT_SCHEMAS.export,
                format: result.format,
                primary: result.primary,
                ...(result.extras === undefined ? {} : { extras: result.extras }),
                hashes: exportHashes(args.model),
                warnings,
                nextSteps,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // The exporter's own refusals carry their code: a limit of the encoding is not a defect in the model.
            const errorCode = error instanceof ExportError ? error.code : 'MODEL_INVALID';
            return { ok: false, ran: false, ...refusalVerdict(message), schema: REPORT_SCHEMAS.export, errorCode, error: message };
        }
    },
});

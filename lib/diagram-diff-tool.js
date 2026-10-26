/**
 * The structural diff tool: two drawings, compared by containment.
 *
 * One job per file: this module declares the tool and nothing else, so the documentation generator that walks
 * `*-tool` modules finds it, and so a change to the drawing never touches the reviewing.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { render } from './render/index.js';
import { diffStructure } from './render/diff.js';
export const DIAGRAM_DIFF_TOOL_NAME = 'diagram_diff';
/** Parse one side of a comparison, reporting which side failed to produce a drawing. */
function sideOf(source, notation, which) {
    if (source.trim() === '')
        return { refused: [], problem: which + ' is empty: pass the diagram text for that side' };
    const rendered = render({ source, notation });
    if (rendered.diagram.nodes.length === 0) {
        return { refused: rendered.refused, problem: which + ' produced no nodes (' + String(rendered.refused.length) + ' line(s) refused)' };
    }
    return { diagram: rendered.diagram, refused: rendered.refused };
}
export const diagramDiffTool = defineTool({
    name: DIAGRAM_DIFF_TOOL_NAME,
    description: 'Compare the containment structure of two diagrams: which boundaries are new or gone, which were renamed, which moved inside another, and which nodes changed owner. Accepts the same Mermaid and PlantUML subset as diagram_render. This decides what moved, never whether the move is better - read `verdict`, never `ok`. It does not diff report files (report_diff does) and it does not draw (diagram_render does).',
    parameters: {
        before: {
            type: 'string',
            description: 'The earlier diagram source.',
        },
        after: {
            type: 'string',
            description: 'The later diagram source.',
        },
        notation: {
            type: 'string',
            enum: ['auto', 'mermaid', 'plantuml'],
            description: 'Which notation both sides are written in. Default auto: decided per side from its first meaningful line.',
        },
    },
    output: {
        schema: { type: 'json', description: 'Structural diff: the verdict, every change with the id it is about, and the sizes of both sides.' },
        render(_args, value) {
            const report = value;
            const changes = Array.isArray(report.changes) ? report.changes : [];
            const measured = (report.measured ?? {});
            const lines = [];
            lines.push('dsh-diagram/diff/v1  verdict=' + String(report.verdict) + '  ' + String(changes.length) + ' change(s)');
            lines.push('MEASURED  before=' + String(measured.before?.nodes) + ' node(s)/' + String(measured.before?.groups) + ' group(s)' +
                '  after=' + String(measured.after?.nodes) + ' node(s)/' + String(measured.after?.groups) + ' group(s)');
            for (const change of changes)
                lines.push('  [' + String(change.severity) + '/' + String(change.code) + '] ' + String(change.message));
            if (changes.length === 0)
                lines.push('NEXT  The structure is unchanged. That is all this compares: node text, edges and guards are not part of it.');
            else
                lines.push('NEXT  Read each change against the design intent: a move is a decision, and this tool only reports that it happened.');
            return [{ type: 'text', text: lines.join('\n') }];
        },
    },
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
        const notation = args.notation === 'mermaid' || args.notation === 'plantuml' ? args.notation : 'auto';
        const before = sideOf(typeof args.before === 'string' ? args.before : '', notation, 'before');
        const after = sideOf(typeof args.after === 'string' ? args.after : '', notation, 'after');
        const problems = [before.problem, after.problem].filter((problem) => problem !== undefined);
        if (before.diagram === undefined || after.diagram === undefined) {
            return {
                ok: false,
                verdict: 'fail',
                changes: problems.map((problem) => ({ code: 'D1_SIDE_UNREADABLE', severity: 'error', kind: 'removed', subject: '-', message: problem })),
                measured: {
                    before: { nodes: before.diagram?.nodes.length ?? 0, groups: before.diagram?.groups?.length ?? 0 },
                    after: { nodes: after.diagram?.nodes.length ?? 0, groups: after.diagram?.groups?.length ?? 0 },
                },
            };
        }
        const report = diffStructure(before.diagram, after.diagram);
        return {
            ok: report.verdict !== 'fail',
            verdict: report.verdict,
            changes: report.changes.map((change) => ({
                code: change.code,
                severity: change.severity,
                kind: change.kind,
                subject: change.subject,
                message: change.message,
            })),
            measured: report.measured,
        };
    },
});

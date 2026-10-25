/**
 * The diagram component: one row, one switch, one tool.
 *
 * A separate component rather than a feature of the tools above it, because drawing has nothing to do with
 * verifying. It can be on while the tools are off, off while they are on, and it carries no engine: a
 * deployment that only wants pictures of its Mermaid diagrams installs the same package and leaves the rest
 * of it alone.
 *
 * The switch is `config.enabled`, live, exactly like the routing gate: a deployment can turn the drawing off
 * at boot, from the Plugins page, or by disabling this row, and none of those touches the tools or the
 * skills.
 */
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { render } from './render/index.js';
import { writeSvg } from './render/write.js';
/** The default a deployment inherits: on, because a component nobody knows about is a component nobody uses. */
const DEFAULT_ENABLED = true;
/**
 * A live boolean, or a plain one on a host that predates the live wrapper.
 *
 * `live` is what makes the Plugins page switch take effect without a restart; the value it returns is read
 * through {@link enabledOf} rather than compared, because both shapes have been seen in the wild.
 */
const liveBoolean = z.live;
export const Config = z.object({
    enabled: liveBoolean === undefined
        ? z.boolean().default(DEFAULT_ENABLED)
        : liveBoolean(z.boolean().default(DEFAULT_ENABLED)),
    defaultTitle: z.string().default('diagram'),
});
export const DIAGRAM_TOOL_NAME = 'diagram_render';
export const diagramRenderTool = defineTool({
    name: DIAGRAM_TOOL_NAME,
    description: 'Draw a diagram from its source text and get back SVG. Accepts Mermaid (flowchart, stateDiagram) and PlantUML (component, package, state) for the subset this renderer draws, lays out boxes and arrows itself, and reports every line it refused with its line number instead of drawing half a diagram. Pass `out` to write the SVG next to a document. This tool draws; it does not parse a diagram back into a model, and it does not review one - uml_parse and uml_review do that.',
    parameters: {
        source: {
            type: 'string',
            description: 'The diagram source text, in Mermaid or PlantUML syntax.',
        },
        notation: {
            type: 'string',
            enum: ['auto', 'mermaid', 'plantuml'],
            description: 'Which notation `source` is written in. Default auto: read from the first meaningful line.',
        },
        title: {
            type: 'string',
            description: 'The heading drawn above the diagram. Defaults to the component configuration.',
        },
        scheme: {
            type: 'string',
            enum: ['default', 'high-contrast', 'print'],
            description: 'Colour scheme. Default: the standard light palette. print is greyscale, for a drawing that will be printed or embedded in a plain document.',
        },
        out: {
            type: 'string',
            description: 'Write the SVG here and report the path. Relative paths resolve against the session workspace.',
        },
    },
    output: {
        schema: { type: 'json', description: 'Drawing result: the notation used, the counts, every refused line, and the SVG markup.' },
        render(_args, value) {
            const result = value;
            const lines = [];
            const refused = Array.isArray(result.refused) ? result.refused : [];
            lines.push('dsh-diagram/v1  notation=' + String(result.notation) + '  nodes=' + String(result.nodes) + '  edges=' + String(result.edges) +
                (Number(result.groups) > 0 ? '  groups=' + String(result.groups) : '') +
                (result.path === undefined ? '' : '  written=' + String(result.path)));
            lines.push('CAPTION  ' + String(result.caption));
            if (refused.length > 0) {
                lines.push('');
                lines.push('REFUSED  ' + String(refused.length) + ' line(s) - the drawing covers the rest');
                for (const line of refused)
                    lines.push('  ' + line);
                lines.push('NEXT  Fix or delete the refused lines, or render them in a tool that supports them. The drawing you got does not show them.');
            }
            else {
                lines.push('NEXT  Every line was drawn. Paste the SVG where the diagram belongs, or pass `out` to write it next to the document.');
            }
            return [{ type: 'text', text: lines.join('\n') }];
        },
    },
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
        const source = typeof args.source === 'string' ? args.source : '';
        if (source.trim() === '') {
            // One shape for every answer, so the output contract has nothing to special-case.
            return {
                ok: false,
                notation: 'mermaid',
                nodes: 0,
                edges: 0,
                groups: 0,
                caption: 'no source',
                refused: ['source is empty: pass the diagram text to draw'],
                dropped: 0,
                svg: '',
            };
        }
        const notation = args.notation === 'mermaid' || args.notation === 'plantuml' ? args.notation : 'auto';
        const title = typeof args.title === 'string' && args.title.trim() !== '' ? args.title.trim() : undefined;
        const scheme = args.scheme === 'high-contrast' || args.scheme === 'print' ? args.scheme : 'default';
        const rendered = render({ source, notation, ...(title === undefined ? {} : { title }) }, {}, { scheme });
        const written = typeof args.out === 'string' && args.out.trim() !== ''
            ? writeSvg({ source, notation, ...(title === undefined ? {} : { title }) }, args.out.trim(), {}, { scheme })
            : undefined;
        return {
            ok: rendered.refused.length === 0,
            notation: rendered.notation,
            nodes: rendered.diagram.nodes.length,
            edges: rendered.diagram.edges.length,
            groups: rendered.diagram.groups?.length ?? 0,
            caption: rendered.diagram.caption,
            refused: rendered.refused,
            dropped: rendered.dropped,
            ...(written === undefined ? {} : { path: written.path, bytes: written.bytes }),
            svg: rendered.markup,
        };
    },
});
/** Read the switch as a boolean, whichever shape this host produced. */
export function enabledOf(config) {
    const value = config.enabled;
    return typeof value === 'boolean' ? value : value.get();
}
export function apply(ctx, config) {
    if (!enabledOf(config))
        return;
    ctx.tools.register(diagramRenderTool);
}
export const inject = ['tools'];

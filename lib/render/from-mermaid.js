/**
 * Mermaid text to a diagram, for the subset this renderer can actually draw.
 *
 * The subset is chosen by what a reader of an architecture document writes: a flowchart of boxes and
 * arrows, a state diagram with a start marker, and the group syntax that turns a flat graph into a layered
 * one. Everything outside it is refused **with its line number** rather than half-drawn: a picture that
 * silently drops a lifeline or an interaction is worse than no picture, because it looks complete.
 *
 * Supported:
 *
 * - `graph TD|TB|LR` and `flowchart TD|TB|LR`, with direction carried into the layout as a hint;
 * - node declarations `A[text]`, `A(text)`, `A{text}`, `A((text))`, and a bare `A`;
 * - edges `-->`, `---`, `-.->`, `==>`, with a label as `-->|text|` or `-- text -->`;
 * - `stateDiagram` / `stateDiagram-v2`: `[*] --> A`, `A --> B: event`, `state "text" as id`;
 * - `subgraph name ... end`, which becomes a group;
 * - `%%` comments and blank lines.
 *
 * Refused, by name: `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt`, `pie`, `journey`, `mindmap`,
 * `timeline`, `quadrantChart`, `gitGraph`, `C4Context`, and `click`/`style`/`classDef` directives.
 */
import { emptyDiagram } from './model.js';
const CURVED_EDGE = /^(.+?)\s*(-->|---|-\.->|==>)\s*(?:\|([^|]*)\|\s*)?(.+)$/;
const LABELLED_EDGE = /^(.+?)\s*--\s*([^->]+?)\s*-->\s*(.+)$/;
const NODE = /^([A-Za-z_][\w-]*)\s*(?:\[\((.*)\)\]|\[\[(.*)\]\]|\[(.*)\]|\((.*)\)|\{(.*)\}|<<(.*)>>)?$/;
const TRANSITION = /^([A-Za-z_][\w-]*|\[\*\])\s*-->\s*([A-Za-z_][\w-]*|\[\*\])\s*(?::\s*(.*))?$/;
const STATE_ALIAS = /^state\s+["'](.+?)["']\s+as\s+([A-Za-z_][\w-]*)$/;
const DIRECTIVE = /^(click|style|classDef|class|linkStyle|accTitle|accDescr)\b/;
const UNSUPPORTED = new Set([
    'sequencediagram',
    'classdiagram',
    'erdiagram',
    'gantt',
    'pie',
    'journey',
    'mindmap',
    'timeline',
    'quadrantchart',
    'gitgraph',
    'c4context',
    'requirementdiagram',
    'sankey-beta',
]);
function ensure(builder, id, label) {
    const existing = builder.nodes.get(id);
    if (existing === undefined) {
        builder.nodes.set(id, { id, role: 'normal', ...(label === undefined ? {} : { label }) });
        // Membership is decided where the node is first written: the innermost open boundary. Naming it again
        // later from an outer boundary does not move it - the outer boundary holds it through `parent`.
        const innermost = builder.open[builder.open.length - 1];
        if (innermost !== undefined && !innermost.members.includes(id))
            innermost.members.push(id);
        return;
    }
    if (label !== undefined && (existing.label === undefined || existing.label === ''))
        existing.label = label;
}
function nodeFrom(token) {
    const match = NODE.exec(token.trim());
    if (match === null)
        return undefined;
    const id = match[1];
    const label = [match[2], match[3], match[4], match[5], match[6], match[7]].find((value) => value !== undefined && value.trim() !== '');
    return { id, ...(label === undefined ? {} : { label: label.trim().replace(/^["']|["']$/g, '') }) };
}
export function fromMermaid(source, title = 'mermaid') {
    const lines = source.split(/\r?\n/);
    const refused = [];
    const builder = { nodes: new Map(), edges: [], groups: [], open: [] };
    let mode = 'none';
    let startId;
    let endCount = 0;
    const push = (edge) => {
        builder.edges.push(edge);
    };
    lines.forEach((raw, index) => {
        const line = raw.replace(/%%(.*)$/, '').trim();
        if (line === '')
            return;
        const where = 'line ' + String(index + 1) + ': ';
        const lower = line.toLowerCase();
        const keyword = lower.split(/[\s{}]/)[0] ?? '';
        if (UNSUPPORTED.has(keyword)) {
            refused.push(where + '`' + keyword + '` is not a diagram this renderer draws');
            return;
        }
        if (DIRECTIVE.test(line)) {
            refused.push(where + '`' + (line.split(/\s/)[0] ?? '') + '` is a directive this renderer ignores');
            return;
        }
        if (/^(graph|flowchart)\b/.test(lower)) {
            mode = 'graph';
            return;
        }
        if (/^statediagram(-v2)?\b/.test(lower)) {
            mode = 'state';
            return;
        }
        if (/^subgraph\b/.test(lower)) {
            const label = line.replace(/^subgraph\b/i, '').trim().replace(/^["']|["']$/g, '');
            const id = 'subgraph-' + String(++endCount);
            builder.open.push({ id, label: label === '' ? id : label, members: [] });
            return;
        }
        if (lower === 'end') {
            const closed = builder.open.pop();
            if (closed !== undefined) {
                const container = builder.open[builder.open.length - 1];
                if (container !== undefined)
                    closed.parent = container.id;
                builder.groups.push(closed);
            }
            return;
        }
        if (mode === 'state') {
            const alias = STATE_ALIAS.exec(line);
            if (alias !== null) {
                ensure(builder, alias[2], alias[1]);
                return;
            }
            const transition = TRANSITION.exec(line);
            if (transition === null) {
                // A bare `state X` declaration, or a state named on its own line.
                const bare = /^state\s+([A-Za-z_][\w-]*)$/.exec(line);
                if (bare !== null) {
                    ensure(builder, bare[1]);
                    return;
                }
                if (/^[A-Za-z_][\w-]*$/.test(line)) {
                    ensure(builder, line);
                    return;
                }
                refused.push(where + '`' + line + '` is not a state transition this renderer draws');
                return;
            }
            const from = transition[1];
            const to = transition[2];
            const label = (transition[3] ?? '').trim();
            if (from === '[*]') {
                // A start marker names the state it enters, not a box of its own.
                ensure(builder, to);
                if (startId === undefined)
                    startId = to;
                return;
            }
            if (to === '[*]') {
                ensure(builder, from);
                push({ from, to: from, label: label === '' ? 'end' : label, dashed: true });
                return;
            }
            ensure(builder, from);
            ensure(builder, to);
            push({ from, to, label });
            return;
        }
        const labelled = LABELLED_EDGE.exec(line);
        if (labelled !== null) {
            const left = nodeFrom(labelled[1]);
            const right = nodeFrom(labelled[3]);
            if (left === undefined || right === undefined) {
                refused.push(where + '`' + line + '` does not name two nodes');
                return;
            }
            ensure(builder, left.id, left.label);
            ensure(builder, right.id, right.label);
            push({ from: left.id, to: right.id, label: labelled[2].trim() });
            return;
        }
        const edge = CURVED_EDGE.exec(line);
        if (edge !== null) {
            const left = nodeFrom(edge[1]);
            const right = nodeFrom(edge[4]);
            if (left === undefined || right === undefined) {
                refused.push(where + '`' + line + '` does not name two nodes');
                return;
            }
            ensure(builder, left.id, left.label);
            ensure(builder, right.id, right.label);
            push({
                from: left.id,
                to: right.id,
                label: (edge[3] ?? '').trim(),
                ...(edge[2] === '-.->' || edge[2] === '==>' ? { dashed: true } : {}),
            });
            return;
        }
        const single = nodeFrom(line);
        if (single !== undefined) {
            ensure(builder, single.id, single.label);
            return;
        }
        refused.push(where + '`' + line + '` is not something this renderer draws');
    });
    if (mode === 'none') {
        return { diagram: emptyDiagram(title, 'no mermaid diagram found'), refused };
    }
    if (builder.nodes.size === 0) {
        return { diagram: emptyDiagram(title, 'no nodes found'), refused };
    }
    const diagram = {
        kind: mode === 'state' ? 'machine' : 'graph',
        title,
        ...(startId === undefined ? {} : { init: startId }),
        nodes: [...builder.nodes.values()],
        edges: builder.edges,
        ...(builder.groups.length === 0 ? {} : { groups: builder.groups }),
        caption: mode + ', ' + String(builder.nodes.size) + ' box' + (builder.nodes.size === 1 ? '' : 'es') + ', ' +
            String(builder.edges.length) + ' arrow' + (builder.edges.length === 1 ? '' : 's') +
            (refused.length === 0 ? '' : ', ' + String(refused.length) + ' line(s) refused'),
    };
    return { diagram, refused };
}

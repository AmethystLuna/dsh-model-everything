/**
 * What a tool card shows, reduced to a drawing.
 *
 * The input is what the host hands a settled tool view: the arguments that were sent and the result that
 * came back. Neither is trusted - a view runs during streaming too, when the result does not exist yet -
 * so every field is read defensively and an absent one removes a shape rather than throwing.
 *
 * Pure. Everything decided here is a fact a test can assert: which nodes exist, which edges, why they are
 * coloured the way they are.
 */
const record = (value) => typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
const array = (value) => (Array.isArray(value) ? value : []);
const text = (value) => (typeof value === 'string' && value !== '' ? value : undefined);
/** A short caption: the verdict, and the first thing that went wrong when there is one. */
function captionOf(report) {
    if (report === undefined)
        return 'no report yet';
    const verdict = text(report.verdict) ?? 'unknown';
    const findings = array(report.findings).map(record).filter((entry) => entry !== undefined);
    const first = findings.find((finding) => finding.severity === 'error');
    if (first !== undefined) {
        const code = text(first.code) ?? 'error';
        const message = text(first.message) ?? '';
        return verdict + ' — ' + code + (message === '' ? '' : ': ' + message);
    }
    const summary = record(report.summary);
    const errors = typeof summary?.errors === 'number' ? summary.errors : undefined;
    return errors === undefined ? verdict : verdict + ' — ' + String(errors) + ' error(s)';
}
/** The states of a `model_verify` argument: a model, or a refused call that carried none. */
function machineOf(args) {
    const model = record(args?.model);
    if (model === undefined)
        return undefined;
    const states = array(model.states).map(record).filter((entry) => entry !== undefined && typeof entry.id === 'string');
    if (states.length === 0)
        return undefined;
    const edges = array(model.transitions)
        .map(record)
        .filter((entry) => entry !== undefined && typeof entry.from === 'string' && typeof entry.to === 'string')
        .map((entry) => ({ from: String(entry.from), to: String(entry.to), label: text(entry.event) ?? '' }));
    return {
        nodes: states.map((state) => ({ id: String(state.id), role: 'normal' })),
        edges,
        ...(typeof model.init === 'string' ? { init: model.init } : {}),
    };
}
/**
 * Which nodes the report blames.
 *
 * A finding names a state in its `message` or its `detail` as `"state \"x\""`; matching that is a
 * heuristic, so it only ever *adds* emphasis and never decides the verdict.
 */
function blame(nodes, report) {
    if (report === undefined)
        return nodes;
    const findings = array(report.findings).map(record).filter((entry) => entry !== undefined);
    if (findings.length === 0)
        return nodes;
    const named = new Set();
    for (const finding of findings) {
        for (const field of ['message', 'detail']) {
            const value = text(finding[field]);
            if (value === undefined)
                continue;
            for (const node of nodes) {
                if (value.includes('"' + node.id + '"'))
                    named.add(node.id);
            }
        }
    }
    if (named.size === 0)
        return nodes;
    const severity = findings.some((finding) => finding.severity === 'error') ? 'error' : 'warning';
    return nodes.map((node) => (named.has(node.id) ? { ...node, role: severity } : node));
}
export function viewModel(input) {
    const toolName = text(input.toolName) ?? 'tool';
    const args = record(input.args);
    const report = record(input.result);
    const caption = captionOf(report);
    const machine = machineOf(args);
    if (machine === undefined) {
        return { kind: 'none', title: toolName, nodes: [], edges: [], caption };
    }
    return {
        kind: 'machine',
        title: toolName,
        ...(machine.init === undefined ? {} : { init: machine.init }),
        nodes: blame(machine.nodes, report),
        edges: machine.edges,
        caption,
    };
}

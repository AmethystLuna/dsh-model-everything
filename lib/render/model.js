/**
 * The diagram a renderer draws, in the notation it came from being nobody's business.
 *
 * Every source - a verification report, a Mermaid file, a PlantUML component diagram, a dependency scan -
 * is reduced to this one shape before anything is laid out. A renderer that understood notations would have
 * to be changed for each of them; a renderer that understands this does not.
 *
 * Pure data, no functions: a model can be serialised, compared and asserted.
 */
/** An empty drawing, for a source that produced no nodes. */
export function emptyDiagram(title, caption) {
    return { kind: 'none', title, nodes: [], edges: [], caption };
}
/** The label to draw for a node: its own label when the notation gave one, else its id. */
export function labelOf(node) {
    return node.label !== undefined && node.label !== '' ? node.label : node.id;
}

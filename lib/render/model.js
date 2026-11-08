/**
 * Thx diagram a renderer draws, in the notation it came from being nobody's business.
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
/**
 * What an empty drawing says about itself.
 *
 * `no nodes found` is right for an empty source and wrong for one whose every line was refused: the reader
 * then looks for a fault in an input that was written, not empty. The refused count is the difference, and
 * it is already computed by the time this is asked.
 */
export function emptyCaption(refused) {
    return refused === 0 ? 'no nodes found' : 'nothing drawable: ' + String(refused) + ' line(s) refused';
}
/**
 * The caption of a drawing that came out empty.
 *
 * A source with nothing in it is not a source whose lines were refused, even though both answer with a refusal now: the reader
 * needs to know which of the two happened.
 */
export function emptyCaptionOf(refused) {
    if (refused.length === 1 && refused[0].startsWith('the source has no diagram'))
        return 'no nodes found';
    return emptyCaption(refused.length);
}
/** The label to draw for a node: its own label when the notation gave one, else its id. */
export function labelOf(node) {
    return node.label !== undefined && node.label !== '' ? node.label : node.id;
}

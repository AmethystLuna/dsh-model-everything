/**
 * The graph the layout stages agree on, and the order they start from.
 *
 * A layout stage has no business knowing what a diagram is: it sees boxes with a size and edges
 * between them. That is what `LayoutGraph` is, and it is the whole vocabulary the pipeline shares -
 * cycle breaking reads it, layering writes layers, ordering and coordinate assignment read those.
 *
 * `rankStates` stays: it is the breadth-first order a source's own reading suggests, and it seeds
 * the ordering stage with the discovery order instead of whatever order the parser happened to
 * collect. It no longer decides which row a state is in - `layer.ts` does that now - so the rows it
 * returns are only a first guess at the left-to-right order.
 *
 * Pure, and asserted on the answer itself.
 */
import type { DiagramEdge, DiagramNode } from './model.js';
/** A box to place: an id, and the space its text needs. */
export interface LayoutNode {
    id: string;
    width: number;
    height: number;
}
/** An edge to draw: which two boxes it joins, and which diagram edge it came from. */
export interface LayoutEdge {
    /** The index in the diagram's own edge list, so the drawing can report a lane back for it. */
    index: number;
    from: string;
    to: string;
}
/** One level of a nested drawing: what is placed together in a single pass of the pipeline. */
export interface LayoutGraph {
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    /** The box that must stay on layer zero, when the source named one. */
    init?: string;
}
export interface Ranked {
    /** The state ids of each row, top to bottom, already ordered left to right. */
    rows: string[][];
    /** States no edge reaches from the initial one. */
    unreachable: string[];
}
export declare function rankStates(nodes: ReadonlyArray<{
    id: string;
}>, edges: ReadonlyArray<{
    from: string;
    to: string;
}>, init: string | undefined): Ranked;
/**
 * The left-to-right seed the ordering stage starts from.
 *
 * Breadth-first discovery is what a reader expects a drawing to follow, so it is a better first
 * guess than the order the parser collected. A state nothing reaches has no discovery order and
 * keeps the order it was written in, after everything that was reached.
 */
export declare function seedOrder(graph: LayoutGraph): Map<string, number>;
/** Re-exported so a stage module can name the diagram shape without importing the model itself. */
export type DiagramNodeLike = Pick<DiagramNode, 'id'>;
export type DiagramEdgeLike = Pick<DiagramEdge, 'from' | 'to'>;

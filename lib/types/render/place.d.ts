/**
 * Where the boxes go.
 *
 * The drawing is placed by the layered pipeline, in the order the mature implementations run it: cycle breaking turns
 * the graph into a DAG, layering gives every box a row, dummy nodes give every long edge a lane, ordering reduces the
 * crossings, and coordinate assignment decides the x of each lane and box. This module composes those stages; it does
 * not decide any of them itself. Each stage is a pure module next door, so it can be asserted without a canvas.
 *
 * Two decompositions sit around the pipeline. A level - the top of the drawing, or the inside of a boundary - is
 * split into weakly connected components, each laid out on its own and then packed onto the page, so a wide
 * subgraph cannot squeeze an unrelated one. A boundary is a node in its parent's layer whose size is whatever its
 * contents need, and its inside is laid out by the same pipeline; that is how nesting is drawn.
 *
 * What comes out is geometry only: a box per node, a rectangle per boundary, and - for a long edge - the lane its
 * dummies reserved, so the painter can draw one polyline through it instead of searching around the boxes.
 */
import { type Measured as TextBox } from './text.js';
import type { Diagram, DiagramNode } from './model.js';
/** Geometry of one placed box, before anything is drawn. */
export type Box = {
    x: number;
    y: number;
    width: number;
    height: number;
};
/** A point in the drawing's own coordinates. */
export interface Point {
    x: number;
    y: number;
}
/** The lane a long edge's dummies reserved, in layout order: from the layout source down to the layout target. */
export interface Lane {
    /** One point per gap the edge crosses, at the lane's own x: it keeps its own order, and the painter walks it. */
    points: Point[];
    /** True when the layout runs opposite to the source's arrow, so the painter walks the lane backwards. */
    reversed: boolean;
}
/** What a placement returns: every box, every drawn boundary, every reserved lane, and how wide the content is. */
export interface Placement {
    boxes: Map<string, Box>;
    groupRects: Map<string, Box>;
    width: number;
    lanes: Map<number, Lane>;
    /**
     * The height of the one horizontal run an edge between two adjacent rows needs.
     *
     * A run is measured between two rows of the level that produced it. When a row is a boundary, that strip is the space
     * outside the boundary while the painter draws the boxes inside it, so the run is a proposal rather than a fact: the
     * painter clears it against every box and hands the edge to the router when a leg would cross one.
     */
    runs: Map<number, number>; /** Edges whose two ends ended up in different wrapped columns: they are read across, not down. */
    across: Set<number>;
}
/** Geometry constants in one place: a container with different proportions changes these, not the rules. */
export declare const MARGIN = 20;
/** The text a node will draw, measured from its label - the id is what the source called it, not what it says. */
export declare function textOf(node: DiagramNode): TextBox;
export declare function place(diagram: Diagram, top: number): Placement;
/** The aspect ratio of a placement, for the tests that check a drawing is a page and not a strip. */
export declare function placementAspect(placement: Placement): number;

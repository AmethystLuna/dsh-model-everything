/**
 * Layering: which row each box is in.
 *
 * The graph is acyclic by the time it gets here. A layered drawing needs every edge to span at least one layer, so it
 * always travels downwards, and it wants the total of the layers every edge spans beyond one to be as small as
 * possible: those are the edges that have to be drawn through a row of placeholders instead of going straight down a
 * gap.
 *
 * Longest paths are the first guess: every source on the top row, every other node one layer below its latest
 * predecessor. It is feasible and it is not optimal, because it puts every node as high as it can go - a node whose
 * edges leave it with slack above the boxes it points at is a node that could have moved down and shortened them.
 * `network-simplex.ts` solves the program the mature layering implementations solve: the ranking that minimises the
 * total length, found by exchanging edges in a tight tree until no exchange is left that shortens it.
 *
 * The initial state is layer zero. It is a node with no predecessor - cycle breaking has turned around every edge
 * that ran into it - so a source, and every source is a candidate for the top row. The pin is passed to the solver as
 * a constraint, so the search never trades it away: an initial state that moved down the page would be a machine
 * diagram read from the wrong end.
 *
 * Pure: the graph in, one layer per node out.
 */
import type { LayoutEdge, LayoutGraph } from './layout.js';
export interface Layering {
    /** The ids of each layer, top to bottom. A layer holds at least one node. */
    layers: string[][];
    layerOf: Map<string, number>;
}
export declare function layer(graph: LayoutGraph, edges: LayoutEdge[]): Layering;

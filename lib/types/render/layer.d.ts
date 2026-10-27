/**
 * Layering: which row each box is in.
 *
 * The graph is acyclic by the time it gets here. Longest-path layering puts every source in layer zero and every
 * other node one layer below its latest predecessor, which gives what a layered drawing needs: every edge spans at
 * least one layer, so it always travels downwards.
 *
 * Longest paths alone, though, leave a free source stranded at the top of the page when everything it points at is
 * deep in the drawing - its edges then span several layers for no reason. The tight-tree pass fixes that: a node with
 * no predecessors can sit anywhere above its earliest successor, so it is moved down until one of its edges is tight
 * (spans exactly one layer). That is the shortening a tight tree buys, and it is the case a longest-path layering can
 * still improve without moving a node that another edge has already pinned.
 *
 * The initial state is layer zero and is never moved: the pass skips it.
 *
 * Pure: the graph in, one layer per node out.
 */
import type { LayoutEdge, LayoutGraph } from './layout.js';
export interface Layering {
    /** The ids of each layer, top to bottom. A layer holds at least one node. */
    layers: string[][];
    layerOf: Map<string, number>;
}
/**
 * Layer one weakly connected component.
 *
 * The caller splits the drawing into components first (`components.ts`) because each one gets its own layers; a
 * graph handed in here is expected to be connected, and a disconnected one still layers correctly, it just shares
 * layer zero between the pieces.
 */
export declare function layer(graph: LayoutGraph, edges: LayoutEdge[]): Layering;

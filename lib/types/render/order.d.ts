/**
 * Ordering: the left-to-right order of each layer.
 *
 * The layer a box is in is fixed by now; the only freedom left is the order inside each layer, and that order decides
 * how many edges cross. A crossing is counted on a pair of adjacent layers: two edges between the same two layers
 * cross when their end points are in opposite order on the top and the bottom.
 *
 * The method is the one every layered layout uses. A median sweep takes each layer in turn and sorts it by the median
 * position of its neighbours in the layer just visited - down the drawing, then up. A down sweep alone settles each
 * layer against the one above it and can be undone by the next; alternating is what makes the passes converge.
 *
 * The median is a good guess, not a search. Greedy switch is the search: try swapping two neighbours in a layer, keep
 * the swap if the total crossing count falls, and stop when a whole pass finds nothing. That is where a crossing the
 * median cannot see gets removed.
 *
 * Pure: layers of ids in, layers of ids out, plus the crossing count that justified them.
 */
import type { Chain } from './dummy.js';
export interface Ordered {
    /** The same layers, each in its final order. */
    layers: string[][];
    /** The number of crossings between adjacent layers left by the ordering. */
    crossings: number;
}
/** How many pairs of edges between adjacent layers cross. */
export declare function countCrossings(layers: string[][], chains: Chain[]): number;
export declare function order(seedLayers: string[][], chains: Chain[], seed?: Map<string, number>): Ordered;

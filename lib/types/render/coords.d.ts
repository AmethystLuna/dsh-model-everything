/**
 * Coordinate assignment: how far right each box sits. Brandes-Kopf.
 *
 * The layers are rows and the order inside them is settled; the only freedom left is the x of each box. Three
 * properties make a drawing readable:
 *
 * - A box sits over what it is connected to, and a chain of boxes sits on one vertical line. Brandes and Kopf get
 *   this by *aligning*: every box is offered the median of its neighbours in the layer just above (or just below) and
 *   is joined to that neighbour's block when the join crosses no other edge. A block is then one node of a smaller
 *   graph, and a box that aligned downwards through five rows comes out as one straight segment.
 * - Nothing overlaps, and the empty strip between two boxes in a row is the same everywhere. The blocks are compacted
 *   against each other by the least distance their rows allow, which is a longest path over the block graph: a block
 *   sits as far left as the block to its left permits, and no further.
 * - The drawing is balanced rather than packed to one side. Aligning downwards alone would lean everything left, so
 *   the same two passes are run from the bottom up, and each pair is run once more mirrored left to right. The four
 *   layouts are then averaged. Averaging is a convex combination, and the separation constraints are linear, so the
 *   average of four layouts that keep the boxes apart also keeps them apart - the balance is free of overlaps by
 *   construction. A pass that starts at the top and one that starts at the bottom compact their blocks from opposite
 *   ends, so each side is first slid onto the origin of the first pass of that side, and only then averaged.
 *
 * Three things this module owes the rest of the pipeline rather than the paper:
 *
 * - A long edge's dummies share one x. They are one lane, not one point per row, so each lane is collapsed to the mean
 *   of the x its two ends want - the straight drop a reader follows. Collapsing can put a lane where a box already is,
 *   so the last pass spends the lane's space: boxes are pushed right past it and never the other way, and a row keeps
 *   the width its placeholders were given, which is the width a corridor needs when the lane has to go around a box.
 *   The lane is a proposal either way - the channel stage moves a lane into a free corridor when routing needs it, and
 *   a box never moves for a lane.
 * - A lane is not a neighbour to be aligned with. A box that aligned itself to a lane passing through its row would be
 *   pulled off the boxes it does connect to, which is how a decision with one long edge comes out as a staircase. Lanes
 *   are placed by the compaction and then by the channel stage, which is where a lane belongs.
 * - The empty strip between two rows is the caller's, not this module's: the y of a row is a running sum with one gap.
 *
 * Pure: layers and chains in, coordinates out.
 */
import type { Chain } from './dummy.js';
export interface Sized {
    width: number;
    height: number;
}
export interface CoordInput {
    layers: string[][];
    chains: Chain[];
    sizeOf: (id: string) => Sized;
    /** A dummy instance, and the shared lane it belongs to. */
    chainOf: ReadonlyMap<string, string>;
}
export interface CoordOptions {
    /** The empty space between two side-by-side boxes. */
    gap: number;
    /** The empty strip between two layers. */
    layerGap: number;
}
export interface Coordinates {
    /** Centre x, keyed by node id and by lane id. A long edge's dummies share one entry. */
    x: Map<string, number>;
    /** The top y of each layer. */
    layerY: number[];
    layerHeight: number[];
    layerWidth: number[];
    width: number;
    height: number;
}
export declare function assignCoordinates(input: CoordInput, options: CoordOptions): Coordinates;

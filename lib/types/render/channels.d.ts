/**
 * Channel assignment: where the vertical lanes and the horizontal runs between two rows go.
 *
 * The stages before this one decide where the boxes are, and the painter decides what a box looks like. What is left
 * is the space between two rows, and an edge that decides that space alone will collide with the next one: every long
 * edge has to cross a row somewhere, and every edge whose two ends are not vertically aligned needs one horizontal run
 * inside the gap it crosses. Chosen independently, two runs land on one height and read as a junction, and a run
 * sweeps across a vertical another edge is already using.
 *
 * So this stage assigns both, after the boxes have settled and before anything is drawn:
 *
 * - **A lane's x.** A long edge owns one vertical lane through the rows it crosses. The x is a position no box
 *   occupies in any of those rows, and lanes keep the order their dummies have in the ordering, so two lanes never
 *   share an x inside one gap. Alignment is worth a detour: a lane that lands inside a box's own port span turns a
 *   four-bend staircase into a straight drop, so alignment comes before distance from the proposed position.
 * - **A run's y.** The horizontal runs inside one gap are stacked at distinct heights - Graphviz's virtual nodes - so
 *   two runs never lie on one line, and a nested run stays near the box it leaves.
 *
 * Pure: rows, chains and coordinates in; lane positions and run heights out.
 */
import type { Chain } from './dummy.js';
/** A box, as far as routing is concerned: only a box can move a lane. */
export interface ChannelBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface ChannelInput {
    /** The ordered rows, dummies included: a lane keeps its dummy's order. */
    layers: string[][];
    /** Every edge's chain, from the layout source to the layout target. */
    chains: Chain[];
    /** A dummy instance, and the lane it belongs to. */
    chainOf: ReadonlyMap<string, string>;
    /** The boxes that block a lane. A dummy has none. */
    boxes: ReadonlyMap<string, ChannelBox>;
    /** The top of each row, and how tall it is. */
    layerY: number[];
    layerHeight: number[];
    /** What coordinate assignment proposed for each lane. */
    laneX: ReadonlyMap<string, number>;
}
export interface ChannelOptions {
    /** The empty strip between two rows. */
    gap: number;
    /** How far a lane stays from a box in a row it crosses. */
    clearance: number;
    /** The narrowest two lanes sharing a gap may be. */
    spacing: number;
}
/** One long edge's lane: the x of its vertical run, and the height of a run in each gap it crosses. */
export interface LaneChannel {
    x: number;
    y: number[];
}
export interface ChannelPlan {
    /** By diagram edge index: the lane a long edge reserved, with one corridor height per gap it crosses. */
    lanes: Map<number, LaneChannel>;
    /** By diagram edge index: the height of the one run an edge between two adjacent rows needs. */
    runs: Map<number, number>;
}
/** How far a port sits from a box's corner. The painter places ports from this same number. */
export declare const PORT_INSET = 10;
export declare function assignChannels(input: ChannelInput, options: ChannelOptions): ChannelPlan;

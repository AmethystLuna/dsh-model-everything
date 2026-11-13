/**
 * Moving a run that hugs a box into the middle of the channel it runs down.
 *
 * The renderer's guarantee is that a route never crosses a box. It says nothing about running half a pixel beside one, and a line
 * that grazes a border reads as if it touched it. This module is the arithmetic of the repair: for one interior run of a polyline,
 * how far to move it, and what the moved polyline is.
 *
 * The decision about what a box is and whether the moved line is free stays with the painter: this module knows rectangles as
 * numbers and nothing else.
 */
/** How close a line may run to a box it does not end at. */
export declare const CLEARANCE = 6;
/** The closest a run has to be to something before it is worth moving. */
export declare const HUG = 3;
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface Run {
    /** Index of the first point of the run in the polyline. */
    index: number;
    /** `x` for a vertical run (it sits at one x), `y` for a horizontal one. */
    axis: 'x' | 'y';
    /** The coordinate the run sits at. */
    at: number;
    /** Its extent along the other axis. */
    lo: number;
    hi: number;
}
/** The interior runs of a polyline: every one with a neighbour on both sides, so moving it keeps the path connected. */
export declare function interiorRuns(points: readonly {
    x: number;
    y: number;
}[]): Run[];
/**
 * Where the run should sit instead, or `undefined` when it is not hugging anything.
 *
 * A run within `HUG` of a box's edge is moved `CLEARANCE` away from that edge. Nothing is centred between two boxes: the case that
 * produced this module was a line a half pixel from one box's border, and a rule for the corridor's middle never fired on any
 * drawing here - an unused branch in a layout pass is a branch that will drift.
 */
export declare function channelTarget(run: Run, rects: readonly Rect[]): number | undefined;
/** The polyline with the run at `target`; the two points of the run move, their neighbours stretch. */
export declare function movedRun(points: readonly {
    x: number;
    y: number;
}[], run: Run, target: number): {
    x: number;
    y: number;
}[];

/**
 * Reading a drawing for the defect of two routes drawn as one line.
 *
 * A route is a sequence of axis-aligned pieces. Two pieces on the same line, or within a few points of each other,
 * overlap for the length they share, and that length is what a reader loses: the eye follows one line with two heads.
 * Everything here is arithmetic on pieces, which is why it is apart from the painter: the drawing's worth of routes comes
 * in, a number comes out, and a test can hand it two polylines without a canvas.
 */
import type { Point } from './place.js';
/** One straight run of a route: the axis it runs along, where on the other axis, and the span it covers. */
export interface Piece {
    /** `y` for a horizontal run (it sits at one y), `x` for a vertical one. */
    axis: 'x' | 'y';
    /** The coordinate the run sits at on the other axis. */
    at: number;
    lo: number;
    hi: number;
    /** Which leg of the route this is, so a move can be applied back to the points. */
    slot: number;
}
/** Two pieces this far apart read as one line: closer than the eye separates them at a corner. */
export declare const NEAR_LINE = 5;
/** Every axis-aligned piece of one route. A diagonal leg contributes nothing: it is not a line to be read as another. */
export declare function piecesFrom(points: readonly Point[]): Piece[];
/** The length one route shares with every other, which is half of what those pairs contribute to the drawing. */
export declare function sharedWith(all: readonly Piece[][], index: number): number;
/** The whole drawing's shared length: each pair once, from the lower index. */
export declare function sharedLength(all: readonly Piece[][]): number;
/** The same total from the rows, which is what a caller keeps while it tries moves. */
export declare function totalFromRows(rows: readonly number[]): number;

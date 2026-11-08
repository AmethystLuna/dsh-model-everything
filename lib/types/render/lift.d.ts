/**
 * Lifting the short stub that ends a route.
 *
 * A route arrives at a port along a leg. When the layout packs two edges into one gap that leg can end up shorter than the
 * arrowhead needs, and a reader sees a ledge rather than an approach. The fix is to move the line before it far enough back
 * that the arrival is a whole stub again - but only when the line it makes is free, which is why the caller answers two
 * questions and this module decides the length.
 *
 * Pure arithmetic on one route: the painter owns the boxes and the other routes, so neither is here.
 */
import type { Point } from './place.js';
/** The shortest arrival a reader reads as an approach rather than as a ledge. */
export declare const WHOLE_STUB = 16;
/** The lengths to try, longest first: a shorter one is better than a ledge, and none is better than a crossing. */
export declare const STUB_LADDER: readonly [16, 12, 10, 8];
export interface Tail {
    /** True when the leg into the box runs vertically, which is a top or bottom side. */
    down: boolean;
    /** The point the leg ends at: the port. */
    tail: Point;
    /** The corner the leg starts from. */
    corner: Point;
    /** The point before the corner, which the lifted line has to leave alone. */
    head: Point;
    /** How far the leg runs as it stands. */
    along: number;
}
/** The last leg of a route, or `undefined` when the route is too short to have one. */
export declare function tailOf(points: readonly Point[]): Tail | undefined;
/**
 * The length the arrival should have, or `undefined` when none of the ladder is free.
 *
 * `free` answers whether the line a given length would make is allowed: clear of every box it does not end at, and clear of
 * every other route by the near line.
 */
export declare function liftedSpan(points: readonly Point[], free: (line: readonly Point[], span: number) => boolean): number | undefined;
/** Apply a lift in place: the corner and the point before it both move onto the lifted line. */
export declare function applyLift(points: Point[], span: number): boolean;

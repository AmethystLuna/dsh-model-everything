/**
 * Orthogonal edge routing around boxes.
 *
 * A straight line between two boxes is right until a third box sits between them; then it is a line drawn through a
 * component, which reads as a connection that is not there. Graphviz solves this by routing along a visibility
 * graph and then fitting splines; ELK, yFiles and mxGraph build a *sparse* grid from the boxes' own edges and run
 * A* over it with a bend penalty. Sparse is the whole trick: a pixel grid is O(pixels²), while the candidate lines
 * are the coordinate of every box edge plus a margin - O(boxes) per axis.
 *
 * So this module does exactly that, in the two steps those routers use:
 *
 * 1. **Candidate lines.** Every box contributes four: one lane just outside each side. Together with the anchor
 *    coordinates they form the grid a route may travel on.
 * 2. **A* with bends.** Moving along a candidate line costs its length; changing direction costs extra, because a
 *    route that zig-zags to save three points is harder to follow than one that goes around.
 *
 * A route is only computed for an edge that needs it: the cheap straight segment is tried first, and routing is the
 * fallback. That keeps the common case - a box directly above another - at two points and no search.
 */
import type { Point } from './paint.js';
/** A rectangle an edge may not cross. */
export interface Obstacle {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** The four sides a route may leave a box from. */
export type Side = 'top' | 'bottom' | 'left' | 'right';
/** The outward normal of a side: the direction an edge leaves along. */
export declare function normalOf(side: Side): Point;
/** A segment crossing a box at all, with a little slack so a route does not shave a corner. */
export declare function crossesBox(x1: number, y1: number, x2: number, y2: number, box: Obstacle): boolean;
/** The point on a side of a box, in the middle of that side. */
export declare function anchor(box: Obstacle, side: Side): Point;
/** Which side of `from` faces `to`, and which side of `to` faces `from`. */
export declare function facingSides(from: Obstacle, to: Obstacle): {
    exit: Side;
    entry: Side;
};
/**
 * Route from one box to another, going around any box in the way.
 *
 * Returns the polyline to draw. When nothing blocks the straight segment, or when every candidate is blocked (a
 * single box that fills the drawing), the straight line is returned and the caller keeps a two-point shape - an
 * unroutable edge is still an edge, and drawing it straight is more honest than dropping it.
 */
export interface Ports {
    exit: Point;
    entry: Point;
    exitSide: Side;
    entrySide: Side;
}
export declare function routeEdge(from: Obstacle, to: Obstacle, obstacles: Obstacle[], anchors?: Ports): {
    points: Point[];
    routed: boolean;
};
/** Drop the points in the middle of a straight run: three collinear points are one segment. */
export declare function simplify(points: Point[]): Point[];

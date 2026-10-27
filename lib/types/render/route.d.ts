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
/**
 * Which side of `from` an edge leaves by, and which side of `to` it arrives at.
 *
 * The side is a property of the drawing, not of the distance between two centres. A layered drawing puts its boxes
 * in horizontal rows, and an edge between two rows approaches vertically: out of the bottom, into the top, and the
 * other way round for an edge drawn against the flow. Only two boxes in the same row are joined sideways, and then
 * the direction of travel decides which side.
 *
 * This replaces the old rule, which compared the two centres' dx and dy and picked the larger axis - so an edge
 * between two rows left through a box's side as soon as the target was far enough sideways, which is the hook a
 * top-down drawing is read as a defect.
 */
export declare function approachSides(from: Obstacle, to: Obstacle): {
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
/**
 * Where a line lands on a shape, given where it comes from.
 *
 * This is the rule a drawing tool uses: the endpoint is not a fixed point, it is the perimeter point in the
 * direction the line arrives from. A line arriving from above lands on the top edge, one arriving from the left
 * lands on the left edge - so a side connection happens when the route genuinely comes from the side, rather than
 * being chosen up front by a distance formula.
 */
export declare function snapToPerimeter(box: Obstacle, from: Point): Point;

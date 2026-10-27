/**
 * The geometry of a node's symbol, shared by the module that draws it and the module that attaches edges to it.
 *
 * A box is a rectangle, but a symbol is not: the diamond's side midpoints are its vertices, a circle has no side at
 * all, and a cylinder's top is an arc. Any rule that decides where an edge may meet a node therefore needs the
 * symbol's own points - and the module that draws the symbol needs the same numbers, or the anchor and the outline
 * disagree and an edge ends in the air.
 *
 * So the arithmetic lives here once: the painter reads a port from it, the writer draws the shape from it, and a
 * change to a symbol's outline moves both. Pure data and pure functions, no SVG markup.
 */
import type { Box, Point } from './place.js';
/** A cubic Bezier, as the writer draws a curve and the painter reads a point from it. */
export interface Cubic {
    from: Point;
    c1: Point;
    c2: Point;
    to: Point;
}
/** Where the two caps of a cylinder start and end, and how deep each one is. */
export interface CylinderCaps {
    /** How far the cap reaches into the box: the writer's `min(10, h / 3)`. */
    cap: number;
    /** The top cap, drawn from its left shoulder to its right shoulder. */
    top: Cubic;
    /** The bottom cap, drawn from its right shoulder to its left shoulder. */
    bottom: Cubic;
}
/** A point on a cubic Bezier at parameter `t`, which is what makes "the top of the cap" a shared fact. */
export declare function cubicPoint(curve: Cubic, t: number): Point;
/**
 * A diamond's four points, in drawing order: top, right, bottom, left.
 *
 * These are the only four places an edge may meet a diamond: each side of the box meets the symbol at exactly that
 * point, and every other point on the side is in the air inside or outside the outline.
 */
export declare function diamondPoints(box: Box): [Point, Point, Point, Point];
/** How much of each end of a hexagon the corner cuts away. */
export declare function hexagonCut(width: number): number;
/**
 * A hexagon's six points, in drawing order: top-left, top-right, right, bottom-right, bottom-left, left.
 *
 * The top and bottom are flat runs between the first two and the last two points; the left and right sides are the
 * single points at index 5 and 2, because the corner cut removed everything else.
 */
export declare function hexagonPoints(box: Box): [Point, Point, Point, Point, Point, Point];
/** The radius of a stadium's end caps: half its height, unless the box is narrower than that. */
export declare function stadiumRadius(box: Box): number;
/**
 * A cylinder's two caps.
 *
 * The writer draws the top cap from the left shoulder to the right shoulder with the box's own top edge as the
 * control line, and the bottom cap mirrored. The cap curve's apex - the point the painter attaches a top or bottom
 * port to - is therefore a property of this curve, not a constant: it sits a quarter of the cap's depth inside the
 * box, not `cap` inside it.
 */
export declare function cylinderCaps(box: Box): CylinderCaps;
/** The apex of a cylinder's top or bottom cap: the only point on that side an edge meets the outline at. */
export declare function cylinderApex(box: Box, side: 'top' | 'bottom'): Point;

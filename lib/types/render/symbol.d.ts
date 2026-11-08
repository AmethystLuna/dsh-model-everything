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
import type { NodeShape } from './model.js';
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
/**
 * Does this symbol meet each of its four sides at exactly one point?
 *
 * A diamond's side midpoints are its four vertices, and an ellipse's are its four cardinal points: both offer one legal
 * port per side and no run to spread along. Every other symbol offers a run on at least one side - a rectangle along
 * its whole side, a hexagon along the flat between its cut corners, a stadium between its end caps, a cylinder along
 * its straight flank - so a port there has a place to sit rather than a point to take.
 *
 * This is the distinction the painter needs: a node with one legal point per side can give its edges a point each,
 * and a node with a run can only give them places along it. The two points the discrete shapes offer are the same
 * four points of the box, which is why one answer serves both.
 */
export declare function hasDiscretePorts(shape: NodeShape | undefined): boolean;
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
/**
 * Where the line from a box's middle toward another point crosses the symbol's outline.
 *
 * This is the anchor Graphviz clips an edge to: the end sits on the shape in the direction of the node it joins,
 * not at the middle of one of four sides. A rectangle's outline is its box, so its sides already give that; this
 * answers for the shapes whose outline is not four points - an ellipse, a rhombus - where the four cardinal points
 * or vertices are an artefact of the port model rather than of the shape.
 *
 * Undefined for a shape whose outline this does not model: the caller then keeps the point on its side.
 */
export declare function outlinePointFromCentre(box: Box, shape: NodeShape | undefined, peer: Point): Point | undefined;
/** The face of the box an outline point sits on: the one it is nearest. */
export declare function sideOfPoint(box: Box, point: Point): 'top' | 'bottom' | 'left' | 'right';
/**
 * A point on a cylinder's cap, at the fraction of the way across it an edge asked for.
 *
 * The apex is one point, and three relations leaving a cylinder all started there: three lines from one pixel, which
 * read as one. The cap is a curve, so an edge may leave anywhere on it - the answer Graphviz gives by taking the
 * border point in the direction of the other node. The shoulders are kept off: an edge leaving one would run along
 * the side the symbol is drawn by.
 */
export declare function cylinderPointOn(box: Box, side: 'top' | 'bottom', along: number): Point;
/**
 * A queue: a rectangle whose right end is a half circle, the way a channel is drawn.
 *
 * The rounded end is the mark. For a port the shape is still a rectangle - an edge leaves the right end at the
 * middle, which is the widest point of the cap - so no other stage needs to know about it.
 */
export declare function queueOutline(box: Box): {
    left: number;
    right: number;
    cap: number;
};
/**
 * The two shelf lines of a stack, drawn across the top of the box.
 *
 * They sit above the label, not through it: the label is centred in the box, so the shelves are packed into the few
 * pixels between the top edge and the first line of text.
 */
export declare function stackShelves(box: Box): [number, number];
/** How much of the top edge a storage's curve takes. */
export declare function storageCrown(box: Box): number;
/** How much of the top-right corner a note folds away. */
export declare function noteFold(width: number, height: number): number;
/**
 * A note: the rectangle with one corner folded, and the crease that shows it.
 *
 * The fold is the whole difference between a note and a component, so it is drawn: a plain rectangle would say
 * `this is an element` where the source said `this is a remark about one`.
 */
/**
 * A folded box: the rectangle with one corner cut away, and the flap the cut left behind.
 *
 * The fold is the whole difference between a remark and an element, so it is drawn: a plain rectangle would say
 * `this is an element` where the source said something else. `side` is the corner that folds - top-right for a note
 * and a file, top-left for a card.
 */
export declare function foldPoints(box: Box, side: 'right' | 'left'): {
    outline: Point[];
    fold: [Point, Point, Point];
};
/**
 * A frame: a rectangle whose name sits in a tab across the top-left corner.
 *
 * The tab is the symbol. The name is drawn in it, so the inside stays free for what the frame holds.
 */
export declare function frameTab(box: Box, label: number): {
    tab: Box;
};
/** The apex of a cylinder's top or bottom cap: the point its middle is drawn at. */
export declare function cylinderApex(box: Box, side: 'top' | 'bottom'): Point;

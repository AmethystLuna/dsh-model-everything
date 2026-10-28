/**
 * Geometry: what a diagram turns into, in coordinates.
 *
 * A drawing has to survive three containers - inline in a conversation, full-screen, and a persistent
 * sidebar tab - so nothing here knows about pixel size. It emits a content-sized canvas and lets the
 * container scale it: the same numbers serve a 360px card and a 1200px whiteboard.
 *
 * The drawing is placed by the layered pipeline (`place.ts`), which also says which lane a long edge reserved.
 * Edges are drawn from where the boxes ended up, in two ways only: a long edge follows its lane as one polyline,
 * and everything else goes through the orthogonal router. Which side of a box an edge leaves by is read off the
 * route, not picked by comparing the boxes' centres: a route between two rows arrives vertically, so the endpoint
 * is snapped onto the top or bottom perimeter in the direction the route approaches. Where along that side it sits
 * follows the symbol: a rectangle spreads its ports along the side, a cylinder's top port sits on its cap curve, and a
 * diamond or a circle has four legal points and no side to spread along at all. A side that carries one port is
 * centred on it, and a side that carries several spreads them symmetrically about the middle; the bend budget comes
 * first, so a port that is the end of a straight run or of a lane keeps the coordinate its route asked for.
 *
 * A symbol with discrete points gives each of its edges a point of its own: the point whose outward normal faces the
 * box at the other end is the one that edge takes, and an edge only shares a point when all four are spoken for. A
 * node with a run on its side keeps doing what it always did, because there the ports are places on the run and not
 * points at all. Sharing is the fallback, not the rule: two labelled branches of a decision leave by two vertices.
 *
 * An edge's name is drawn on the edge, not beside it: it is anchored at the midpoint of one of the edge's own straight
 * runs, over a rectangle in the page colour that masks the line behind the text, and it slides along that run when
 * something is in the way. It tries every run - the longest first - because on a dense drawing the longest one can be
 * crowded for its whole length while a shorter run of the same edge is clear. A label that can clear nothing still
 * stays on its edge, takes the place with the fewest collisions, and records what it could not avoid. Labels are
 * placed after every edge is drawn, because what a label has to avoid is the whole picture.
 *
 * Every route is checked before it is drawn, and the assembled drawing is checked once more: a segment may touch no
 * box except the two the edge terminates at. A route is a proposal - a channel run, a lane, a trunk branch, a wrapped
 * column's sideways read - and any proposal that would cross a box is handed to the router instead. When even the
 * router cannot clear a box, the failure is reported on the canvas rather than hidden: a drawing that says which edge
 * could not be routed is worth more than one that quietly draws it through a box.
 *
 * Pure: a diagram in, shapes out, every decision assertable.
 */
import { type Box } from './place.js';
import { type ColourRole, type Palette, type PaletteOptions } from './palette.js';
import { type Diagram, type DiagramNode, type EdgeArrow, type NodeShape } from './model.js';
export interface Point {
    x: number;
    y: number;
}
export interface BoxShape {
    kind: 'box';
    x: number;
    y: number;
    width: number;
    height: number;
    /** The lines to draw, already wrapped; `label` keeps the whole text for anything that reads the shape. */
    label: string;
    lines: string[];
    /** The symbol to draw. Undefined means a rectangle. */
    shape?: NodeShape;
    colour: ColourRole;
    initial: boolean;
}
/**
 * Why a label sits where it does.
 *
 * A clear label records `collisions: 0` and the run it chose. A label that could clear nothing records the collisions
 * it could not avoid, so a reader of the drawing (or a test) can tell a crowded drawing from a placement bug. The
 * label never leaves its own edge to earn any of these numbers.
 */
export interface LabelPlacement {
    /** The straight run it sits on, 0 being the edge's longest. */
    run: number;
    /** Everything its mask overlaps: the other labels, boxes and edges it would have had to move off its line to clear. */
    collisions: number;
    boxes: number;
    labels: number;
    edges: number;
}
export interface LinkShape {
    kind: 'link';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    label: string;
    /** The centre the label is drawn on, and therefore a point on the edge itself. */
    labelX: number;
    labelY: number;
    colour: ColourRole;
    /** A dashed line, when the notation distinguished one. */
    dashed?: boolean;
    /** The arrow the source edge stated. Undefined means the plain arrow every edge has been drawn with. */
    arrow?: EdgeArrow;
    /** Why the label sits where it does. Undefined on an edge with no label. */
    labelPlacement?: LabelPlacement;
}
export interface PathShape {
    kind: 'path';
    points: Point[];
    label: string;
    /** The centre the label is drawn on, and therefore a point on the edge itself. */
    labelX: number;
    labelY: number;
    colour: ColourRole;
    dashed?: boolean;
    arrow?: EdgeArrow;
    /** Why the label sits where it does. Undefined on an edge with no label. */
    labelPlacement?: LabelPlacement;
}
/**
 * A junction dot: the place one branch of a merged bundle meets the bundle's trunk.
 *
 * The dot is not decoration. Two lines that meet at a right angle read as a crossing unless one of them is marked as
 * joining the other, and a bundle whose branches are not marked reads as a set of broken lines rather than a merge.
 */
export interface JunctionShape {
    kind: 'junction';
    x: number;
    y: number;
    colour: ColourRole;
    /** The trunk the dot belongs to: one dot per branch, one trunk id per bundle. */
    trunk: number;
}
/** A boundary around several states: a package, a layer, a subgraph. */
export interface GroupShape {
    kind: 'group';
    /** The group's own id, so a container can fold it without guessing from the label. */
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    colour: ColourRole;
}
export interface CaptionShape {
    kind: 'caption';
    x: number;
    y: number;
    lines: string[];
    colour: ColourRole;
}
export interface TitleShape {
    kind: 'title';
    x: number;
    y: number;
    text: string;
    colour: ColourRole;
}
export type Shape = GroupShape | BoxShape | LinkShape | PathShape | JunctionShape | CaptionShape | TitleShape;
/** One segment of a drawn route that could not be kept out of a box it does not terminate at. */
export interface RoutingFailure {
    /** The edge's index in the diagram. */
    edge: number;
    from: string;
    to: string;
    /** The box the segment passes through. */
    box: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
export interface Canvas {
    width: number;
    height: number;
    shapes: Shape[];
    /**
     * Every place a drawn segment still passes through a box it does not terminate at, after every route was checked.
     *
     * A drawing should carry none. The field exists for the case where no stage and no router could find a way around:
     * a route that cannot be drawn honestly is reported here rather than silently drawn through a box.
     */
    routingFailures: RoutingFailure[];
    /** How many edge labels could not be placed clear of every box, label and other edge. */
    labelCollisions: number;
}
/**
 * How far apart two edges that join the same pair are drawn.
 *
 * Wider than the least two ports may sit: two statements about one pair have to read as two lines, and a gap the
 * port packer would allow is a gap a reader sees as one thick line. Exported so a test can name the pattern.
 */
export declare const MULTI_EDGE_SPACING = 20;
/** Which colour a box earns from its role. One mapping, used by every container. */
export declare function roleOfNode(node: DiagramNode): ColourRole;
/**
 * How tall the mask an edge label is drawn over is.
 *
 * Exported because two modules must agree on it: the painter reserves the rectangle when it looks for a clear
 * place, and the writer draws the rectangle that was reserved. A label with two sizes is a label half masked.
 */
export declare const LABEL_HEIGHT = 12;
/** A straight piece of an edge, as the collision test needs it. */
interface Segment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
/** Where a label sits: the point it is centred on, and the rectangle its mask covers. */
interface LabelSpot {
    x: number;
    y: number;
    width: number;
    height: number;
}
/**
 * The point an edge's label is drawn at.
 *
 * A label is not furniture parked beside the line: it names the transition, so it sits on the line - anchored on one
 * of its own straight runs - and the writer masks the stretch of line it covers. Text beside a line can be read as
 * belonging to whatever it happens to sit next to; text that interrupts its own line reads as part of it.
 *
 * The anchor then has to be earned. A mask over a box hides a border, over another label it makes both unreadable,
 * and over a third edge's line it hides that line. So the label walks along a run in small steps, in both directions
 * and bounded so its rectangle stays on that run, and takes the first place that is clear. It tries the longest run
 * first and then the shorter ones: on a dense drawing the longest run can be crowded for its whole length while a
 * shorter run of the same edge is empty, and a label that gives up after one run leaves the drawing with a collision
 * it did not have to accept.
 *
 * When no run offers a clear place, the label takes the place with the fewest collisions - boxes and other labels
 * first, because text over a border hides the border and text over text is unreadable, then other edges, which a mask
 * merely interrupts. It never leaves its own edge: a label moved onto a neighbouring edge is a label that names the
 * wrong thing. The choice is returned with the label, so a crowded drawing can be told from a placement bug.
 *
 * Exported because the choice is pure and worth asserting without a layout: a test can hand it one polyline, one box
 * and one other route, and read which run it took and what it could not clear.
 */
export declare function placeLabel(label: string, points: Point[], boxes: Iterable<Box>, placed: LabelSpot[], otherRoutes: Segment[][]): LabelPlacement & LabelSpot;
/**
 * The boxes a polyline passes through other than the two it terminates at.
 *
 * This is the drawing's one clearance rule, and it is deliberately written once: a channel run, a lane, a trunk
 * branch, a wrapped column's sideways step and the router's fallback all have to obey the same test. A box is skipped
 * only when it is one of the edge's own two ends, so a port that sits inside its own symbol (a cylinder's cap apex)
 * is allowed and a segment that ends inside somebody else's box is not.
 */
export declare function boxesCrossedBy(points: Point[], from: Box, to: Box, boxes: Iterable<Box>): Box[];
export declare function paintWith(diagram: Diagram, overrides?: Partial<Palette>, options?: PaletteOptions): {
    canvas: Canvas;
    colours: Palette;
};
export declare function paint(diagram: Diagram, overrides?: Partial<Palette>): Canvas;
export {};

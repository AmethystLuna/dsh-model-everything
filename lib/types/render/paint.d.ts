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
 * box except the two the edge terminates at. A route is a proposal - a channel run, a lane, a wrapped
 * column's sideways read - and any proposal that would cross a box is handed to the router instead. When even the
 * router cannot clear a box, the failure is reported on the canvas rather than hidden: a drawing that says which edge
 * could not be routed is worth more than one that quietly draws it through a box.
 *
 * Pure: a diagram in, shapes out, every decision assertable.
 */
import { type Box } from './place.js';
import { type LabelPlacement } from './labels.js';
export { LABEL_HEIGHT, placeLabel } from './labels.js';
export type { LabelPlacement } from './labels.js';
import { type ColourRole, type Palette, type PaletteOptions } from './palette.js';
import { type Diagram, type DiagramNode, type EdgeArrow, type NodeShape } from './model.js';
export interface Point {
    x: number;
    y: number;
}
export interface BoxShape {
    kind: 'box';
    /** Which node this box is. It travels into the markup, so a reader can target one node by delegation. */
    id: string;
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
/** A boundary around several states: a package, a layer, a subgraph. */
export interface GroupShape {
    kind: 'group';
    /** A package is dashed and a composite state is solid; the notation decides, so the shape carries it. */
    outline?: 'dashed' | 'solid';
    /** The group's own id, so a container can fold it without guessing from the label. */
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    colour: ColourRole;
}
/** A `legend` block: page furniture, drawn under the drawing and never part of it. */
export interface LegendShape {
    kind: 'legend';
    x: number;
    y: number;
    lines: string[];
    colour: ColourRole;
}
export interface CaptionShape {
    kind: 'caption';
    x: number;
    y: number;
    lines: string[];
    colour: ColourRole;
}
/** A `header` line: page text above the drawing, in the source's own words. */
export interface HeaderShape {
    kind: 'header';
    x: number;
    y: number;
    text: string;
    colour: ColourRole;
}
export interface TitleShape {
    kind: 'title';
    x: number;
    y: number;
    text: string;
    colour: ColourRole;
}
export type Shape = GroupShape | BoxShape | LinkShape | PathShape | CaptionShape | LegendShape | TitleShape | HeaderShape;
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
 * The boxes a polyline passes through other than the two it terminates at.
 *
 * This is the drawing's one clearance rule, and it is deliberately written once: a channel run, a lane, a
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

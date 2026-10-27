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
 * is snapped onto the top or bottom perimeter in the direction the route approaches, and two edges on the same
 * side take separate points along it.
 *
 * An edge's name is drawn on the edge, not beside it: it is anchored at the midpoint of the edge's longest straight
 * run, over a rectangle in the page colour that masks the line behind the text, and it slides along that run when
 * something is in the way. Labels are placed after every edge is drawn, because what a label has to avoid is the
 * whole picture.
 *
 * Pure: a diagram in, shapes out, every decision assertable.
 */
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
export type Shape = GroupShape | BoxShape | LinkShape | PathShape | CaptionShape | TitleShape;
export interface Canvas {
    width: number;
    height: number;
    shapes: Shape[];
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
export declare function paintWith(diagram: Diagram, overrides?: Partial<Palette>, options?: PaletteOptions): {
    canvas: Canvas;
    colours: Palette;
};
export declare function paint(diagram: Diagram, overrides?: Partial<Palette>): Canvas;

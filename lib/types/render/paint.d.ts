/**
 * Geometry: what a diagram turns into, in coordinates.
 *
 * A drawing has to survive three containers - inline in a conversation, full-screen, and a persistent
 * sidebar tab - so nothing here knows about pixel size. It emits a content-sized canvas and lets the
 * container scale it: the same numbers serve a 360px card and a 1200px whiteboard, because SVG scales and
 * text is measured in the units the boxes are.
 *
 * The rules that make it readable, in the order they matter:
 *
 * - every state is a box of its own width, so a long id is not clipped by a fixed 120px;
 * - a forward edge is a straight vertical line, because that is what reads as "next";
 * - a back edge leaves to a side channel and returns from the same side, so it never crosses the boxes it
 *   jumps over;
 * - a self loop is a small loop on the right, not a line to itself;
 * - an edge label sits beside its own segment, never on top of a box;
 * - the caption is wrapped and the canvas is widened to fit it, so nothing is clipped at the right edge.
 *
 * Pure: a diagram in, shapes out, every decision assertable.
 */
import { type ColourRole, type Palette, type PaletteOptions } from './palette.js';
import { type Diagram, type DiagramNode } from './model.js';
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
    label: string;
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
    labelX: number;
    labelY: number;
    colour: ColourRole;
}
export interface PathShape {
    kind: 'path';
    points: Point[];
    label: string;
    labelX: number;
    labelY: number;
    colour: ColourRole;
}
export interface CaptionShape {
    kind: 'caption';
    x: number;
    y: number;
    lines: string[];
    colour: ColourRole;
}
/** A boundary around several states: a package, a layer, a subgraph. */
export interface GroupShape {
    kind: 'group';
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
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
/** Which colour a box earns from its role. One mapping, used by every container. */
export declare function roleOfNode(node: DiagramNode): ColourRole;
export declare function paintWith(diagram: Diagram, overrides?: Partial<Palette>, options?: PaletteOptions): {
    canvas: Canvas;
    colours: Palette;
};
export declare function paint(diagram: Diagram, overrides?: Partial<Palette>): Canvas;

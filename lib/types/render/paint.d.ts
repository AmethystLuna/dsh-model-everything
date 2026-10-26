/**
 * Geometry: what a diagram turns into, in coordinates.
 *
 * A drawing has to survive three containers - inline in a conversation, full-screen, and a persistent
 * sidebar tab - so nothing here knows about pixel size. It emits a content-sized canvas and lets the
 * container scale it: the same numbers serve a 360px card and a 1200px whiteboard.
 *
 * Two placements, chosen by the source:
 *
 * - **layered** (no groups): breadth-first rows, forward edges dropping straight down, back edges on a side
 *   channel clear of every box, self loops as small loops. The shape a state machine wants.
 * - **tree** (groups present): a group is a block, its members stack inside it, a nested group is a block
 *   inside its parent, and the top level stacks. The shape an architecture diagram wants, because a package
 *   whose members float somewhere else on the page is not showing containment at all.
 *
 * Edges are placed from where the boxes ended up, so neither placement needs to tell the edge code which one
 * ran: "below" is a straight line, "beside" is horizontal, "above" routes around.
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
/** Which colour a box earns from its role. One mapping, used by every container. */
export declare function roleOfNode(node: DiagramNode): ColourRole;
export declare function paintWith(diagram: Diagram, overrides?: Partial<Palette>, options?: PaletteOptions): {
    canvas: Canvas;
    colours: Palette;
};
export declare function paint(diagram: Diagram, overrides?: Partial<Palette>): Canvas;

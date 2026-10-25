/**
 * Shapes: the drawing as data, before any markup exists.
 *
 * A painter that emitted markup could only be tested by comparing strings; a painter that emits shapes can
 * be tested by asserting what is where. The SVG writer is the only module that knows about tags.
 *
 * Pure.
 */
import { type ColourRole, type Palette } from './palette.js';
import type { Diagram } from './viewmodel.js';
export interface Box {
    kind: 'box';
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    colour: ColourRole;
    /** Drawn as a double border: the initial state. */
    initial: boolean;
}
export interface Link {
    kind: 'link';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    label: string;
    colour: ColourRole;
}
export interface Caption {
    kind: 'caption';
    x: number;
    y: number;
    text: string;
    colour: ColourRole;
}
export interface Title {
    kind: 'title';
    x: number;
    y: number;
    text: string;
    colour: ColourRole;
}
export type Shape = Title | Box | Link | Caption;
export interface Canvas {
    width: number;
    height: number;
    shapes: Shape[];
}
export declare function paint(diagram: Diagram, colours?: Palette): Canvas;
/** The palette a canvas was painted with, so a writer can resolve a role without knowing the theme. */
export declare function paintWith(diagram: Diagram, overrides?: Partial<Palette>): {
    canvas: Canvas;
    colours: Palette;
};

/**
 * The renderer's front door: whatever notation arrived, one drawing comes out.
 *
 * Three containers read this - the tool card, the full-screen view and the sidebar whiteboard - and each of
 * them wants the same two things: shapes to draw and markup to embed. Neither knows which notation produced
 * them, and neither needs to.
 *
 * Pure: no filesystem, because the same module is bundled into the page for the whiteboard.
 */
import type { Diagram } from './model.js';
import { type Canvas } from './paint.js';
import type { Palette, PaletteOptions } from './palette.js';
export type Notation = 'mermaid' | 'plantuml';
export interface RenderInput {
    /** The notation, or `auto` to read it off the first non-empty line. */
    notation?: Notation | 'auto';
    source: string;
    title?: string;
}
export interface Rendered {
    diagram: Diagram;
    canvas: Canvas;
    /** The colours the drawing was made with, so a container can paint the same surface behind it. */
    colours: Palette;
    /** Ready to embed: an `<svg>` with a viewBox and no fixed pixel size of its own. */
    markup: string;
    /** Which notation the source turned out to be. */
    notation: Notation;
    /** Lines the parser refused, with their reason. Empty when the whole source was understood. */
    refused: string[];
    /** Shapes the SVG writer had no case for. Must be zero; reported rather than hidden. */
    dropped: number;
}
/** Read the notation off the source: PlantUML starts with `@startuml` or `@startmindmap`-style markers. */
export declare function detectNotation(source: string): Notation;
export declare function render(input: RenderInput, overrides?: Partial<Palette>, options?: PaletteOptions): Rendered;

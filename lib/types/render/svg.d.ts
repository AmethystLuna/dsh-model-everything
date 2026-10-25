/**
 * Shapes to SVG markup.
 *
 * The one module that knows tags, so it is also the one place where a shape can silently disappear if a
 * writer forgets a case: the writer table has an entry per shape kind, and the caller counts the drops
 * instead of hiding them.
 *
 * Three containers read this output - an inline card, a full-screen view, and a sidebar tab - so the markup
 * carries no size of its own beyond its `viewBox`: the container decides how large the drawing is, and the
 * same string serves a thumbnail and a whiteboard.
 *
 * Pure, and the output is asserted as text: escaping, geometry, arrowheads, wrapped captions.
 */
import type { Canvas } from './paint.js';
import type { Palette } from './palette.js';
export declare function toSvg(canvas: Canvas, colours: Palette, label?: string): {
    markup: string;
    dropped: number;
};

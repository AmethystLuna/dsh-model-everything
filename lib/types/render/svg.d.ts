/**
 * Shapes to SVG markup.
 *
 * The one module that knows tags, so it is also the one place where a shape can silently disappear if a
 * writer forgets a case: `writer` returns undefined for an unknown kind, and the caller counts the drops
 * instead of hiding them.
 *
 * Pure, and the output is asserted as text in the suite: escaping, geometry, and the caption.
 */
import type { Palette } from './palette.js';
import type { Canvas } from './paint.js';
export interface Written {
    markup: string;
    /** Shapes the writer had no case for. Non-zero is a defect, and the suite requires zero. */
    dropped: number;
}
export declare function toSvg(canvas: Canvas, colours?: Palette, label?: string): Written;

/**
 * Text as the layout sees it: measured, broken into lines, and turned into a box.
 *
 * Mermaid and Graphviz both measure a label in the platform's own text engine and then lay out around that
 * measurement - a node's size is its text plus padding, and a label too long for its maximum width is wrapped
 * before anything is placed. There is no DOM here, so the measurement is an estimate over a per-character width
 * table; what matters is that the *order* is the same: text first, geometry second. A renderer that fixes the box
 * and pours text into it cannot help overflowing.
 *
 * Explicit breaks (`<br>`, `<br/>`, `<br />`, a real newline) are honoured as written, because a source that put
 * one there wanted that line to end.
 */
/** A line longer than this wraps on a space, or breaks in the middle when it has none. */
export declare const MAX_LINE_CHARS = 30;
/** Height of one line of box text, and the breathing room around the block. */
export declare const LINE_HEIGHT = 15;
export declare const TEXT_PADDING = 12;
/** The smallest and largest box a label may produce. */
export declare const MIN_NODE_WIDTH = 88;
export declare const MAX_NODE_WIDTH = 260;
/** The lines a label asks for, before wrapping: an explicit break is a line end, not a space. */
export declare function explicitLines(label: string): string[];
/**
 * Wrap one line to the maximum width.
 *
 * A word longer than the limit is broken rather than allowed to overflow: a single token with no spaces is the
 * common case in identifiers, and letting it run off the box is the defect this function exists to prevent.
 */
export declare function wrapLine(line: string, limit?: number): string[];
export interface Measured {
    lines: string[];
    width: number;
    height: number;
}
/** The text block a label produces: its lines, and the box it needs. */
export declare function measure(label: string): Measured;
/** Rough width of a single-line piece of text, for placing an edge label without a box. */
export declare function textWidth(text: string): number;

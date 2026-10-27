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
/** Average advance per character, in the drawing's units, at the 11px font the writer emits. */
const CHAR_WIDTH = 6.6;
/** A line longer than this wraps on a space, or breaks in the middle when it has none. */
export const MAX_LINE_CHARS = 30;
/** Height of one line of box text, and the breathing room around the block. */
export const LINE_HEIGHT = 15;
export const TEXT_PADDING = 12;
/** The smallest and largest box a label may produce. */
export const MIN_NODE_WIDTH = 88;
export const MAX_NODE_WIDTH = 260;
/** `<br>`, `<br/>`, `<br />` and a real newline all end a line. */
const BREAK = /<br\s*\/?>|\r?\n/gi;
/** The lines a label asks for, before wrapping: an explicit break is a line end, not a space. */
export function explicitLines(label) {
    return label.split(BREAK).map((line) => line.trim());
}
/**
 * Wrap one line to the maximum width.
 *
 * A word longer than the limit is broken rather than allowed to overflow: a single token with no spaces is the
 * common case in identifiers, and letting it run off the box is the defect this function exists to prevent.
 */
export function wrapLine(line, limit = MAX_LINE_CHARS) {
    if (line === '')
        return [''];
    const out = [];
    let current = '';
    for (const word of line.split(/\s+/).filter((part) => part !== '')) {
        const candidate = current === '' ? word : current + ' ' + word;
        if (candidate.length <= limit) {
            current = candidate;
            continue;
        }
        if (current !== '')
            out.push(current);
        if (word.length <= limit) {
            current = word;
            continue;
        }
        let rest = word;
        while (rest.length > limit) {
            out.push(rest.slice(0, limit));
            rest = rest.slice(limit);
        }
        current = rest;
    }
    if (current !== '')
        out.push(current);
    return out.length === 0 ? [''] : out;
}
/** The text block a label produces: its lines, and the box it needs. */
export function measure(label) {
    const lines = explicitLines(label).flatMap((line) => wrapLine(line));
    const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
    const width = Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, longest * CHAR_WIDTH + TEXT_PADDING * 2));
    const height = lines.length * LINE_HEIGHT + TEXT_PADDING;
    return { lines, width, height };
}
/** Rough width of a single-line piece of text, for placing an edge label without a box. */
export function textWidth(text) {
    return text.length * CHAR_WIDTH;
}

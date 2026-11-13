/**
 * The lines that place a note: `note right of X : text`, and the two forms this renderer refuses with a reason.
 *
 * A note beside a box is a note *and* a position. The position is honoured through the same machinery every other placement uses - a
 * hidden edge with a direction hint - so the note lands beside its box without a second layout rule. What the line states is decided
 * here; the parser writes it.
 */
import type { Reference } from './plantuml-reference.js';
export type NoteLine = {
    kind: 'placed';
    /** The element the note belongs to. */
    target: Reference;
    /** The element id the note is drawn as. */
    noteId: string;
    text: string;
    /** The direction the hidden edge carries, stated from the box's side. */
    hint: 'left' | 'right' | 'up' | 'down';
    /** The note's own keyword when the source asked for a shape other than the default fold. */
    shape?: string;
} | {
    kind: 'refused';
    message: string;
};
/**
 * The note a line places, or `undefined` when the line places none.
 *
 * The hint is turned here rather than at the write: `-right->` puts the far box on the right, so a note on a box's left is stated as
 * `left` and the layout gets the direction the source meant.
 */
export declare function readNote(line: string, where: string, ordinal?: number): NoteLine | undefined;

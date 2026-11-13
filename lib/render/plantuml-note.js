import { reference } from './plantuml-reference.js';
/**
 * The note a line places, or `undefined` when the line places none.
 *
 * The hint is turned here rather than at the write: `-right->` puts the far box on the right, so a note on a box's left is stated as
 * `left` and the layout gets the direction the source meant.
 */
export function readNote(line, where) {
    const placed = /^note\s+(left|right|top|bottom)\s+of\s+(.+?)(?:\s*:\s*(.+))?$/.exec(line);
    if (placed !== null) {
        const target = reference(placed[2]);
        const text = (placed[3] ?? '').trim();
        if (text === '') {
            return {
                kind: 'refused',
                message: where + '`' + line + '` names no text: a note beside a box needs its words on the same line',
            };
        }
        const side = placed[1];
        return {
            kind: 'placed',
            target,
            noteId: 'note-' + target.id,
            text,
            hint: side === 'top' ? 'up' : side === 'bottom' ? 'down' : side,
        };
    }
    // A note attached to whatever box came last depends on reading order, which is not a statement the drawing can make.
    if (/^note\s+(left|right|top|bottom)\s*:/.test(line)) {
        return {
            kind: 'refused',
            message: where + '`' + line.split(':')[0] + '`: a note attached to the last box names no box; `note right of X : text` names one',
        };
    }
    // A note on a link belongs to an edge this drawing cannot name from the line.
    if (/^note\s+on\s+link\b/.test(line)) {
        return {
            kind: 'refused',
            message: where + '`' + line.split(':')[0] + '`: a note on a link names the link, and no line here can name one',
        };
    }
    // A note over a box is a position no edge can express, so it is refused by name rather than dropped.
    if (/^note\s+over\b/.test(line)) {
        return {
            kind: 'refused',
            message: where + '`' + line.split(/\s+/).slice(0, 3).join(' ') + '`: a note over a box is a position this renderer cannot draw',
        };
    }
    return undefined;
}

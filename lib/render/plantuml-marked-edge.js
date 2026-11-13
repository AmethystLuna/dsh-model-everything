import { reference } from './plantuml-reference.js';
/** The direction forms, which state where the far box goes. */
const DIRECTED = /^(.+?)\s*-(up|down|left|right)-+>?\s*(.+?)(?:\s*:\s*(.+))?$/;
/** `-[hidden]->` names a place, not a connection: the edge ranks the two boxes and is never drawn. */
const HIDDEN = /^(.+?)\s*-\s*\[\s*hidden\s*\]\s*-+>?\s*(.+?)(?:\s*:\s*(.+))?$/;
const START = /^\[\*\]\s*-->\s*(.+)$/;
/** `a -[#blue]-> b` asks for a line style: the arrow is drawn, the style is reported. */
const STYLED = /^(.+?)\s*-\[([^\]]*)\]-+>?\s*(.+?)(?:\s*:\s*(.+))?$/;
/**
 * The marked line, or `undefined` when the line is a plain arrow or not an edge at all.
 *
 * The hidden form is tested before the direction form: `a -[hidden]-> b` would otherwise match neither, and a form that matches
 * neither is read as a declaration of an element named after the whole line.
 */
export function readMarked(line) {
    if (line === '[*] --> [*]')
        return { kind: 'selfLoop' };
    const start = START.exec(line);
    if (start !== null)
        return { kind: 'start', target: reference(start[1]) };
    const hidden = HIDDEN.exec(line);
    if (hidden !== null) {
        return {
            kind: 'edge',
            from: reference(hidden[1]),
            to: reference(hidden[2]),
            label: (hidden[3] ?? '').trim(),
            invisible: true,
        };
    }
    // A bracket that is not `hidden` is a style: the edge is read, the style reported.
    const styled = STYLED.exec(line);
    if (styled !== null) {
        return {
            kind: 'edge',
            from: reference(styled[1]),
            to: reference(styled[3]),
            label: (styled[4] ?? '').trim(),
            style: styled[2].trim(),
        };
    }
    const directed = DIRECTED.exec(line);
    if (directed !== null) {
        return {
            kind: 'edge',
            from: reference(directed[1]),
            to: reference(directed[3]),
            label: (directed[4] ?? '').trim(),
            hint: directed[2],
        };
    }
    return undefined;
}

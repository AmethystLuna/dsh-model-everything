/**
 * Edges whose line carries more than an arrow: a direction (`-down->`), a hidden marker (`-[hidden]->`), and the start and end markers
 * of a machine.
 *
 * Each states a constraint rather than a connection: the direction says where the far box goes, the hidden edge ranks two boxes without
 * being drawn, and the markers say where the machine begins and ends. The parser writes what this returns; nothing here sees a drawing.
 */
import type { Reference } from './plantuml-reference.js';
export type MarkedLine = 
/** `[*] --> [*]`: a machine with one state, which is drawn as nothing at all. */
{
    kind: 'selfLoop';
}
/** `[*] --> X`: the machine starts at X. */
 | {
    kind: 'start';
    target: Reference;
}
/** An edge that carries a hint, or that ranks two boxes without being drawn. */
 | {
    kind: 'edge';
    from: Reference;
    to: Reference;
    label: string;
    hint?: 'up' | 'down' | 'left' | 'right';
    invisible?: true;
};
/**
 * The marked line, or `undefined` when the line is a plain arrow or not an edge at all.
 *
 * The hidden form is tested before the direction form: `a -[hidden]-> b` would otherwise match neither, and a form that matches
 * neither is read as a declaration of an element named after the whole line.
 */
export declare function readMarked(line: string): MarkedLine | undefined;

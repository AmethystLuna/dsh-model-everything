/**
 * A declaration line: the element or elements it states, and what the reader is told about its decorations.
 *
 * `component Api <<service>> #blue` declares one box and reports two decorations. The rules are here rather than in the reading loop
 * because each of them is a question about one line - is this a declaration, which of the four name forms is it, what is decoration -
 * and the loop can only answer such a question by building a diagram.
 */
import type { NodeShape } from './model.js';
export interface DeclaredElement {
    id: string;
    label?: string;
    shape: NodeShape;
}
export interface Declaration {
    /** The elements the line declares, in the order the line states them. */
    elements: DeclaredElement[];
    /** What the reader is told, in the order the line states it. */
    notes: {
        channel: 'ignored' | 'refused';
        message: string;
    }[];
}
/**
 * The declaration a line states, or `undefined` when it states none.
 *
 * A description line (`state S : entry / go`) is a body this renderer does not draw, so it is refused by line rather than folded into
 * the element's name - and it is answered here because it is a declaration that cannot be one.
 */
export declare function readDeclaration(line: string, where: string): Declaration | undefined;

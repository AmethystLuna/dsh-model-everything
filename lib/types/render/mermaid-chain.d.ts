/**
 * A Mermaid line with more than one connection in it: a chain (`a --> b --> c`), several sources (`a & b --> c`), several targets
 * (`a --> b & c`), or a chain of those.
 *
 * The lines are legal Mermaid and each one states several edges. Read as a single line they name no two nodes, and the whole line was
 * refused - a drawing that loses three boxes because the source wrote one line for them.
 */
/** One connection as the line stated it. */
export interface Link {
    from: string;
    to: string;
    /** The arrow text, so the caller can read dashed, dotted and thick from it. */
    arrow: string;
    label?: string;
}
/**
 * The connections a line states, or `undefined` when it states a single one and the caller's own reader should have it.
 *
 * A single connection is answered by `undefined` rather than by a one-element list: the caller already reads that case, with more care
 * than this function takes, and two readers for one line is how they drift apart.
 */
export declare function readChain(line: string): Link[] | undefined;

/**
 * A name with the decorations stripped off it.
 *
 * A stereotype, a cardinality and a colour can follow a name in four places the source writes one - a declaration, an arrow
 * endpoint, a boundary and a note - and in every one of them, left in, the decoration became part of the name: `p <<layer>>`,
 * `a "1"`, `"网关" as gw`. The result is an id no other line can point at, from a line that looks perfectly ordinary.
 *
 * The stripping is one function so the fifth place inherits it, and so a test can say what is a decoration and what is a name
 * without a drawing. It reports what it removed, because a drawing that drops a stereotype silently teaches the source's author
 * that the stereotype did something.
 */
export interface BareName {
    /** What is left: the name itself. */
    name: string;
    /** Everything taken off, in the order it was found, so the caller can report each one. */
    stripped: string[];
}
/**
 * How a stripped decoration is described to the source's author.
 *
 * One wording per kind, in one place: the three call sites that strip decorations used to word this themselves, and they drifted.
 */
export declare function decorationReason(token: string): string;
export declare function bareName(text: string): BareName;

/** The keywords whose `{ }` block is drawn as a boundary. */
export declare const BOUNDARY: Set<string>;
/** Boundaries drawn with a solid outline: a state is a region of the machine, not a label on a box. */
export declare const SOLID_BOUNDARY: Set<string>;
export type BoundaryLine = 
/** `}` closes the innermost open boundary. */
{
    kind: 'close';
}
/** `package orders {` opens one. `line` is the 1-based line number, kept for the group's own report. */
 | {
    kind: 'open';
    id: string;
    label: string;
    solid: boolean;
    line: number;
    notes: string[];
}
/** A block that cannot be drawn, or a boundary whose decorations are reported. */
 | {
    kind: 'note';
    channel: 'ignored' | 'refused';
    message: string;
};
/**
 * The boundary a line opens or closes, or `undefined` when the line is neither.
 *
 * `ordinal` names a boundary the source did not name: it is the count the parser will hold once this line is read, so it is passed in
 * rather than counted here.
 */
export declare function readBoundary(line: string, index: number, ordinal: number, where: string): BoundaryLine | undefined;

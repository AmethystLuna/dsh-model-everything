/**
 * The lines that are not diagram source: a preprocessor directive, a layout control, a style this renderer does not have, a marker
 * that the drawing itself has no room for.
 *
 * None of them needs a drawing, and none of them changes one - each is either read and dropped with a reason, or refused. They were
 * eight branches in the middle of the reading loop, where the only test they could have was a whole diagram; here one line goes in
 * and one answer comes out.
 */
export interface DirectiveAnswer {
    /** What happens to the line. */
    channel: 'ignored' | 'refused';
    /** The sentence the reader is given, with the line already in it. */
    message: string;
}
/**
 * The answer for one line, or `undefined` when the line is diagram source.
 *
 * `silent` is not in the union on purpose: the one line that is dropped without a word - the opener of a `together` block, whose
 * members are already on one row - is recognised by the caller, because the caller is what collected them.
 */
export declare function readDirective(line: string, where: string): DirectiveAnswer | undefined;
/** The opener of a `together` block: the block itself is read before the lines are parsed, so this line has nothing left to do. */
export declare function isTogetherOpener(line: string): boolean;

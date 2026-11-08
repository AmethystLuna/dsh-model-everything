/**
 * The blocks a diagram's source writes that are not diagram lines.
 *
 * Three of them exist - a legend, the page text, and a note written beside a box - and each was collected by a hand-written
 * loop that skipped lines, gathered text and ran a closing action. The loops differed only in what those three things mean,
 * so the walking is here and the meaning is the caller's.
 *
 * This runs before any line is parsed: a line inside a block must never reach the parser, or a footer that reads like source
 * grows a box. What a caller does at the close is up to it - a legend keeps its lines, a placed note is rewritten into the
 * one-line form the parser already knows.
 */
export interface BlockDefinition<State> {
    /** The state a block starts in, or `undefined` when this line does not open one. */
    open(line: string, index: number): State | undefined;
    /** Whether this line ends the block. The closing line is always skipped. */
    closes(line: string, state: State): boolean;
    /** One non-empty line of the block's body. */
    text(state: State, line: string): void;
    /** The block is closed: the source lines are handed over, so a caller may rewrite the opening line. */
    close(state: State, lines: string[], openedAt: number): void;
    /** Whether the opening line is also a line the diagram must not read. */
    skipOpening?: boolean;
}
/**
 * Walk the source once, gather every block, and mark the lines the parser must not see.
 *
 * `skip` is filled as the walk goes: an opener (when the definition says so), every body line and every closing line. A block
 * that is never closed swallows the rest of the source, and the walk says so by returning where it was opened: a source whose
 * `end header` is missing must be told, not silently reduced to the text above the missing line.
 */
export interface Unterminated<State> {
    state: State;
    /** The index of the line that opened it. */
    openedAt: number;
}
export declare function collectBlocks<State>(lines: string[], skip: Set<number>, definition: BlockDefinition<State>): Unterminated<State> | undefined;

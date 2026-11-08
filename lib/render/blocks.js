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
export function collectBlocks(lines, skip, definition) {
    let state;
    let openedAt = 0;
    lines.forEach((raw, index) => {
        const line = raw.trim();
        if (state === undefined) {
            const opened = definition.open(line, index);
            if (opened === undefined)
                return;
            state = opened;
            openedAt = index;
            if (definition.skipOpening === true)
                skip.add(index);
            return;
        }
        skip.add(index);
        if (definition.closes(line, state)) {
            definition.close(state, lines, openedAt);
            state = undefined;
            return;
        }
        if (line !== '')
            definition.text(state, line);
    });
    return state === undefined ? undefined : { state, openedAt };
}

/**
 * The effect of an arrow whose ends were both read.
 *
 * An exit marker keeps its label when the source wrote one, and is labelled `end` when it did not: a self-loop with no label reads as a
 * mistake rather than as leaving.
 */
export function planArrow(arrow) {
    if (arrow.to.id === '*') {
        return {
            from: arrow.from,
            to: arrow.from,
            label: arrow.label === '' ? 'end' : arrow.label,
            // Leaving is drawn dashed, which is the same statement the Mermaid adapter makes for its end marker.
            dashed: true,
            exit: true,
        };
    }
    return {
        from: arrow.from,
        to: arrow.to,
        label: arrow.label,
        ...(arrow.dashed ? { dashed: true } : {}),
        arrow: arrow.arrow,
        exit: false,
    };
}

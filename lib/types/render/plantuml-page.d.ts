/**
 * The lines that describe the page rather than its contents: a title, header, footer or caption, a direction, a delivery size, a
 * background colour, a skinparam.
 *
 * Each is one line in and one decision out - which field it sets, or what the reader is told when it cannot be honoured. The parser
 * applies the decision; nothing here touches a diagram, so every rule below can be asked its own question.
 */
export type PageLine = 
/** `title X` names the drawing. */
{
    kind: 'title';
    text: string;
}
/** `header X` and its two siblings: page text in the source's own words. */
 | {
    kind: 'pageText';
    field: 'header' | 'footer' | 'sourceCaption';
    text: string;
}
/** `left to right direction` turns the drawing. */
 | {
    kind: 'direction';
}
/** `scale N` is a delivery size, not a layout. */
 | {
    kind: 'scale';
    factor: number;
}
/** `skinparam backgroundColor` is paper, not arrangement. */
 | {
    kind: 'background';
    value: string;
}
/** A line that is read and dropped with its reason, or refused. */
 | {
    kind: 'note';
    channel: 'ignored' | 'refused';
    message: string;
};
/** The range a delivery size may take: smaller is unreadable, larger is a poster. */
export declare const SCALE_RANGE: {
    readonly min: 0.5;
    readonly max: 8;
};
/**
 * The decision for one page line, or `undefined` when the line is not one.
 *
 * `where` is the line prefix the reader is given, so a refusal names the line it came from.
 */
export declare function readPageLine(line: string, where: string): PageLine | undefined;

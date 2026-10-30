/**
 * An annotation: the reader points at a node in a drawing and says something about it.
 *
 * The note has to reach the session as an ordinary message, because the session log is the only record a
 * replay, a fork or a resumed agent can rebuild from. Two transports can carry it, and they consume the
 * same text: a host command that turns the note into a follow-up (planned; the interface is
 * `annotationMessage`), and the composer, which hands the text to the reader's own input box (works today).
 *
 * Splitting the text from the transport is what keeps the two interchangeable, and what lets this module be
 * tested without a browser.
 */
/** What the reader said, and where. */
export interface Annotation {
    /** The node's id, as it appears in the markup the renderer wrote. */
    nodeId: string;
    /** The node's label, when it differs from the id: a reader points at words, not at identifiers. */
    label?: string;
    /** The note itself. Empty is meaningful: the reader marked the node and said nothing. */
    note?: string;
    /** Which drawing, when the reader is looking at more than one. A single source line is enough. */
    caption?: string;
}
/**
 * The text that travels to the session: what was marked, and what was said, and nothing invented.
 *
 * A blank note is not dropped - it says the node was marked - because "the reader pointed here" and "the
 * reader pointed here and said this" are different messages, and only one of them survives a silent trim.
 */
/**
 * The text that travels to the session: what was marked, what was said, and nothing invented.
 *
 * One message for N notes, with a fixed opening so both the reader and the model know what they are looking
 * at: a note arrives without the picture, so the block says what it is about, which drawing, and that every
 * numbered item is a separate answer. The shape follows the annotation plugin this harness already ships -
 * an opening sentence, numbered items, a question line - and it stays English: this is protocol between
 * reader and model, not interface chrome that follows the page's language.
 *
 * Plain lines, not a markdown quote: the reader's bubble is rendered as one text node, so a quote never
 * becomes a quote there - it would only show its own `>` characters. The bubble is folded afterwards.
 * A blank note is not dropped: 'marked, no note' and 'marked with this note' are different messages.
 */
export declare function annotationBlock(annotations: Annotation[]): string;
/** One annotation, in the same block shape: a caller with a single note should not get a second format. */
export declare function annotationMessage(annotation: Annotation): string;
/** The parts of the page this module touches, so the client bundle needs no DOM lib and a test can fake them. */
export interface ElementLike {
    value?: unknown;
    querySelector?: (selector: string) => unknown;
    textContent?: unknown;
    focus?: () => void;
    dispatchEvent?: (event: unknown) => boolean;
    getAttribute?: (name: string) => string | null;
    tagName?: unknown;
}
export interface DocumentLike {
    querySelector: (selector: string) => unknown;
    querySelectorAll?: (selector: string) => ArrayLike<unknown>;
}
export declare function findComposer(doc: DocumentLike | undefined): ElementLike | undefined;
/**
 * What the page has, for a status line: a probe with no console needs one place to report from.
 *
 * Counts only. A reader's draft is never read into the report.
 */
export declare function pageCensus(doc: DocumentLike | undefined): string;
/** What a write did, so the caller can say something true instead of something hopeful. */
export type Placed = 'filled' | 'no-composer';
/**
 * Add the text to the composer, above whatever the reader has already typed.
 *
 * Appending rather than replacing is the only behavior that cannot lose work: a reader who was halfway
 * through a message and clicked an annotation should find both halves in the box, not the annotation alone.
 */
export declare function fillComposer(doc: DocumentLike | undefined, text: string): Placed;
/** Whether the page can take a Return key for the composer at all, so a button may promise it. */
export declare function submitComposer(doc: DocumentLike | undefined): boolean;
/**
 * One note, two actions.
 *
 * Returns the sentence to show the reader: `sent` and `the box was not there` are different outcomes, and a
 * button that reports the wrong one is worse than no button. The text is appended above a half-written draft,
 * never in place of it.
 */
export declare function pushNote(document: DocumentLike | undefined, picked: {
    id: string;
} | null, note: string, caption: string, submit: boolean): string;
/**
 * The session a page is showing, read from its own address.
 *
 * The client services expose no "current session", and a slot's props are not guaranteed to carry one, but the
 * page has to name the session in its URL to survive a reload - so the address is the one source that is always
 * there. Both spellings are accepted: the `session-<uuid>` id this Harness mints and a bare uuid.
 */
export declare function sessionFromLocation(location: {
    pathname?: string;
    search?: string;
    hash?: string;
} | undefined): string | undefined;
/**
 * Put a whole annotation block in the composer, and say what happened.
 *
 * The block is one message for N notes: the model is told to answer each item, and the reader's input box sees
 * the structured text rather than N raw fragments. The same failure vocabulary as a single note.
 */
export declare function pushBlock(document: DocumentLike | undefined, annotations: Annotation[], caption: string, submit: boolean): string;
export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}
/** Where the reader's input box is, for a widget that has to sit right above it. */
export declare function composerRect(doc: DocumentLike | undefined): Rect | undefined;
/**
 * Put the block above what the reader has already typed, and say what happened.
 *
 * Above, because the annotations introduce the message: the reader's own words are the point, and a block
 * appended after them reads as an afterthought. A rich editor has no portable way to insert at the start, so
 * it takes the same path as an empty box - the block becomes the message and the reader's text follows it.
 */
export declare function prependBlock(document: DocumentLike | undefined, annotations: Annotation[], caption: string): string;

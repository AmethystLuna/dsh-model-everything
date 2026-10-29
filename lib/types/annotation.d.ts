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
export declare function annotationMessage(annotation: Annotation): string;
/** The parts of the page this module touches, so the client bundle needs no DOM lib and a test can fake them. */
export interface ElementLike {
    value?: unknown;
    textContent?: unknown;
    focus?: () => void;
    dispatchEvent?: (event: unknown) => boolean;
    getAttribute?: (name: string) => string | null;
    tagName?: unknown;
}
export interface DocumentLike {
    querySelector: (selector: string) => unknown;
}
export declare function findComposer(doc: DocumentLike | undefined): ElementLike | undefined;
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

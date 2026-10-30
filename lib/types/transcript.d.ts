/**
 * What an annotation message looks like after it has been sent.
 *
 * The message is one block of plain lines: a fixed opening, numbered items, a question line, then the reader's
 * own words. That is the right thing for the model and the wrong thing to read as a human - the reader wrote one
 * note about one node, and what landed is a page of protocol.
 *
 * The host renders a user message as one text node, not as markdown, so there is nothing to address by tag: the
 * decorator finds the element whose text starts with the block's opening line, cuts the block out of that text and
 * leaves the reader's question with a chip that can put the block back. This is the same trade the shipped
 * annotation plugin makes, and it is the only hook a bundle has on a message it did not render.
 *
 * Everything here is defensive: a page without the elements, an element without text, an element already handled.
 * A decorator that throws would take a render pass with it.
 */
/** The first words of every annotation block, used to recognise one in the transcript. */
export declare const TRANSCRIPT_MARKER = "Diagram annotations -";
export interface TranscriptNode {
    textContent?: string | null;
    style?: Record<string, string | undefined>;
    setAttribute?: (name: string, value: string) => void;
    getAttribute?: (name: string) => string | null;
    removeAttribute?: (name: string) => void;
    addEventListener?: (type: string, handler: () => void) => void;
    querySelector?: (selector: string) => TranscriptNode | null;
    appendChild?: (node: TranscriptNode) => unknown;
    parentNode?: {
        insertBefore?: (node: TranscriptNode, before: TranscriptNode) => unknown;
    } | null;
}
export interface TranscriptDocument {
    querySelectorAll?: (selector: string) => ArrayLike<TranscriptNode>;
    createElement?: (tag: string) => TranscriptNode;
}
/** The count in the opening line, for the chip; null when the line says something unexpected. */
export declare function annotationCountOf(text: string): number | null;
/** The reader's own words: what follows the question line, or nothing when the note was the whole message. */
export declare function questionOf(text: string): string;
/**
 * Fold every annotation message in the transcript behind its count, and answer how many were folded.
 *
 * Idempotent: an element that already carries the marker is skipped, so the observer can call this on every
 * change without stacking chips. Only the deepest element carrying the marker is touched, because a container
 * would take the rest of the conversation with it.
 */
export declare function decorateTranscript(doc: TranscriptDocument | undefined, label?: string): number;
/**
 * Fold now, and again whenever the conversation changes.
 *
 * A sent message is rendered by the host, not by this plugin, so watching is the only way to act on it. The
 * observer is coalesced by the browser and the work is idempotent, so a busy transcript costs a scan per change.
 */
export declare function startTranscriptDecoration(doc: TranscriptDocument | undefined, label?: string): () => void;

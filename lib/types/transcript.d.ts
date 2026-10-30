/**
 * What an annotation message looks like after it has been sent.
 *
 * The message is one markdown quote: a fixed opening line, numbered items, a question line. That is the right
 * thing for the model to read and the wrong thing to read as a human: the reader wrote a note about a node, and
 * what landed in the conversation is a page of protocol. So the quote is folded away and a small count takes its
 * place - the same trade the annotation plugin makes, done against the markdown the host already renders, which
 * is the only hook a plugin bundle has on a sent message.
 *
 * Everything here is defensive: a page without the elements, an element without a parent, a chip that was already
 * inserted. A decorator that throws would take a render pass with it.
 */
/** The first words of every annotation block, used to recognise one in the transcript. */
export declare const TRANSCRIPT_MARKER = "Diagram annotations -";
export interface TranscriptNode {
    textContent?: string | null;
    style?: Record<string, string | undefined>;
    setAttribute?: (name: string, value: string) => void;
    getAttribute?: (name: string) => string | null;
    addEventListener?: (type: string, handler: () => void) => void;
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
/**
 * Fold every annotation quote in the transcript behind its count, and answer how many were folded.
 *
 * Idempotent: a quote that already carries the marker is skipped, so the mutation observer can call this on every
 * change without stacking chips. Clicking a chip puts the protocol back - the reader may want to see what was sent.
 */
export declare function decorateTranscript(doc: TranscriptDocument | undefined, label?: string): number;
/**
 * Fold now, and again whenever the conversation changes.
 *
 * A sent message is rendered by the host, not by this plugin, so the only way to act on it is to watch. The
 * observer is coalesced by the browser and the work is idempotent, so a busy transcript costs a scan per change,
 * not a scan per node.
 */
export declare function startTranscriptDecoration(doc: TranscriptDocument | undefined, label?: string): () => void;

/**
 * What an annotation message looks like after it has been sent.
 *
 * The message is one block of plain lines: a fixed opening, numbered items, a question line, then the reader's
 * own words. That is the right thing for the model and the wrong thing to read as a human - the reader wrote one
 * note about one node, and what landed is a page of protocol.
 *
 * The host renders a user message as text inside elements it owns and re-renders. So this never assigns an
 * element's text: that deletes its children, React reconciles from a tree that no longer matches, and whole
 * turns come back mangled. It edits the text NODES instead - trim the run before the cut, remove the runs that
 * held the block - and puts the chip in as a sibling, exactly the way the shipped annotation plugin does it.
 *
 * Everything here is defensive: a page without the elements, an element without text nodes, an element already
 * handled. A decorator that throws would take a render pass with it.
 */
/** The first words of every annotation block, used to recognise one in the transcript. */
export declare const TRANSCRIPT_MARKER = "Diagram annotations -";
export interface TranscriptNode {
    nodeType?: number;
    nodeValue?: string | null;
    textContent?: string | null;
    style?: Record<string, string | undefined>;
    setAttribute?: (name: string, value: string) => void;
    getAttribute?: (name: string) => string | null;
    addEventListener?: (type: string, handler: () => void) => void;
    querySelectorAll?: (selector: string) => ArrayLike<TranscriptNode>;
    getBoundingClientRect?: () => {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    closest?: (selector: string) => TranscriptNode | null;
    childNodes?: ArrayLike<TranscriptNode>;
    nextSibling?: TranscriptNode | null;
    appendChild?: (node: TranscriptNode) => unknown;
    removeChild?: (node: TranscriptNode) => unknown;
    parentNode?: {
        insertBefore?: (node: TranscriptNode, before: TranscriptNode | null) => unknown;
        removeChild?: (node: TranscriptNode) => unknown;
    } | null;
}
export interface TranscriptDocument {
    querySelectorAll?: (selector: string) => ArrayLike<TranscriptNode>;
    createElement?: (tag: string) => TranscriptNode;
}
/** One note as the block states it. */
export interface AnnotationItem {
    index: number;
    node: string;
    note: string;
}
/** The count in the opening line, for the chip; null when the line says something unexpected. */
export declare function annotationCountOf(text: string): number | null;
/** The reader's own words: what follows the question line, or nothing when the note was the whole message. */
export declare function questionOf(text: string): string;
/** The notes the block carries, read back out of its lines, so a reader sees what the model saw. */
export declare function itemsOf(text: string): AnnotationItem[];
/**
 * Drop everything before the cut from the text nodes, and leave the reader's own words.
 *
 * The nodes are the only thing written: an element's `textContent` would take its child elements with it.
 */
export declare function cutTextNodes(nodes: TranscriptNode[], cut: number): boolean;
/** Kept for the tests that assert the selector exists; the ancestor walk is deliberately not used. */
export declare const FOREIGN_SELECTOR = "[data-annotation-for-dsh], [data-annotation-overlay], [data-annotation-chip], [data-annotation-tip-layer]";
/**
 * Fold every annotation message in the transcript behind its count, and answer how many were folded.
 *
 * Idempotent: an element that already carries the marker is skipped, so the observer can call this on every
 * change without stacking chips. Only the element whose text is the message is touched, and only its text nodes.
 */
export declare function decorateTranscript(doc: TranscriptDocument | undefined, label?: string, title?: string): number;
/**
 * One pass, and nothing that keeps running.
 *
 * There is deliberately no observer and no timer here. Both were tried: an observer over the document plus a
 * one-second interval turns every DOM change into a full selector scan, and a streaming conversation changes the
 * DOM many times a second - the container stopped responding. A caller that wants the fold has to decide when
 * to run it, on a container it chose.
 */
export declare function startTranscriptDecoration(doc: TranscriptDocument | undefined, label?: string, title?: string): () => void;

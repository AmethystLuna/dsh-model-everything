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
export const TRANSCRIPT_MARKER = 'Diagram annotations -';
/** Marks a quote the decorator has already handled, so a re-render cannot produce two chips. */
const HANDLED = 'data-dme-annotated';
/** The count in the opening line, for the chip; null when the line says something unexpected. */
export function annotationCountOf(text) {
    const found = /Diagram annotations - (\d+)/.exec(text);
    return found === null ? null : Number(found[1]);
}
/**
 * Fold every annotation quote in the transcript behind its count, and answer how many were folded.
 *
 * Idempotent: a quote that already carries the marker is skipped, so the mutation observer can call this on every
 * change without stacking chips. Clicking a chip puts the protocol back - the reader may want to see what was sent.
 */
export function decorateTranscript(doc, label = 'Notes') {
    if (doc === undefined || typeof doc.querySelectorAll !== 'function')
        return 0;
    let folded = 0;
    let quotes;
    try {
        quotes = doc.querySelectorAll('blockquote');
    }
    catch {
        return 0;
    }
    for (let index = 0; index < quotes.length; index += 1) {
        const quote = quotes[index];
        const text = typeof quote.textContent === 'string' ? quote.textContent : '';
        if (text.indexOf(TRANSCRIPT_MARKER) === -1)
            continue;
        if (quote.getAttribute?.(HANDLED) === '1')
            continue;
        const insert = quote.parentNode?.insertBefore;
        const chip = doc.createElement?.('div');
        if (insert === undefined || chip === undefined)
            continue;
        const count = annotationCountOf(text);
        chip.textContent = label + (count === null ? '' : ' ×' + String(count));
        chip.setAttribute?.(HANDLED, '1');
        chip.setAttribute?.('role', 'button');
        chip.style = {
            display: 'inline-block', margin: '2px 0', padding: '0 6px', fontSize: '11px', lineHeight: '18px',
            borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.35))',
            color: 'var(--dsw-alias-label-secondary, GrayText)', cursor: 'pointer',
        };
        if (quote.style !== undefined)
            quote.style.display = 'none';
        chip.addEventListener?.('click', () => {
            if (quote.style === undefined)
                return;
            quote.style.display = quote.style.display === 'none' ? '' : 'none';
        });
        try {
            insert.call(quote.parentNode, chip, quote);
            quote.setAttribute?.(HANDLED, '1');
            folded += 1;
        }
        catch {
            // A page that refuses the insert keeps the plain quote, which is readable on its own.
        }
    }
    return folded;
}
/**
 * Fold now, and again whenever the conversation changes.
 *
 * A sent message is rendered by the host, not by this plugin, so the only way to act on it is to watch. The
 * observer is coalesced by the browser and the work is idempotent, so a busy transcript costs a scan per change,
 * not a scan per node.
 */
export function startTranscriptDecoration(doc, label = 'Notes') {
    decorateTranscript(doc, label);
    const Observer = globalThis.MutationObserver;
    if (doc === undefined || Observer === undefined)
        return () => { };
    let watcher;
    try {
        const observer = new Observer(() => { decorateTranscript(doc, label); });
        observer.observe(doc, { childList: true, subtree: true });
        watcher = observer;
    }
    catch {
        return () => { };
    }
    return () => { watcher?.disconnect(); };
}

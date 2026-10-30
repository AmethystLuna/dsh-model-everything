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
export const TRANSCRIPT_MARKER = 'Diagram annotations -';
/** Where the block hands over to the reader's own question. */
const QUESTION = 'Question:';
/** Marks an element the decorator has handled, and remembers the block it came from. */
const HANDLED = 'data-dme-annotated';
const ORIGINAL = 'data-dme-annotation-text';
/** Elements whose text can be the message. Nested containers are excluded by the descendant test below. */
const SELECTOR = 'div, p, span, li';
/**
 * Another plugin's territory, which this one must never touch.
 *
 * The shipped annotation plugin marks its own nodes `data-annotation-*` and folds its own blocks by their own
 * markers. Two plugins doing DOM work in the same transcript collide in exactly three ways: they fight over the
 * same message element, they overwrite each other's chip, and they both react to the other's mutations. The
 * rules this file follows, and that a future change here has to keep:
 *
 * 1. only our own marker starts work - `Diagram annotations -`, never a generic word like "annotation";
 * 2. every attribute we add is `data-dme-*`, and anything already carrying `data-annotation-*` is skipped;
 * 3. our inserted nodes carry `data-dme-own`, so a neighbouring plugin can skip them as easily as we skip its;
 * 4. one pass over a message, marked, so a second plugin's re-render cannot make us fold the same block twice.
 *
 * The draft is the fourth surface: both plugins write it through the host's `setDraft`, and a blind overwrite
 * would drop the other's block. `placeBlock` re-reads the draft immediately before writing and prepends,
 * keeping the rest verbatim - never a replace.
 */
const FOREIGN = '[data-annotation-for-dsh], [data-annotation-overlay], [data-annotation-chip], [data-annotation-tip-layer]';
const BORDER = '1px solid var(--dsw-alias-border-l1, rgba(127,127,127,0.35))';
/** The count in the opening line, for the chip; null when the line says something unexpected. */
export function annotationCountOf(text) {
    const found = /Diagram annotations - (\d+)/.exec(text);
    return found === null ? null : Number(found[1]);
}
/** The reader's own words: what follows the question line, or nothing when the note was the whole message. */
export function questionOf(text) {
    const at = text.lastIndexOf(QUESTION);
    return at === -1 ? '' : text.slice(at + QUESTION.length).trim();
}
/** The notes the block carries, read back out of its lines, so a reader sees what the model saw. */
export function itemsOf(text) {
    const items = [];
    for (const raw of text.split(String.fromCharCode(10))) {
        const line = raw.trim();
        const head = /^(\d+)\. node (.+)$/.exec(line);
        if (head !== null) {
            items.push({ index: Number(head[1]), node: head[2], note: '' });
            continue;
        }
        const note = /^Note: (.*)$/.exec(line);
        if (note !== null && items.length > 0)
            items[items.length - 1].note = note[1];
    }
    return items;
}
/** Every text node inside an element, in document order. */
function textNodesOf(root) {
    const out = [];
    const visit = (node) => {
        const children = node.childNodes;
        if (children === undefined || children === null || children.length === 0) {
            if (typeof node.nodeValue === 'string')
                out.push(node);
            return;
        }
        for (let index = 0; index < children.length; index += 1)
            visit(children[index]);
    };
    visit(root);
    return out;
}
/**
 * Drop everything before the cut from the text nodes, and leave the reader's own words.
 *
 * The nodes are the only thing written: an element's `textContent` would take its child elements with it.
 */
export function cutTextNodes(nodes, cut) {
    let position = 0;
    let done = false;
    for (const node of nodes) {
        const value = typeof node.nodeValue === 'string' ? node.nodeValue : '';
        const length = value.length;
        if (done) {
            position += length;
            continue;
        }
        if (cut <= position + length) {
            node.nodeValue = value.slice(cut - position).replace(/^\s+/, '');
            done = true;
        }
        else {
            node.nodeValue = '';
        }
        position += length;
    }
    return done;
}
/** Whether another plugin owns this node, or any of its ancestors. */
function isForeign(node) {
    const inside = node.closest?.(FOREIGN);
    if (inside !== undefined && inside !== null)
        return true;
    const marked = node.getAttribute?.('data-annotation-for-dsh');
    return marked !== undefined && marked !== null;
}
function holdsAnotherBlock(node) {
    const inner = node.querySelectorAll?.(SELECTOR);
    if (inner === undefined || inner === null)
        return false;
    for (let index = 0; index < inner.length; index += 1) {
        const text = inner[index].textContent;
        if (typeof text === 'string' && text.indexOf(TRANSCRIPT_MARKER) !== -1)
            return true;
    }
    return false;
}
/** The card listing the notes, styled from the host's tokens so it reads as part of the page. */
function cardFor(doc, items, title, full) {
    const card = doc.createElement?.('div');
    if (card === undefined)
        return undefined;
    card.style = {
        position: 'fixed', zIndex: '40', display: 'none', maxWidth: '360px', padding: '8px 10px', borderRadius: '10px',
        background: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, Canvas))',
        border: BORDER, boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
        color: 'var(--dsw-alias-label-primary, CanvasText)', font: '12px system-ui, sans-serif',
    };
    const head = doc.createElement?.('div');
    if (head !== undefined) {
        head.textContent = title;
        head.style = {
            color: 'var(--dsw-alias-label-secondary, GrayText)', paddingBottom: '6px', marginBottom: '4px',
            borderBottom: BORDER, fontSize: '11px',
        };
        card.appendChild?.(head);
    }
    for (const item of items) {
        const row = doc.createElement?.('div');
        if (row === undefined)
            continue;
        row.style = { display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '3px 0' };
        const badge = doc.createElement?.('span');
        if (badge !== undefined) {
            badge.textContent = String(item.index);
            badge.style = {
                flex: '0 0 auto', width: '16px', height: '16px', lineHeight: '16px', textAlign: 'center',
                borderRadius: '8px', fontSize: '10px',
                background: 'var(--dsw-alias-brand-primary, #2563eb)', color: '#fff',
            };
            row.appendChild?.(badge);
        }
        const body = doc.createElement?.('div');
        if (body !== undefined) {
            body.textContent = item.node + (item.note === '' ? '' : String.fromCharCode(10) + item.note);
            body.style = { flex: '1 1 auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
            row.appendChild?.(body);
        }
        card.appendChild?.(row);
    }
    const more = doc.createElement?.('div');
    if (more !== undefined) {
        more.textContent = full;
        more.style = {
            display: 'none', marginTop: '6px', paddingTop: '6px', borderTop: BORDER, fontSize: '11px',
            whiteSpace: 'pre-wrap', color: 'var(--dsw-alias-label-secondary, GrayText)', maxHeight: '40vh', overflow: 'auto',
        };
        card.appendChild?.(more);
    }
    return card;
}
function chipFor(doc, label, title, text) {
    const chip = doc.createElement?.('div');
    if (chip === undefined)
        return undefined;
    chip.textContent = label;
    chip.setAttribute?.('role', 'button');
    // A pill that sits in the reader's line, not a block that pushes it: the conversation is theirs, and the chip
    // is a footnote to it.
    chip.style = {
        display: 'inline-flex', alignItems: 'center', height: '20px', padding: '0 8px', margin: '4px 0 0',
        fontSize: '11px', lineHeight: '20px', borderRadius: '10px', verticalAlign: 'middle', userSelect: 'none',
        border: BORDER, background: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.10))',
        color: 'var(--dsw-alias-label-secondary, GrayText)', cursor: 'pointer', maxWidth: '100%',
    };
    const card = cardFor(doc, itemsOf(text), title, text);
    if (card === undefined)
        return chip;
    const place = () => {
        const box = chip.getBoundingClientRect?.();
        const next = { ...(card.style ?? {}), display: 'block' };
        if (box !== undefined) {
            next.left = String(Math.max(8, box.left)) + 'px';
            next.top = String(box.top + box.height + 6) + 'px';
        }
        card.style = next;
    };
    const hide = () => { card.style = { ...(card.style ?? {}), display: 'none' }; };
    chip.addEventListener?.('mouseenter', place);
    chip.addEventListener?.('mouseleave', hide);
    chip.addEventListener?.('click', () => {
        if ((card.style ?? {}).display === 'block') {
            hide();
        }
        else {
            place();
        }
    });
    // The card travels with the chip, so a bubble that re-renders cannot leave one behind.
    chip.appendChild?.(card);
    return chip;
}
/**
 * Fold every annotation message in the transcript behind its count, and answer how many were folded.
 *
 * Idempotent: an element that already carries the marker is skipped, so the observer can call this on every
 * change without stacking chips. Only the element whose text is the message is touched, and only its text nodes.
 */
export function decorateTranscript(doc, label = 'Notes', title = 'Notes in this message') {
    if (doc === undefined || typeof doc.querySelectorAll !== 'function')
        return 0;
    let nodes;
    try {
        nodes = doc.querySelectorAll(SELECTOR);
    }
    catch {
        return 0;
    }
    let folded = 0;
    for (let index = 0; index < nodes.length; index += 1) {
        const element = nodes[index];
        const text = typeof element.textContent === 'string' ? element.textContent : '';
        if (!text.includes(TRANSCRIPT_MARKER))
            continue;
        if (element.getAttribute?.(HANDLED) === '1')
            continue;
        // Another plugin's node: it may be folding its own block in the same message, and two folders would take
        // turns rewriting each other's text.
        if (isForeign(element))
            continue;
        if (holdsAnotherBlock(element))
            continue;
        const texts = textNodesOf(element);
        if (texts.length === 0)
            continue;
        const joined = texts.map((node) => (typeof node.nodeValue === 'string' ? node.nodeValue : '')).join('');
        if (!joined.includes(TRANSCRIPT_MARKER))
            continue;
        const at = joined.lastIndexOf(QUESTION);
        const cut = at === -1 ? joined.length : at + QUESTION.length;
        const count = annotationCountOf(joined);
        const chip = chipFor(doc, label + (count === null ? '' : ' ×' + String(count)), title, joined);
        if (chip === undefined)
            continue;
        try {
            if (!cutTextNodes(texts, cut))
                continue;
            element.setAttribute?.(ORIGINAL, joined);
            element.setAttribute?.(HANDLED, '1');
            const parent = element.parentNode;
            if (parent?.insertBefore !== undefined)
                parent.insertBefore(chip, element.nextSibling ?? null);
            else
                element.appendChild?.(chip);
            folded += 1;
        }
        catch {
            // A page that refuses the write keeps the plain message, which reads on its own.
        }
    }
    return folded;
}
/**
 * One pass, and nothing that keeps running.
 *
 * There is deliberately no observer and no timer here. Both were tried: an observer over the document plus a
 * one-second interval turns every DOM change into a full selector scan, and a streaming conversation changes the
 * DOM many times a second - the container stopped responding. A caller that wants the fold has to decide when
 * to run it, on a container it chose.
 */
export function startTranscriptDecoration(doc, label = 'Notes', title = 'Notes in this message') {
    decorateTranscript(doc, label, title);
    return () => { };
}

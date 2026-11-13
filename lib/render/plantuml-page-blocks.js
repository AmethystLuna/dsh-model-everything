/**
 * The blocks whose lines are not diagram source: a legend, page text, a block title, a note, and the `/' ... '/` comment.
 *
 * They are collected before any line is read, because a block decides what the lines inside it mean - a note's body is one note, not four
 * statements. The walk itself is the shared one in `blocks.ts`; what differs is what a block is, which is each definition below.
 *
 * The one side effect is deliberate and old: a note's block is rewritten on its opening line into the one-line form the line parser
 * already reads, so a note is created by the same path whether it was written on one line or several.
 */
import { collectBlocks } from './blocks.js';
/**
 * Collect every block, rewriting the source where a block has a one-line form.
 *
 * `lines` is changed in place for notes only, and `skip` names the lines the reader of statements must not see.
 */
export function collectPageBlocks(lines) {
    const skip = new Set();
    const notes = [];
    const blocks = { legend: [], header: [], footer: [], sourceCaption: [] };
    const legendWalk = collectBlocks(lines, skip, {
        skipOpening: true,
        open: (line, index) => {
            if (!/^legend\b/.test(line))
                return undefined;
            const corner = /^legend\s+(left|right|top|bottom|center)/.exec(line);
            if (corner !== null && corner[1] !== 'bottom') {
                notes.push({
                    channel: 'ignored',
                    message: 'line ' + String(index + 1) + ': `' + line + '` asks for a corner: this renderer puts the legend under the drawing',
                });
            }
            return { text: [] };
        },
        closes: (line) => /^end\s*legend\b/.test(line),
        text: (state, line) => { state.text.push(line); },
        close: (state) => { blocks.legend.push(...state.text); },
    });
    // The page text's block form. A one-line statement is the same block with one line in it, and the line form is read by the parser, so
    // this walk only handles the form that spans lines.
    const pageWalk = collectBlocks(lines, skip, {
        skipOpening: true,
        open: (line) => {
            const opener = /^(header|footer|caption)\s*$/.exec(line);
            if (opener === null)
                return undefined;
            const keyOf = { header: 'header', footer: 'footer', caption: 'sourceCaption' };
            return { key: keyOf[opener[1]] };
        },
        closes: (line, state) => new RegExp('^end\\s*' + (state.key === 'sourceCaption' ? 'caption' : state.key) + '\\b').test(line),
        text: (state, line) => { blocks[state.key].push(line); },
        close: () => { },
    });
    /// `/' ... '/` is PlantUML's block comment: a body whose lines are not diagram source, and refusing them line by line would make a
    // comment look like a defect.
    collectBlocks(lines, skip, {
        skipOpening: true,
        open: (line) => (/^\/'/.test(line) ? { closed: false } : undefined),
        closes: (line) => /'\s*\/$/.test(line),
        text: () => { },
        close: () => { },
    });
    const titleWalk = collectBlocks(lines, skip, {
        skipOpening: true,
        open: (line, index) => (line === 'title' ? { index, text: [] } : undefined),
        closes: (line) => /^end\s*title\b/.test(line),
        text: (state, line) => { state.text.push(line); },
        close: (state) => { blocks.title = state.text.join('\n'); },
    });
    const noteWalk = collectBlocks(lines, skip, {
        open: (line, index) => {
            const placed = /^note\s+(left|right|top|bottom)\s+of\s+([^:]+)$/.exec(line);
            if (placed !== null)
                return { index, kind: 'placed', side: placed[1], target: placed[2], text: [] };
            const named = /^note\s+as\s+([A-Za-z_][\w-]*)\s*$/.exec(line);
            if (named !== null)
                return { index, kind: 'named', side: '', target: named[1], text: [] };
            return undefined;
        },
        closes: (line) => /^end\s*note\b/.test(line),
        text: (state, line) => { state.text.push(line); },
        close: (state, all, openedAt) => {
            const words = state.text.join(' ').replace(/"/g, '');
            all[openedAt] =
                state.kind === 'placed'
                    ? 'note ' + state.side + ' of ' + state.target + ' : ' + words
                    : 'note "' + words + '" as ' + state.target;
        },
    });
    // A block whose closing line is missing swallows the rest of the source. Saying nothing there is the worst answer of all: the drawing
    // comes out nearly empty and looks deliberate.
    for (const walk of [legendWalk, pageWalk]) {
        if (walk === undefined)
            continue;
        notes.push({
            channel: 'refused',
            message: 'line ' + String(walk.openedAt + 1) + ': this block is never closed, so the lines after it were not read as a drawing',
        });
    }
    // A placed note that is never closed is one mistake, not two: the line names no text *and* the block has no end, and the reader needs
    // one sentence. The opener is skipped so the line parser does not add its own version of the same news.
    if (titleWalk !== undefined)
        blocks.title = titleWalk.state.text.join('\n');
    if (noteWalk !== undefined) {
        skip.add(noteWalk.openedAt);
        notes.push({
            channel: 'refused',
            message: 'line ' + String(noteWalk.openedAt + 1) + ': `' + lines[noteWalk.openedAt].trim() + '` is never closed, and it names no text of its own',
        });
    }
    return { blocks, skip, notes };
}

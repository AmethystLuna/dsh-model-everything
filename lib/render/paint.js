/**
 * Geometry: what a diagram turns into, in coordinates.
 *
 * A drawing has to survive three containers - inline in a conversation, full-screen, and a persistent
 * sidebar tab - so nothing here knows about pixel size. It emits a content-sized canvas and lets the
 * container scale it: the same numbers serve a 360px card and a 1200px whiteboard, because SVG scales and
 * text is measured in the units the boxes are.
 *
 * The rules that make it readable, in the order they matter:
 *
 * - every state is a box of its own width, so a long id is not clipped by a fixed 120px;
 * - a forward edge is a straight vertical line, because that is what reads as "next";
 * - a back edge leaves to a side channel and returns from the same side, so it never crosses the boxes it
 *   jumps over;
 * - a self loop is a small loop on the right, not a line to itself;
 * - an edge label sits beside its own segment, never on top of a box;
 * - the caption is wrapped and the canvas is widened to fit it, so nothing is clipped at the right edge.
 *
 * Pure: a diagram in, shapes out, every decision assertable.
 */
import { rankStates } from './layout.js';
import { palette, roleForVerdict } from './palette.js';
import { labelOf } from './model.js';
/** Geometry constants in one place: a container with different proportions changes these, not the rules. */
const MARGIN = 20;
const TITLE_HEIGHT = 26;
const NODE_HEIGHT = 34;
const ROW_GAP = 58;
const COLUMN_GAP = 30;
const MIN_NODE_WIDTH = 88;
const MAX_NODE_WIDTH = 220;
const CHAR_WIDTH = 7.2;
const CHANNEL_GAP = 16;
const CAPTION_CHARS = 78;
const CAPTION_LINE = 15;
const CAPTION_GAP = 16;
const CAPTION_CHAR_WIDTH = 6.2;
const nodeWidth = (label) => Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, label.length * CHAR_WIDTH + 26));
/** Which colour a box earns from its role. One mapping, used by every container. */
export function roleOfNode(node) {
    if (node.role === 'error')
        return 'fail';
    if (node.role === 'warning')
        return 'findings';
    if (node.role === 'muted')
        return 'muted';
    return 'edge';
}
/** Wrap on spaces; break a token longer than the line rather than let it overflow the canvas. */
function wrap(text, limit) {
    const lines = [];
    let line = '';
    for (const word of text.split(/\s+/).filter((part) => part !== '')) {
        const candidate = line === '' ? word : line + ' ' + word;
        if (candidate.length <= limit) {
            line = candidate;
            continue;
        }
        if (line !== '')
            lines.push(line);
        line = '';
        let rest = word;
        while (rest.length > limit) {
            lines.push(rest.slice(0, limit));
            rest = rest.slice(limit);
        }
        line = rest;
    }
    if (line !== '')
        lines.push(line);
    return lines.length === 0 ? [''] : lines;
}
/** The colour a caption earns, read from the verdict it quotes. */
function captionRole(caption) {
    return roleForVerdict(caption.split(' — ')[0]);
}
export function paintWith(diagram, overrides = {}) {
    const colours = palette(overrides);
    const shapes = [];
    const ranked = rankStates(diagram.nodes, diagram.edges, diagram.init);
    const rows = [...ranked.rows];
    if (ranked.unreachable.length > 0)
        rows.push(ranked.unreachable);
    // Every drawn box has a row, including the block of unreachable states: an edge may start or end there.
    const rowOf = new Map();
    rows.forEach((row, index) => row.forEach((id) => rowOf.set(id, index)));
    const boxes = new Map();
    let widest = 0;
    rows.forEach((row, index) => {
        const widths = row.map((id) => nodeWidth(id));
        widest = Math.max(widest, widths.reduce((total, width) => total + width, 0) + Math.max(0, row.length - 1) * COLUMN_GAP);
        let x = 0;
        row.forEach((id, position) => {
            boxes.set(id, { x, y: index * (NODE_HEIGHT + ROW_GAP), width: widths[position], height: NODE_HEIGHT });
            x += widths[position] + COLUMN_GAP;
        });
    });
    // Centre every row on the widest, then shift the drawing by the margin.
    rows.forEach((row) => {
        const rowWidth = row.reduce((total, id) => total + boxes.get(id).width, 0) + Math.max(0, row.length - 1) * COLUMN_GAP;
        const offset = (widest - rowWidth) / 2;
        for (const id of row) {
            // Filled by the loop above for exactly these ids.
            const box = boxes.get(id);
            box.x += offset + MARGIN;
        }
    });
    const topOffset = MARGIN + TITLE_HEIGHT;
    for (const box of boxes.values())
        box.y += topOffset;
    const drawn = new Set();
    for (const node of diagram.nodes) {
        // A state id may repeat in a malformed model: the first placement wins and the repeat is skipped.
        if (drawn.has(node.id))
            continue;
        // Every id reaches a row: reachable ones from the walk, the rest from the block below it.
        const box = boxes.get(node.id);
        drawn.add(node.id);
        shapes.push({
            kind: 'box',
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            label: labelOf(node),
            colour: roleOfNode(node),
            initial: diagram.init === node.id,
        });
    }
    const roleById = new Map(diagram.nodes.map((node) => [node.id, roleOfNode(node)]));
    let channel = widest + MARGIN + CHANNEL_GAP;
    let channelUses = 0;
    for (const edge of diagram.edges) {
        const source = boxes.get(edge.from);
        const target = boxes.get(edge.to);
        if (source === undefined || target === undefined)
            continue;
        const sourceRow = rowOf.get(edge.from);
        const targetRow = rowOf.get(edge.to);
        const colour = roleById.get(edge.from);
        if (edge.from === edge.to) {
            // A self loop: out to the right, down, back in. Small, and never over another box.
            const x = source.x + source.width;
            const y = source.y + source.height / 2;
            shapes.push({
                kind: 'path',
                points: [
                    { x, y: y - 9 },
                    { x: x + 14, y: y - 9 },
                    { x: x + 14, y: y + 9 },
                    { x, y: y + 9 },
                ],
                label: edge.label,
                labelX: x + 20,
                labelY: y,
                colour,
            });
            continue;
        }
        if (targetRow > sourceRow) {
            // Forward: straight down, the shape a reader expects for "next".
            const x1 = source.x + source.width / 2;
            const y1 = source.y + source.height;
            const x2 = target.x + target.width / 2;
            const y2 = target.y;
            shapes.push({ kind: 'link', x1, y1, x2, y2, label: edge.label, labelX: (x1 + x2) / 2 + 7, labelY: (y1 + y2) / 2, colour });
            continue;
        }
        if (targetRow === sourceRow) {
            // Sideways within a row: right edge to left edge, label above the line.
            const right = source.x + source.width;
            const left = target.x;
            const y = source.y + source.height / 2;
            const forward = right <= left;
            shapes.push({
                kind: 'link',
                x1: forward ? right : source.x,
                y1: y,
                x2: forward ? left : target.x + target.width,
                y2: y,
                label: edge.label,
                labelX: (right + left) / 2,
                labelY: y - 7,
                colour,
            });
            continue;
        }
        // Backward: leave right, run down a lane clear of every box, come back in from the right.
        const lane = channel + (channelUses % 3) * 8;
        channelUses += 1;
        channel = Math.max(channel, lane);
        const startY = source.y + source.height / 2;
        const endY = target.y + target.height / 2;
        shapes.push({
            kind: 'path',
            points: [
                { x: source.x + source.width, y: startY },
                { x: lane, y: startY },
                { x: lane, y: endY },
                { x: target.x + target.width, y: endY },
            ],
            label: edge.label,
            labelX: lane + 6,
            labelY: (startY + endY) / 2,
            colour,
        });
    }
    shapes.push({ kind: 'title', x: MARGIN, y: MARGIN + 12, text: diagram.title, colour: 'text' });
    const contentRight = Math.max(MARGIN, ...[...boxes.values()].map((box) => box.x + box.width));
    const captionLines = wrap(diagram.caption, CAPTION_CHARS);
    const captionWidth = Math.max(...captionLines.map((line) => line.length * CAPTION_CHAR_WIDTH)) + MARGIN * 2;
    const width = Math.max(contentRight + MARGIN + (channelUses > 0 ? CHANNEL_GAP * 3 : 0), captionWidth, 240);
    const contentBottom = rows.length === 0 ? topOffset : topOffset + (rows.length - 1) * (NODE_HEIGHT + ROW_GAP) + NODE_HEIGHT;
    const captionTop = contentBottom + CAPTION_GAP;
    shapes.push({ kind: 'caption', x: MARGIN, y: captionTop, lines: captionLines, colour: captionRole(diagram.caption) });
    const height = captionTop + captionLines.length * CAPTION_LINE + MARGIN / 2;
    return { canvas: { width: Math.round(width), height: Math.round(height), shapes }, colours };
}
export function paint(diagram, overrides = {}) {
    return paintWith(diagram, overrides).canvas;
}

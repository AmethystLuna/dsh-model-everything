/**
 * Geometry: what a diagram turns into, in coordinates.
 *
 * A drawing has to survive three containers - inline in a conversation, full-screen, and a persistent
 * sidebar tab - so nothing here knows about pixel size. It emits a content-sized canvas and lets the
 * container scale it: the same numbers serve a 360px card and a 1200px whiteboard.
 *
 * Two placements, chosen by the source:
 *
 * - **layered** (no groups): breadth-first rows, forward edges dropping straight down, back edges on a side
 *   channel clear of every box, self loops as small loops. The shape a state machine wants.
 * - **tree** (groups present): a group is a block, its members stack inside it, a nested group is a block
 *   inside its parent, and the top level stacks. The shape an architecture diagram wants, because a package
 *   whose members float somewhere else on the page is not showing containment at all.
 *
 * Edges are placed from where the boxes ended up, so neither placement needs to tell the edge code which one
 * ran: "below" is a straight line, "beside" is horizontal, "above" routes around.
 *
 * Pure: a diagram in, shapes out, every decision assertable.
 */
import { MARGIN, place, textOf } from './place.js';
import { textWidth } from './text.js';
import { palette, roleForVerdict } from './palette.js';
import { labelOf } from './model.js';
/** Geometry constants in one place: a container with different proportions changes these, not the rules. */
const MIN_NODE_WIDTH = 88;
const MAX_NODE_WIDTH = 220;
const CHAR_WIDTH = 7.2;
const nodeWidth = (label) => Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, label.length * CHAR_WIDTH + 26));
const TITLE_HEIGHT = 26;
const NODE_HEIGHT = 34;
const CHANNEL_GAP = 16;
const CAPTION_CHARS = 78;
const CAPTION_LINE = 15;
const CAPTION_GAP = 16;
const CAPTION_CHAR_WIDTH = 6.2;
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
/**
 * Where an edge's label goes.
 *
 * A label dropped at the midpoint lands on a box as soon as the two ends are not vertically aligned - the defect a
 * reader sees as "text on top of a box". Graphviz solves it by making the label a node the layout must make room
 * for; without a layout that can do that, the label walks along its own edge and takes the first position that is
 * clear of every box, falling back to the midpoint when the whole edge is crowded.
 */
function placeLabel(label, from, to, boxes, placed = [], ordinal = 0, offsets = [
    { t: 0.5, dx: 0 },
    { t: 0.5, dx: 26 },
    { t: 0.5, dx: -26 },
    { t: 0.42, dx: 26 },
    { t: 0.58, dx: -26 },
    { t: 0.5, dx: 52 },
    { t: 0.5, dx: -52 },
    { t: 0.5, dx: 100 },
    { t: 0.5, dx: -100 },
    { t: 0.82, dx: 0 },
    { t: 0.18, dx: 0 },
    { t: 0.3, dx: 0 },
    { t: 0.7, dx: 0 },
]) {
    const width = textWidth(label);
    const height = 12;
    const hits = (x, y, w, other) => x - w / 2 < other.x + other.width + 3 && x + w / 2 > other.x - 3 && y < other.y + other.height + 3 && y + height > other.y - 3;
    const clear = (x, y, w) => {
        for (const box of boxes)
            if (hits(x, y, w, box))
                return false;
        for (const earlier of placed)
            if (hits(x, y, w, earlier))
                return false;
        return true;
    };
    // A second label on the same source moves along and down: the two describe different branches of one decision,
    // and stacking them is what made them unreadable.
    const centre = (x, y) => ({ x: x - width / 2, y });
    for (const candidate of offsets) {
        const x = from.x + (to.x - from.x) * candidate.t + candidate.dx;
        const y = from.y + (to.y - from.y) * candidate.t + ordinal * 14;
        if (clear(x, y, width))
            return centre(x, y);
    }
    return centre(from.x + (to.x - from.x) * 0.5, from.y + (to.y - from.y) * 0.5);
}
/** The furthest right and bottom point any shape reaches. */
function drawnExtent(shapes) {
    let width = 0;
    let height = 0;
    const consider = (x, y) => {
        if (x > width)
            width = x;
        if (y > height)
            height = y;
    };
    for (const shape of shapes) {
        switch (shape.kind) {
            case 'box':
            case 'group':
                consider(shape.x + shape.width, shape.y + shape.height);
                break;
            case 'link':
                consider(Math.max(shape.x1, shape.x2), Math.max(shape.y1, shape.y2));
                if (shape.label !== '')
                    consider(shape.labelX + textWidth(shape.label), shape.labelY + 12);
                break;
            case 'path': {
                for (const point of shape.points)
                    consider(point.x, point.y);
                if (shape.label !== '')
                    consider(shape.labelX + textWidth(shape.label), shape.labelY + 12);
                break;
            }
            case 'caption':
            case 'title':
                consider(textWidth(shape.lines?.[0] ?? '') + shape.x, shape.y + 12);
                break;
        }
    }
    return { width, height };
}
export function paintWith(diagram, overrides = {}, options = {}) {
    const colours = palette(overrides, options);
    const shapes = [];
    const groups = diagram.groups ?? [];
    const topOffset = MARGIN + TITLE_HEIGHT;
    const placement = place(diagram, topOffset);
    const { boxes, groupRects } = placement;
    // Boundaries first, so everything else is painted on top of them.
    for (const group of groups) {
        const rect = groupRects.get(group.id);
        if (rect === undefined)
            continue;
        shapes.push({ kind: 'group', id: group.id, x: rect.x, y: rect.y, width: rect.width, height: rect.height, label: group.label, colour: 'muted' });
    }
    const drawn = new Set();
    // A Map iterator is consumed by the first pass: collision checks need a list.
    const boxList = Array.from(boxes.values());
    const labelRects = [];
    const labelsFrom = new Map();
    for (const node of diagram.nodes) {
        // A state id may repeat in a malformed model: the first placement wins and the repeat is skipped.
        if (drawn.has(node.id))
            continue;
        const box = boxes.get(node.id);
        drawn.add(node.id);
        const text = textOf(node);
        shapes.push({
            kind: 'box',
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height,
            label: labelOf(node),
            lines: text.lines,
            colour: roleOfNode(node),
            initial: diagram.init === node.id,
        });
    }
    const roleById = new Map(diagram.nodes.map((node) => [node.id, roleOfNode(node)]));
    let channel = Math.max(placement.width, ...Array.from(boxes.values(), (box) => box.x + box.width)) + CHANNEL_GAP;
    let channelUses = 0;
    for (const edge of diagram.edges) {
        const source = boxes.get(edge.from);
        const target = boxes.get(edge.to);
        if (source === undefined || target === undefined)
            continue;
        const colour = roleById.get(edge.from);
        // Placement decided where things are; "below", "beside" and "above" are read from the result.
        const sameRow = Math.abs(target.y - source.y) < NODE_HEIGHT / 2;
        if (edge.from === edge.to) {
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
        if (target.y > source.y && !sameRow) {
            const x1 = source.x + source.width / 2;
            const y1 = source.y + source.height;
            const x2 = target.x + target.width / 2;
            const y2 = target.y;
            const ordinal = labelsFrom.get(edge.from) ?? 0;
            labelsFrom.set(edge.from, ordinal + 1);
            const spot = placeLabel(edge.label, { x: x1, y: y1 }, { x: x2, y: y2 }, boxList, labelRects, ordinal);
            labelRects.push({ x: spot.x, y: spot.y, width: textWidth(edge.label), height: 12 });
            shapes.push({ kind: 'link', x1, y1, x2, y2, label: edge.label, labelX: spot.x + textWidth(edge.label) / 2, labelY: spot.y, colour });
            continue;
        }
        if (sameRow) {
            const right = source.x + source.width;
            const left = target.x;
            const y = source.y + source.height / 2;
            const forward = right <= left;
            const spot = placeLabel(edge.label, { x: right, y }, { x: left, y }, boxList, labelRects);
            labelRects.push({ x: spot.x, y: spot.y, width: textWidth(edge.label), height: 12 });
            shapes.push({
                kind: 'link',
                x1: forward ? right : source.x,
                y1: y,
                x2: forward ? left : target.x + target.width,
                y2: y,
                label: edge.label,
                labelX: spot.x,
                labelY: spot.y - 7,
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
    const contentRight = Math.max(MARGIN, ...Array.from(boxes.values(), (box) => box.x + box.width), ...Array.from(groupRects.values(), (rect) => rect.x + rect.width));
    const captionLines = wrap(diagram.caption, CAPTION_CHARS);
    const captionWidth = Math.max(...captionLines.map((line) => line.length * CAPTION_CHAR_WIDTH)) + MARGIN * 2;
    const width = Math.max(contentRight + MARGIN + (channelUses > 0 ? CHANNEL_GAP * 3 : 0), captionWidth, 240);
    const contentBottom = Math.max(topOffset, ...Array.from(boxes.values(), (box) => box.y + box.height), ...Array.from(groupRects.values(), (rect) => rect.y + rect.height));
    const captionTop = contentBottom + CAPTION_GAP;
    shapes.push({ kind: 'caption', x: MARGIN, y: captionTop, lines: captionLines, colour: captionRole(diagram.caption) });
    const height = captionTop + captionLines.length * CAPTION_LINE + MARGIN / 2;
    // Everything drawn counts, including the parts that leave the box grid: an edge routed beside the drawing and a
    // label wider than the gap between two boxes were both cut off at the right edge.
    const extent = drawnExtent(shapes);
    const canvasWidth = Math.max(width, extent.width + MARGIN);
    const canvasHeight = Math.max(height, extent.height + MARGIN);
    return { canvas: { width: Math.round(canvasWidth), height: Math.round(canvasHeight), shapes }, colours };
}
export function paint(diagram, overrides = {}) {
    return paintWith(diagram, overrides).canvas;
}

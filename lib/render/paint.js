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
/** A boundary's inner padding and the strip its name sits in. */
const GROUP_PADDING = 10;
const GROUP_HEADER = 16;
/** Between two blocks stacked inside a boundary, and between two top-level blocks. */
const BLOCK_GAP = 14;
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
/** The layered placement: breadth-first rows, centred, no containment. */
function placeByRanks(diagram, nodes, top) {
    const ranked = rankStates(diagram.nodes, diagram.edges, diagram.init);
    const rows = [...ranked.rows];
    if (ranked.unreachable.length > 0)
        rows.push(ranked.unreachable);
    const boxes = new Map();
    let widest = 0;
    rows.forEach((row, index) => {
        const widths = row.map((id) => nodeWidth(id));
        widest = Math.max(widest, widths.reduce((total, width) => total + width, 0) + Math.max(0, row.length - 1) * COLUMN_GAP);
        let x = 0;
        row.forEach((id, position) => {
            boxes.set(id, { x, y: top + index * (NODE_HEIGHT + ROW_GAP), width: widths[position], height: NODE_HEIGHT });
            x += widths[position] + COLUMN_GAP;
        });
    });
    rows.forEach((row) => {
        const rowWidth = row.reduce((total, id) => total + boxes.get(id).width, 0) + Math.max(0, row.length - 1) * COLUMN_GAP;
        const offset = (widest - rowWidth) / 2;
        for (const id of row)
            boxes.get(id).x += offset + MARGIN;
    });
    return { boxes, groupRects: new Map(), width: widest + MARGIN * 2 };
}
/**
 * Which group each id belongs to, and which group contains which.
 *
 * Membership is read from `members`; containment is read from `parent`, because only the parser knows where a
 * boundary was written. A model assembled by hand may omit `parent`, and then containment is inferred from
 * member sets - the tightest superset wins - which is the best such a model can offer.
 *
 * Guards, because a model is data and data can be wrong: a parent that does not exist is ignored, a group that
 * contains itself or closes a cycle is treated as a root, and a member claimed by two groups belongs to the
 * tightest one, so a nested boundary is not drawn around nothing.
 */
function groupTree(groups) {
    const byId = new Map(groups.map((group) => [group.id, group]));
    const owner = new Map();
    const bySize = [...groups].sort((left, right) => left.members.length - right.members.length);
    for (const group of bySize) {
        for (const member of group.members)
            if (!owner.has(member))
                owner.set(member, group.id);
    }
    const declared = (group) => {
        const parent = group.parent;
        if (parent === undefined || parent === group.id)
            return undefined;
        return byId.has(parent) ? parent : undefined;
    };
    const members = new Map(groups.map((group) => [group.id, new Set(group.members)]));
    const infer = (group) => {
        let best;
        for (const other of groups) {
            if (other.id === group.id)
                continue;
            const outer = members.get(other.id);
            const inner = members.get(group.id);
            if (inner.size === 0 || inner.size >= outer.size)
                continue;
            let contained = true;
            for (const member of inner) {
                if (!outer.has(member)) {
                    contained = false;
                    break;
                }
            }
            if (contained && (best === undefined || outer.size < best.size))
                best = { id: other.id, size: outer.size };
        }
        return best?.id;
    };
    const parentOf = new Map();
    for (const group of groups) {
        const parent = declared(group) ?? infer(group);
        if (parent !== undefined)
            parentOf.set(group.id, parent);
    }
    // A cycle would recurse forever: walk up from each group and drop the link that closes the loop.
    for (const group of groups) {
        const seen = new Set([group.id]);
        let cursor = parentOf.get(group.id);
        while (cursor !== undefined) {
            if (seen.has(cursor)) {
                parentOf.delete(cursor);
                break;
            }
            seen.add(cursor);
            cursor = parentOf.get(cursor);
        }
    }
    const children = new Map();
    const roots = [];
    for (const group of groups) {
        const parent = parentOf.get(group.id);
        if (parent === undefined)
            roots.push(group.id);
        else
            children.set(parent, [...(children.get(parent) ?? []), group.id]);
    }
    return { owner, children, roots };
}
/** The tree placement: a boundary is a block, its contents stack inside it, the top level stacks. */
function placeByGroups(diagram, nodes, top) {
    const groups = diagram.groups;
    const byId = new Map(groups.map((group) => [group.id, group]));
    const { owner, children, roots } = groupTree(groups);
    // Nodes that belong to no group, and the first-seen order that keeps a source's own ordering visible.
    const order = new Map(nodes.map((node, index) => [node.id, index]));
    const loose = nodes.filter((node) => !owner.has(node.id)).map((node) => node.id);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const rawContents = (groupId) => {
        const group = byId.get(groupId);
        const own = [...new Set(group.members)].filter((member) => owner.get(member) === groupId && nodeIds.has(member));
        const nested = children.get(groupId) ?? [];
        return [...own, ...nested];
    };
    // A boundary with nothing inside it is not drawn: an empty box claims a containment the source never stated.
    const contents = (groupId) => rawContents(groupId).filter((child) => !byId.has(child) || rawContents(child).length > 0);
    const measure = (id) => {
        if (!byId.has(id))
            return { width: nodeWidth(id), height: NODE_HEIGHT };
        const items = contents(id);
        const sizes = items.map(measure);
        return {
            width: Math.max(MIN_NODE_WIDTH, ...sizes.map((size) => size.width)) + GROUP_PADDING * 2,
            height: GROUP_HEADER + GROUP_PADDING * 2 + sizes.reduce((total, size) => total + size.height, 0) + Math.max(0, items.length - 1) * BLOCK_GAP,
        };
    };
    const boxes = new Map();
    const groupRects = new Map();
    const place = (id, x, y) => {
        const size = measure(id);
        if (!byId.has(id)) {
            boxes.set(id, { x, y, width: size.width, height: NODE_HEIGHT });
            return size;
        }
        groupRects.set(id, { x, y, width: size.width, height: size.height });
        let cursor = y + GROUP_HEADER + GROUP_PADDING;
        const inner = size.width - GROUP_PADDING * 2;
        const ordered = [...contents(id)].sort((left, right) => firstIndex(left) - firstIndex(right));
        for (const child of ordered) {
            const childSize = measure(child);
            place(child, x + GROUP_PADDING + (inner - childSize.width) / 2, cursor);
            cursor += childSize.height + BLOCK_GAP;
        }
        return size;
    };
    // Top level: loose nodes and root groups, in the order the source named them.
    const visibleRoots = roots.filter((id) => contents(id).length > 0);
    // A block takes the earliest position of anything inside it, so a group is drawn where its first member was
    // named - not after every loose node, which put a downstream box above the packages it depends on.
    const firstIndex = (id) => {
        // `order` holds every node, and a block is only ever asked about when it has contents.
        if (!byId.has(id))
            return order.get(id);
        return Math.min(...contents(id).map(firstIndex));
    };
    const topItems = [...loose, ...visibleRoots].sort((left, right) => firstIndex(left) - firstIndex(right));
    const sizes = topItems.map(measure);
    const width = Math.max(MIN_NODE_WIDTH, ...sizes.map((size) => size.width));
    let cursor = top;
    for (const item of topItems) {
        const size = measure(item);
        place(item, MARGIN + (width - size.width) / 2, cursor);
        cursor += size.height + BLOCK_GAP;
    }
    return { boxes, groupRects, width: width + MARGIN * 2 };
}
export function paintWith(diagram, overrides = {}, options = {}) {
    const colours = palette(overrides, options);
    const shapes = [];
    const groups = diagram.groups ?? [];
    const hasGroups = groups.length > 0;
    const topOffset = MARGIN + TITLE_HEIGHT;
    const placement = hasGroups ? placeByGroups(diagram, diagram.nodes, topOffset) : placeByRanks(diagram, diagram.nodes, topOffset);
    const { boxes, groupRects } = placement;
    // Boundaries first, so everything else is painted on top of them.
    for (const group of groups) {
        const rect = groupRects.get(group.id);
        if (rect === undefined)
            continue;
        shapes.push({ kind: 'group', id: group.id, x: rect.x, y: rect.y, width: rect.width, height: rect.height, label: group.label, colour: 'muted' });
    }
    const drawn = new Set();
    for (const node of diagram.nodes) {
        // A state id may repeat in a malformed model: the first placement wins and the repeat is skipped.
        if (drawn.has(node.id))
            continue;
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
            shapes.push({ kind: 'link', x1, y1, x2, y2, label: edge.label, labelX: (x1 + x2) / 2 + 7, labelY: (y1 + y2) / 2, colour });
            continue;
        }
        if (sameRow) {
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
    const contentRight = Math.max(MARGIN, ...Array.from(boxes.values(), (box) => box.x + box.width), ...Array.from(groupRects.values(), (rect) => rect.x + rect.width));
    const captionLines = wrap(diagram.caption, CAPTION_CHARS);
    const captionWidth = Math.max(...captionLines.map((line) => line.length * CAPTION_CHAR_WIDTH)) + MARGIN * 2;
    const width = Math.max(contentRight + MARGIN + (channelUses > 0 ? CHANNEL_GAP * 3 : 0), captionWidth, 240);
    const contentBottom = Math.max(topOffset, ...Array.from(boxes.values(), (box) => box.y + box.height), ...Array.from(groupRects.values(), (rect) => rect.y + rect.height));
    const captionTop = contentBottom + CAPTION_GAP;
    shapes.push({ kind: 'caption', x: MARGIN, y: captionTop, lines: captionLines, colour: captionRole(diagram.caption) });
    const height = captionTop + captionLines.length * CAPTION_LINE + MARGIN / 2;
    return { canvas: { width: Math.round(width), height: Math.round(height), shapes }, colours };
}
export function paint(diagram, overrides = {}) {
    return paintWith(diagram, overrides).canvas;
}

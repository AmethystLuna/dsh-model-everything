/**
 * Where the boxes go.
 *
 * Two placements, chosen by the source:
 *
 * - **layered** (no groups): breadth-first rows, centred, no containment - the shape a state machine wants.
 * - **tree** (groups present): a group is a block, its members stack inside it, a nested group is a block inside
 *   its parent, and the top level stacks - the shape an architecture diagram wants, because a package whose
 *   members float somewhere else on the page is not showing containment at all.
 *
 * Split out of the painter so the two questions stay separate: this module decides positions, `paint.ts` decides
 * what to draw between them. A change to edge routing cannot move a box, and a change to nesting cannot move a
 * line.
 */
import { rankStates } from './layout.js';
import { measure, MIN_NODE_WIDTH } from './text.js';
/** Geometry constants shared by both placements. */
export const MARGIN = 20;
const ROW_GAP = 34;
/** Two rows with a labelled edge between them need room for the label, or it lands on a box. */
const LABELLED_ROW_GAP = 52;
/** The same rule between two blocks stacked inside a boundary. */
const LABELLED_BLOCK_GAP = 32;
/** A row is at least tall enough for one line plus padding. */
const ROW_MIN_HEIGHT = 34;
const COLUMN_GAP = 30;
/** A boundary's inner padding and the strip its name sits in. */
const GROUP_PADDING = 10;
const GROUP_HEADER = 16;
/** Between two blocks stacked inside a boundary, and between two top-level blocks. */
const BLOCK_GAP = 14;
/** The text a node will draw, measured from its label - the id is what the source called it, not what it says. */
export function textOf(node) {
    return measure(node.label !== undefined && node.label !== '' ? node.label : node.id);
}
/** The layered placement: breadth-first rows, centred, no containment. */
function placeByRanks(diagram, nodes, top) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const sizeOf = (id) => textOf(nodeById.get(id));
    const ranked = rankStates(diagram.nodes, diagram.edges, diagram.init);
    const rows = [...ranked.rows];
    if (ranked.unreachable.length > 0)
        rows.push(ranked.unreachable);
    const boxes = new Map();
    let widest = 0;
    // The row's height is its tallest label, and the next row starts below it: a fixed row height is what made a
    // wrapped label overlap the box beneath it.
    let y = top;
    // A diagram whose edges carry text gets the taller gap throughout: row-to-row labels are the common case and
    // estimating them per pair would mean reading the edges here, which is the painter's question.
    const gap = diagram.edges.some((edge) => edge.label !== '') ? LABELLED_ROW_GAP : ROW_GAP;
    rows.forEach((row) => {
        const sizes = row.map(sizeOf);
        const rowHeight = Math.max(ROW_MIN_HEIGHT, ...sizes.map((size) => size.height));
        widest = Math.max(widest, sizes.reduce((total, size) => total + size.width, 0) + Math.max(0, row.length - 1) * COLUMN_GAP);
        let x = 0;
        row.forEach((id, position) => {
            boxes.set(id, { x, y, width: sizes[position].width, height: sizes[position].height });
            x += sizes[position].width + COLUMN_GAP;
        });
        y += rowHeight + gap;
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
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
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
    const blockGap = diagram.edges.some((edge) => edge.label !== '') ? LABELLED_BLOCK_GAP : BLOCK_GAP;
    const measure = (id) => {
        if (!byId.has(id))
            return textOf(nodeById.get(id));
        const items = contents(id);
        const sizes = items.map(measure);
        return {
            width: Math.max(MIN_NODE_WIDTH, ...sizes.map((size) => size.width)) + GROUP_PADDING * 2,
            height: GROUP_HEADER + GROUP_PADDING * 2 + sizes.reduce((total, size) => total + size.height, 0) + Math.max(0, items.length - 1) * blockGap,
        };
    };
    const boxes = new Map();
    const groupRects = new Map();
    const place = (id, x, y) => {
        const size = measure(id);
        if (!byId.has(id)) {
            boxes.set(id, { x, y, width: size.width, height: size.height });
            return size;
        }
        groupRects.set(id, { x, y, width: size.width, height: size.height });
        let cursor = y + GROUP_HEADER + GROUP_PADDING;
        const inner = size.width - GROUP_PADDING * 2;
        const ordered = [...contents(id)].sort((left, right) => firstIndex(left) - firstIndex(right));
        for (const child of ordered) {
            const childSize = measure(child);
            place(child, x + GROUP_PADDING + (inner - childSize.width) / 2, cursor);
            cursor += childSize.height + blockGap;
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
        cursor += size.height + blockGap;
    }
    return { boxes, groupRects, width: width + MARGIN * 2 };
}
/**
 * Place every box of a diagram.
 *
 * The choice of placement is a property of the source, not of the caller: a drawing that declares boundaries is
 * read as containers and gets the tree; one that does not is read as a machine and gets the ranks.
 */
export function place(diagram, top) {
    const groups = diagram.groups ?? [];
    return groups.length > 0 ? placeByGroups(diagram, diagram.nodes, top) : placeByRanks(diagram, diagram.nodes, top);
}

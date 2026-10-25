/**
 * Shapes: the drawing as data, before any markup exists.
 *
 * A painter that emitted markup could only be tested by comparing strings; a painter that emits shapes can
 * be tested by asserting what is where. The SVG writer is the only module that knows about tags.
 *
 * Pure.
 */
import { palette, roleForVerdict } from './palette.js';
import { rankStates } from './layout.js';
const BOX = { width: 110, height: 34, gapX: 26, gapY: 34, margin: 16 };
/** The colour a state's role earns. One mapping, so a box and the links leaving it agree. */
function roleOfNode(role) {
    if (role === 'error')
        return 'fail';
    if (role === 'warning')
        return 'findings';
    if (role === 'muted')
        return 'muted';
    return 'edge';
}
export function paint(diagram, colours = palette()) {
    const shapes = [];
    const title = { kind: 'title', x: BOX.margin, y: BOX.margin + 12, text: diagram.title, colour: 'text' };
    shapes.push(title);
    if (diagram.kind === 'none') {
        const caption = { kind: 'caption', x: BOX.margin, y: BOX.margin + 40, text: diagram.caption, colour: roleForVerdict(diagram.caption.split(' — ')[0]) };
        shapes.push(caption);
        return { width: 360, height: 64, shapes };
    }
    const ranked = rankStates(diagram.nodes, diagram.edges, diagram.init);
    const rows = ranked.unreachable.length === 0 ? ranked.rows : [...ranked.rows, ranked.unreachable];
    const placed = new Map();
    let widest = 0;
    rows.forEach((row, rowIndex) => {
        row.forEach((id, columnIndex) => {
            const placedBox = {
                x: BOX.margin + columnIndex * (BOX.width + BOX.gapX),
                y: BOX.margin + 26 + rowIndex * (BOX.height + BOX.gapY),
                width: BOX.width,
                height: BOX.height,
            };
            placed.set(id, placedBox);
            widest = Math.max(widest, placedBox.x + placedBox.width + BOX.margin);
        });
    });
    const roleOf = new Map(diagram.nodes.map((node) => [node.id, node.role]));
    const colourOf = (id) => roleOfNode(roleOf.get(id));
    for (const edge of diagram.edges) {
        const from = placed.get(edge.from);
        const to = placed.get(edge.to);
        if (from === undefined || to === undefined)
            continue;
        shapes.push({
            kind: 'link',
            x1: from.x + from.width / 2,
            y1: from.y + from.height,
            x2: to.x + to.width / 2,
            y2: to.y,
            label: edge.label,
            colour: colourOf(edge.from),
        });
    }
    // Iterate the placed map rather than the node list: `rankStates` returns each state exactly once, so the
    // two agree by construction and there is no "missing box" case to handle.
    for (const [id, box] of placed) {
        shapes.push({
            kind: 'box',
            ...box,
            label: id,
            colour: roleOfNode(roleOf.get(id)),
            initial: id === diagram.init,
        });
    }
    const bottom = Math.max(...[...placed.values()].map((box) => box.y + box.height), BOX.margin + 26);
    shapes.push({
        kind: 'caption',
        x: BOX.margin,
        y: bottom + 26,
        text: diagram.caption,
        colour: roleForVerdict(diagram.caption.split(' — ')[0]),
    });
    const height = bottom + 44;
    return { width: Math.max(widest, 360), height, shapes };
}
/** The palette a canvas was painted with, so a writer can resolve a role without knowing the theme. */
export function paintWith(diagram, overrides = {}) {
    const colours = palette(overrides);
    return { canvas: paint(diagram, colours), colours };
}

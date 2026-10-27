/**
 * Geometry: what a diagram turns into, in coordinates.
 *
 * A drawing has to survive three containers - inline in a conversation, full-screen, and a persistent
 * sidebar tab - so nothing here knows about pixel size. It emits a content-sized canvas and lets the
 * container scale it: the same numbers serve a 360px card and a 1200px whiteboard.
 *
 * The drawing is placed by the layered pipeline (`place.ts`), which also says which lane a long edge reserved.
 * Edges are drawn from where the boxes ended up, in two ways only: a long edge follows its lane as one polyline,
 * and everything else goes through the orthogonal router. Which side of a box an edge leaves by is read off the
 * route, not picked by comparing the boxes' centres: a route between two rows arrives vertically, so the endpoint
 * is snapped onto the top or bottom perimeter in the direction the route approaches, and two edges on the same
 * side take separate points along it.
 *
 * Pure: a diagram in, shapes out, every decision assertable.
 */
import { MARGIN, place, textOf } from './place.js';
import { approachSides, routeEdge, simplify, snapToPerimeter } from './route.js';
import { textWidth } from './text.js';
import { palette, roleForVerdict } from './palette.js';
import { labelOf } from './model.js';
/** Geometry constants in one place: a container with different proportions changes these, not the rules. */
const TITLE_HEIGHT = 26;
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
function placeLabel(label, from, to, boxes, placed = [], ordinal = 0, segments = [], offsets = [
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
        // A label on top of a line is as unreadable as one on top of a box.
        const left = x - w / 2 - 2;
        const right = x + w / 2 + 2;
        const top2 = y - 2;
        const bottom2 = y + 14;
        for (const segment of segments) {
            const minX = Math.min(segment.x1, segment.x2);
            const maxX = Math.max(segment.x1, segment.x2);
            const minY = Math.min(segment.y1, segment.y2);
            const maxY = Math.max(segment.y1, segment.y2);
            if (right > minX && left < maxX && bottom2 > minY && top2 < maxY)
                return false;
        }
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
    const segments = [];
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
            ...(node.shape === undefined ? {} : { shape: node.shape }),
            colour: roleOfNode(node),
            initial: diagram.init === node.id,
        });
    }
    const roleById = new Map(diagram.nodes.map((node) => [node.id, roleOfNode(node)]));
    // Ports. The side comes from the route, not from comparing the two boxes' centres: a layered drawing runs
    // downwards, so an edge between two rows leaves the bottom and arrives at the top, and a back edge does the
    // opposite. Where along the side the port sits follows the box it points at, so an edge between two rows is a
    // straight drop whenever the two sides overlap; two edges that want the same place are spaced apart, so two
    // ports never share a pixel.
    // A long edge that follows a reserved lane decides its own ends, so it takes no slot on a side: letting it claim
    // one would push the short edges around a port nothing is ever drawn at.
    const facing = diagram.edges.map((edge, index) => {
        const source = boxes.get(edge.from);
        const target = boxes.get(edge.to);
        if (source === undefined || target === undefined || edge.from === edge.to)
            return undefined;
        if ((placement.lanes.get(index)?.points.length ?? 0) > 0)
            return undefined;
        // A wrapped drawing is read in columns: the edge from the bottom of one column to the top of the next leaves
        // and arrives at the side, which is the direction that reading order travels.
        if (placement.across.has(index)) {
            return target.x + target.width / 2 >= source.x + source.width / 2
                ? { exit: 'right', entry: 'left' }
                : { exit: 'left', entry: 'right' };
        }
        return approachSides(source, target);
    });
    const wanted = new Map();
    const slotKey = (boxId, side, index) => boxId + ':' + side + ':' + String(index);
    for (const [index, entry] of facing.entries()) {
        if (entry === undefined)
            continue;
        const edge = diagram.edges[index];
        const from = boxes.get(edge.from);
        const to = boxes.get(edge.to);
        const vertical = entry.exit === 'bottom' || entry.exit === 'top';
        const low = (box) => (vertical ? box.x + 10 : box.y + 8);
        const high = (box) => (vertical ? box.x + box.width - 10 : box.y + box.height - 8);
        const middle = (box) => (vertical ? box.x + box.width / 2 : box.y + box.height / 2);
        const fromMiddle = middle(from);
        const toMiddle = middle(to);
        // Both ports sit on one line - and the edge is a straight run - when the source's middle falls on the target's
        // side; otherwise the line is the target's middle clamped into the source's side, which is as close to a straight
        // run as a box that does not overlap the other allows.
        const chosen = fromMiddle >= low(to) && fromMiddle <= high(to) ? fromMiddle : Math.min(high(from), Math.max(low(from), toMiddle));
        wanted.set(slotKey(edge.from, entry.exit, index), chosen);
        wanted.set(slotKey(edge.to, entry.entry, index), chosen);
    }
    const sides = new Map();
    for (const [index, entry] of facing.entries()) {
        if (entry === undefined)
            continue;
        const edge = diagram.edges[index];
        sides.set(edge.from + ':' + entry.exit, [
            ...(sides.get(edge.from + ':' + entry.exit) ?? []),
            { index, wanted: wanted.get(slotKey(edge.from, entry.exit, index)) },
        ]);
        sides.set(edge.to + ':' + entry.entry, [
            ...(sides.get(edge.to + ':' + entry.entry) ?? []),
            { index, wanted: wanted.get(slotKey(edge.to, entry.entry, index)) },
        ]);
    }
    const placedPort = new Map();
    for (const [key, list] of sides) {
        const [boxId, side] = key.split(':');
        const box = boxes.get(boxId);
        const vertical = side === 'bottom' || side === 'top';
        const low = vertical ? box.x + 10 : box.y + 8;
        const high = vertical ? box.x + box.width - 10 : box.y + box.height - 8;
        let previous = low - 14;
        for (const entry of [...list].sort((left, right) => left.wanted - right.wanted || left.index - right.index)) {
            const position = Math.min(high, Math.max(low, Math.max(entry.wanted, previous + 14)));
            placedPort.set(slotKey(boxId, side, entry.index), position);
            previous = position;
        }
    }
    const portOf = (boxId, side, edgeIndex) => {
        const box = boxes.get(boxId);
        const vertical = side === 'bottom' || side === 'top';
        const coordinate = placedPort.get(slotKey(boxId, side, edgeIndex)) ?? (vertical ? box.x + box.width / 2 : box.y + box.height / 2);
        if (side === 'top')
            return { x: coordinate, y: box.y };
        if (side === 'bottom')
            return { x: coordinate, y: box.y + box.height };
        if (side === 'left')
            return { x: box.x, y: coordinate };
        return { x: box.x + box.width, y: coordinate };
    };
    const anchorsFor = new Map();
    for (const [index, entry] of facing.entries()) {
        if (entry === undefined)
            continue;
        const edge = diagram.edges[index];
        anchorsFor.set(index, {
            exit: portOf(edge.from, entry.exit, index),
            entry: portOf(edge.to, entry.entry, index),
            exitSide: entry.exit,
            entrySide: entry.entry,
        });
    }
    /** The longest straight run of a polyline: where a label has the most room. */
    const longestRun = (points) => {
        let best = { from: points[0], to: points[points.length - 1], length: -1 };
        for (let index = 0; index + 1 < points.length; index += 1) {
            const from = points[index];
            const to = points[index + 1];
            const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
            if (length > best.length)
                best = { from, to, length };
        }
        return best;
    };
    /** Paint one edge as a polyline: its label walks along the longest run, and its segments join the collision set. */
    const paintPath = (edge, points, colour) => {
        const ordinal = labelsFrom.get(edge.from) ?? 0;
        labelsFrom.set(edge.from, ordinal + 1);
        const run = longestRun(points);
        const spot = placeLabel(edge.label, run.from, run.to, boxList, labelRects, ordinal, segments);
        labelRects.push({ x: spot.x, y: spot.y, width: textWidth(edge.label), height: 12 });
        for (let index = 0; index + 1 < points.length; index += 1) {
            const from = points[index];
            const to = points[index + 1];
            segments.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
        }
        shapes.push({
            kind: 'path',
            points,
            label: edge.label,
            labelX: spot.x + textWidth(edge.label) / 2,
            labelY: spot.y,
            colour,
        });
    };
    for (const [edgeIndex, edge] of diagram.edges.entries()) {
        const source = boxes.get(edge.from);
        const target = boxes.get(edge.to);
        if (source === undefined || target === undefined)
            continue;
        const colour = roleById.get(edge.from);
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
        // A long edge follows the lane its dummies reserved: one polyline through the corridor points, so the edge does
        // not have to be searched around every box it passes. Anything else goes through the orthogonal router.
        const lane = placement.lanes.get(edgeIndex);
        if (lane !== undefined && lane.points.length > 0) {
            const waypoints = lane.reversed ? [...lane.points].reverse() : lane.points;
            const first = waypoints[0];
            const last = waypoints[waypoints.length - 1];
            const startSide = first.y < source.y + source.height / 2 ? 'top' : 'bottom';
            const endSide = last.y > target.y + target.height / 2 ? 'bottom' : 'top';
            // The lane leaves along the side's normal and the endpoint is the perimeter point that approach meets, so a
            // lane always starts and ends on the box rather than at a centre that happens to sit inside it.
            const start = snapToPerimeter(source, {
                x: source.x + source.width / 2,
                y: startSide === 'top' ? source.y - 1 : source.y + source.height + 1,
            });
            const end = snapToPerimeter(target, {
                x: target.x + target.width / 2,
                y: endSide === 'top' ? target.y - 1 : target.y + target.height + 1,
            });
            const points = [start];
            let previous = start;
            for (const waypoint of waypoints) {
                if (Math.abs(previous.x - waypoint.x) > 0.5 && Math.abs(previous.y - waypoint.y) > 0.5)
                    points.push({ x: previous.x, y: waypoint.y });
                points.push(waypoint);
                previous = waypoint;
            }
            if (Math.abs(previous.x - end.x) > 0.5 && Math.abs(previous.y - end.y) > 0.5)
                points.push({ x: end.x, y: previous.y });
            points.push(end);
            paintPath(edge, simplify(points), colour);
            continue;
        }
        const anchors = anchorsFor.get(edgeIndex);
        const route = routeEdge(source, target, boxList, anchors);
        if (route.points.length <= 2) {
            const exit = route.points[0];
            const entry = route.points[route.points.length - 1];
            const ordinal = labelsFrom.get(edge.from) ?? 0;
            labelsFrom.set(edge.from, ordinal + 1);
            const spot = placeLabel(edge.label, exit, entry, boxList, labelRects, ordinal, segments);
            labelRects.push({ x: spot.x, y: spot.y, width: textWidth(edge.label), height: 12 });
            segments.push({ x1: exit.x, y1: exit.y, x2: entry.x, y2: entry.y });
            shapes.push({
                kind: 'link',
                x1: exit.x,
                y1: exit.y,
                x2: entry.x,
                y2: entry.y,
                label: edge.label,
                labelX: spot.x + textWidth(edge.label) / 2,
                labelY: spot.y,
                colour,
            });
            continue;
        }
        paintPath(edge, route.points, colour);
    }
    shapes.push({ kind: 'title', x: MARGIN, y: MARGIN + 12, text: diagram.title, colour: 'text' });
    const contentRight = Math.max(MARGIN, ...Array.from(boxes.values(), (box) => box.x + box.width), ...Array.from(groupRects.values(), (rect) => rect.x + rect.width));
    const captionLines = wrap(diagram.caption, CAPTION_CHARS);
    const captionWidth = Math.max(...captionLines.map((line) => line.length * CAPTION_CHAR_WIDTH)) + MARGIN * 2;
    const width = Math.max(contentRight + MARGIN, captionWidth, 240);
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

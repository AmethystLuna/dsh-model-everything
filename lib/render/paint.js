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
 * is snapped onto the top or bottom perimeter in the direction the route approaches. Where along that side it sits
 * follows the symbol: a rectangle spreads its ports along the side, a diamond has four legal points and no side at
 * all, and a cylinder's top port sits on its cap curve. Two edges that want the same point share it, and their
 * routes fan apart from there.
 *
 * An edge's name is drawn on the edge, not beside it: it is anchored at the midpoint of the edge's longest straight
 * run, over a rectangle in the page colour that masks the line behind the text, and it slides along that run when
 * something is in the way. Labels are placed after every edge is drawn, because what a label has to avoid is the
 * whole picture.
 *
 * Pure: a diagram in, shapes out, every decision assertable.
 */
import { MARGIN, place, textOf } from './place.js';
import { PORT_INSET } from './channels.js';
import { approachSides, crossesBox, routeEdge, simplify } from './route.js';
import { cylinderApex, cylinderCaps, hexagonCut, stadiumRadius } from './symbol.js';
import { textWidth } from './text.js';
import { palette, roleForVerdict } from './palette.js';
import { labelOf } from './model.js';
/** Geometry constants in one place: a container with different proportions changes these, not the rules. */
const TITLE_HEIGHT = 26;
const CAPTION_CHARS = 78;
const CAPTION_LINE = 15;
const CAPTION_GAP = 16;
const CAPTION_CHAR_WIDTH = 6.2;
/** The closest two ports on one side may sit, so two edges never leave from the same pixel. */
const PORT_SEPARATION = 14;
/**
 * How far apart two edges that join the same pair are drawn.
 *
 * Wider than the least two ports may sit: two statements about one pair have to read as two lines, and a gap the
 * port packer would allow is a gap a reader sees as one thick line. Exported so a test can name the pattern.
 */
export const MULTI_EDGE_SPACING = 20;
/**
 * Spread the ports of one side along it: each stays as close to the point it asked for as the gap to its neighbours
 * allows, and the whole row is kept on the box.
 *
 * This is the same monotone fit coordinate assignment uses on x, applied to one side of one box: a forward pass that
 * keeps every port at least `PORT_SEPARATION` to the right of the one before it, then a backward pass that pulls the
 * row back onto the box without closing those gaps.
 */
function packPorts(wanted, low, high) {
    const placed = [];
    let previous = low - PORT_SEPARATION;
    for (const value of wanted) {
        previous = Math.min(high, Math.max(value, previous + PORT_SEPARATION));
        placed.push(previous);
    }
    let next = high + PORT_SEPARATION;
    for (let index = placed.length - 1; index >= 0; index -= 1) {
        next = Math.max(low, Math.min(placed[index], next - PORT_SEPARATION));
        placed[index] = next;
    }
    return placed;
}
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
 * How tall the mask an edge label is drawn over is.
 *
 * Exported because two modules must agree on it: the painter reserves the rectangle when it looks for a clear
 * place, and the writer draws the rectangle that was reserved. A label with two sizes is a label half masked.
 */
export const LABEL_HEIGHT = 12;
/** The room a label's mask keeps from anything it may not cover, so two rectangles never read as one. */
const LABEL_PAD = 2;
/** How far a label steps along its own run while it looks for a clear place to sit. */
const LABEL_STEP = 3;
/** The point an edge's label is drawn at.
 *
 * A label is not furniture parked beside the line: it names the transition, so it sits on the line - anchored at
 * the middle of the longest straight run of its own edge - and the writer masks the stretch of line it covers.
 * Text beside a line can be read as belonging to whatever it happens to sit next to; text that interrupts its own
 * line reads as part of it.
 *
 * The anchor then has to be earned. A mask over a box hides a border, over another label it makes both
 * unreadable, and over a third edge's line it hides that line. So the label walks along its own run in small
 * steps, in both directions and bounded so its rectangle stays on that run, and takes the first place that is
 * clear. It never leaves the run: a label moved onto a neighbouring edge is a label that names the wrong thing.
 */
function placeLabel(label, from, to, boxes, placed, segments) {
    const width = textWidth(label);
    const height = LABEL_HEIGHT;
    const spotAt = (x, y) => ({ x, y, width, height });
    const hitsBox = (spot, box) => spot.x - spot.width / 2 < box.x + box.width + LABEL_PAD &&
        spot.x + spot.width / 2 > box.x - LABEL_PAD &&
        spot.y - spot.height / 2 < box.y + box.height + LABEL_PAD &&
        spot.y + spot.height / 2 > box.y - LABEL_PAD;
    const hitsSpot = (spot, other) => spot.x - spot.width / 2 < other.x + other.width / 2 + LABEL_PAD &&
        spot.x + spot.width / 2 > other.x - other.width / 2 - LABEL_PAD &&
        spot.y - spot.height / 2 < other.y + other.height / 2 + LABEL_PAD &&
        spot.y + spot.height / 2 > other.y - other.height / 2 - LABEL_PAD;
    // A label on top of a line is as unreadable as one on top of a box: the mask hides the stretch of line it
    // covers, which on its own edge is the point of the mask and on any other edge is a line that goes missing.
    const hitsSegment = (spot, segment) => spot.x + spot.width / 2 > Math.min(segment.x1, segment.x2) - LABEL_PAD &&
        spot.x - spot.width / 2 < Math.max(segment.x1, segment.x2) + LABEL_PAD &&
        spot.y + spot.height / 2 > Math.min(segment.y1, segment.y2) - LABEL_PAD &&
        spot.y - spot.height / 2 < Math.max(segment.y1, segment.y2) + LABEL_PAD;
    const clearOfBoxes = (spot) => {
        for (const box of boxes)
            if (hitsBox(spot, box))
                return false;
        for (const earlier of placed)
            if (hitsSpot(spot, earlier))
                return false;
        return true;
    };
    const clearOfEdges = (spot) => {
        for (const segment of segments)
            if (hitsSegment(spot, segment))
                return false;
        return true;
    };
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    // The run is axis-aligned, so its Manhattan length is its length.
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.abs(dx) + Math.abs(dy);
    if (length < 1)
        return spotAt(middle.x, middle.y);
    const ux = dx / length;
    const uy = dy / length;
    // The walk is bounded so the label's own rectangle stays on the run that names it: a mask that hangs off the
    // end of its segment would be half over the next thing and would not read as sitting on this edge.
    const along = (Math.abs(ux) * width) / 2 + (Math.abs(uy) * height) / 2;
    const bound = Math.max(0, length / 2 - along);
    const walk = [0];
    for (let step = LABEL_STEP; step <= bound + 0.001; step += LABEL_STEP)
        walk.push(step, -step);
    const at = (offset) => spotAt(middle.x + ux * offset, middle.y + uy * offset);
    for (const offset of walk) {
        const spot = at(offset);
        if (clearOfBoxes(spot) && clearOfEdges(spot))
            return spot;
    }
    // Nothing on the run is clear of every other edge - two runs may lie side by side for their whole length, and
    // then no place on one is clear of the other. Covering a neighbour's line is the least of the three: text over
    // a line still reads, while text over a box hides the box and text over text is unreadable. The label stays
    // on its own edge, which is the one thing it may not give up.
    for (const offset of walk) {
        const spot = at(offset);
        if (clearOfBoxes(spot))
            return spot;
    }
    return at(0);
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
                    consider(shape.labelX + textWidth(shape.label) / 2, shape.labelY + LABEL_HEIGHT / 2);
                break;
            case 'path': {
                for (const point of shape.points)
                    consider(point.x, point.y);
                if (shape.label !== '')
                    consider(shape.labelX + textWidth(shape.label) / 2, shape.labelY + LABEL_HEIGHT / 2);
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
    // An edge may end on a boundary instead of a box: the boundary's rectangle is then the port surface, and
    // the arrow head lands on its border. A group is not a member box, so every lookup that used to ask only
    // `boxes` asks this instead.
    const endBox = (id) => boxes.get(id) ?? groupRects.get(id);
    // The symbol a box is drawn as, which decides which points on its sides an edge may meet. A boundary, and a node
    // the source gave no shape, is a rectangle.
    const shapeById = new Map();
    for (const node of diagram.nodes)
        if (node.shape !== undefined && !shapeById.has(node.id))
            shapeById.set(node.id, node.shape);
    const shapeOf = (id) => shapeById.get(id) ?? 'rect';
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
    /** The edges drawn as lines, in paint order: their labels are placed once every one of them is known. */
    const routes = [];
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
    // One pair may carry two statements - an association and a composition, or the same arrow written twice. They are
    // two relations, not one, and one bend path between them reads as a thick line or as a mistake. So every edge of
    // such a set is a line of its own: the first keeps the place the drawing gave it, and the rest take an offset
    // perpendicular to the direction they run, alternating sign and growing - 0, +1, -1, +2, -2 spacings - so the set
    // fans out from the pair instead of doubling it. A self loop is left out: it has no main direction to be
    // perpendicular to, and its own shape is already not a line between two sides.
    const multiEdgeSets = new Map();
    diagram.edges.forEach((edge, index) => {
        if (edge.from === edge.to)
            return;
        if (endBox(edge.from) === undefined || endBox(edge.to) === undefined)
            return;
        const key = edge.from < edge.to ? edge.from + '\u0000' + edge.to : edge.to + '\u0000' + edge.from;
        const list = multiEdgeSets.get(key);
        if (list === undefined)
            multiEdgeSets.set(key, [index]);
        else
            list.push(index);
    });
    const fanOf = new Map();
    for (const list of multiEdgeSets.values()) {
        if (list.length < 2)
            continue;
        list.forEach((index, position) => {
            if (position === 0)
                return;
            fanOf.set(index, (position % 2 === 1 ? 1 : -1) * Math.ceil(position / 2) * MULTI_EDGE_SPACING);
        });
    }
    // Ports. The side comes from the route, not from comparing the two boxes' centres: a layered drawing runs
    // downwards, so an edge between two rows leaves the bottom and arrives at the top, and a back edge does the
    // opposite. Where along the side the port sits follows the drawing: a long edge takes the point its lane meets, so
    // the lane leaves and arrives square on, and a short edge points at the box it joins. Two edges that want the same
    // place are spaced apart, so two ports never share a pixel.
    const facing = diagram.edges.map((edge, index) => {
        const source = endBox(edge.from);
        const target = endBox(edge.to);
        if (source === undefined || target === undefined || edge.from === edge.to)
            return undefined;
        // A wrapped drawing is read in columns: the edge from the bottom of one column to the top of the next leaves
        // and arrives at the side, which is the direction that reading order travels.
        const sides = placement.across.has(index)
            ? target.x + target.width / 2 >= source.x + source.width / 2
                ? { exit: 'right', entry: 'left' }
                : { exit: 'left', entry: 'right' }
            : approachSides(source, target);
        const lane = placement.lanes.get(index);
        if (lane === undefined || lane.points.length === 0)
            return sides;
        // A lane runs down the page, so its ends face the rows above and below wherever the box centres are.
        const down = target.y > source.y;
        return { exit: down ? 'bottom' : 'top', entry: down ? 'top' : 'bottom', at: lane.points[0].x };
    });
    // A long edge's lane is where the whole edge runs, so a fan moves the lane instead of bending the edge twice at its
    // ends. It tries the place that keeps the set evenly spaced first, then its own place moved by the same offset; a
    // move that would cross a box is refused, because an edge through a box is the worse defect. Refused, the edge keeps
    // its lane - the two ports still differ, because every long edge already has a lane of its own.
    const laneClear = (points, x, from, to) => {
        for (let at = 0; at + 1 < points.length; at += 1) {
            for (const box of boxList) {
                if (box === from || box === to)
                    continue;
                if (crossesBox(x, points[at].y, x, points[at + 1].y, box))
                    return false;
            }
        }
        return true;
    };
    const laneShift = new Map();
    for (const list of multiEdgeSets.values()) {
        if (list.length < 2)
            continue;
        const lead = placement.lanes.get(list[0]);
        if (lead === undefined || lead.points.length === 0)
            continue;
        const base = lead.points[0].x;
        const taken = new Set();
        for (const index of list) {
            const lane = placement.lanes.get(index);
            if (lane === undefined || lane.points.length === 0)
                continue;
            const own = lane.points[0].x;
            const offset = fanOf.get(index) ?? 0;
            const edge = diagram.edges[index];
            const from = endBox(edge.from);
            const to = endBox(edge.to);
            let target = own;
            if (offset !== 0) {
                for (const candidate of [base + offset, own + offset]) {
                    if (taken.has(candidate) || !laneClear(lane.points, candidate, from, to))
                        continue;
                    target = candidate;
                    break;
                }
            }
            taken.add(target);
            if (target !== own)
                laneShift.set(index, target - own);
        }
    }
    const wanted = new Map();
    const slotKey = (boxId, side, index) => boxId + ':' + side + ':' + String(index);
    /**
     * Where a port may sit on one side of one node, as the interval its coordinate may take.
     *
     * This is the per-symbol rule, and it is why the rule lives here: a port slot is chosen in this module, so this is
     * where the symbol has to be known. A rectangle spreads a port along the side, and a subroutine does the same. A
     * diamond's side meets its outline at exactly one point - the vertex - so its interval is that point, and a circle's
     * is its cardinal point; two edges that want one side share the point instead of taking two points in the air. A
     * hexagon's top and bottom are the flat run between the cut corners, and its left and right are the vertices. A
     * stadium's flat run stops at the end caps, and a cylinder's flat sides are the two vertical runs, never the caps.
     *
     * A zero-width interval is not a failure: the packer keeps every port on it, so a symbol that offers one point on a
     * side hands that point to every edge that wants it.
     */
    const spanOf = (boxId, side, corner) => {
        const box = endBox(boxId);
        const vertical = side === 'top' || side === 'bottom';
        const middle = vertical ? box.x + box.width / 2 : box.y + box.height / 2;
        const within = (low, high) => ({ low, high: Math.max(low, high) });
        switch (shapeOf(boxId)) {
            // The four vertices of a diamond, and the four cardinal points of an ellipse, are the middles of its sides.
            case 'diamond':
            case 'circle':
                return within(middle, middle);
            case 'hexagon':
                return vertical ? within(box.x + hexagonCut(box.width), box.x + box.width - hexagonCut(box.width)) : within(middle, middle);
            case 'stadium': {
                const radius = stadiumRadius(box);
                return vertical ? within(box.x + radius, box.x + box.width - radius) : within(middle, middle);
            }
            case 'cylinder': {
                if (vertical)
                    return within(middle, middle);
                const cap = cylinderCaps(box).cap;
                return within(box.y + cap, box.y + box.height - cap);
            }
            default: {
                // A rectangle, and a subroutine's doubled side, keep the margins they have always had; `corner` relaxes them
                // because a side that is crowded uses its corners.
                const inset = corner ? 2 : vertical ? PORT_INSET : 8;
                return vertical ? within(box.x + inset, box.x + box.width - inset) : within(box.y + inset, box.y + box.height - inset);
            }
        }
    };
    const clampTo = (boxId, side, value, corner) => {
        const span = spanOf(boxId, side, corner);
        return Math.min(span.high, Math.max(span.low, value));
    };
    /**
     * The boundary point a coordinate along one side takes.
     *
     * The box's rectangle is the point for every symbol whose side is the box's side. A cylinder's top and bottom are
     * arcs, so a port there sits on the cap curve's apex - `cap / 4` inside the box, not on the box's own edge.
     */
    const pointOn = (boxId, side, along) => {
        const box = endBox(boxId);
        if (side === 'left')
            return { x: box.x, y: along };
        if (side === 'right')
            return { x: box.x + box.width, y: along };
        if (side === 'top')
            return { x: along, y: shapeOf(boxId) === 'cylinder' ? cylinderApex(box, 'top').y : box.y };
        return { x: along, y: shapeOf(boxId) === 'cylinder' ? cylinderApex(box, 'bottom').y : box.y + box.height };
    };
    for (const [index, entry] of facing.entries()) {
        if (entry === undefined)
            continue;
        const edge = diagram.edges[index];
        const from = endBox(edge.from);
        const to = endBox(edge.to);
        const vertical = entry.exit === 'bottom' || entry.exit === 'top';
        const middle = (box) => (vertical ? box.x + box.width / 2 : box.y + box.height / 2);
        const fromMiddle = middle(from);
        const toMiddle = middle(to);
        // Both ports sit on one line - and the edge is a straight run - when the source's middle falls on the target's
        // side; otherwise the line is the target's middle clamped into the source's side, which is as close to a straight
        // run as a box that does not overlap the other allows. A long edge asks for the point its own lane meets instead,
        // and takes the corner nearest it when the lane runs outside the box: that edge turns anyway, and a straight edge
        // made to give up its port would gain two bends for nothing.
        const corner = entry.at !== undefined;
        const target = spanOf(edge.to, entry.entry, false);
        // The k-th edge of a multi-edge set runs on a line of its own, perpendicular to the direction it runs: the fan's
        // offset is added to the side's own coordinate, which is x for a vertical run and y for a horizontal one. A long
        // edge carries the offset in its lane instead, so the whole edge moves rather than gaining two bends.
        const offset = fanOf.get(index) ?? 0;
        const chosen = entry.at === undefined
            ? (fromMiddle >= target.low && fromMiddle <= target.high ? fromMiddle : clampTo(edge.from, entry.exit, toMiddle, false)) + offset
            : entry.at + (laneShift.get(index) ?? 0);
        wanted.set(slotKey(edge.from, entry.exit, index), clampTo(edge.from, entry.exit, chosen, corner));
        wanted.set(slotKey(edge.to, entry.entry, index), clampTo(edge.to, entry.entry, chosen, corner));
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
    // Pack every side, then hand each entry the position its exit was given: a pair that faced each other sat on one x
    // before packing, and an edge the packing had to move should keep its straight run rather than gain two bends.
    let placedPort = new Map();
    for (let round = 0; round < 3; round += 1) {
        placedPort = new Map();
        for (const [key, list] of sides) {
            const [boxId, side] = key.split(':');
            const span = spanOf(boxId, side, true);
            const order = [...list].sort((left, right) => left.wanted - right.wanted || left.index - right.index);
            const packed = packPorts(order.map((entry) => clampTo(boxId, side, entry.wanted, true)), span.low, span.high);
            order.forEach((entry, at) => placedPort.set(slotKey(boxId, side, entry.index), packed[at]));
        }
        let moved = false;
        for (const [index, entry] of facing.entries()) {
            if (entry === undefined)
                continue;
            const edge = diagram.edges[index];
            const vertical = entry.exit === 'bottom' || entry.exit === 'top';
            if (!vertical)
                continue;
            const exit = placedPort.get(slotKey(edge.from, entry.exit, index));
            if (Math.abs(exit - placedPort.get(slotKey(edge.to, entry.entry, index))) < 0.01)
                continue;
            // Only an entry that can reach the exit's x asks for it: a box that does not span it keeps its own point.
            if (Math.abs(clampTo(edge.to, entry.entry, exit, true) - exit) > 0.01)
                continue;
            for (const slot of sides.get(edge.to + ':' + entry.entry)) {
                if (slot.index !== index)
                    continue;
                slot.wanted = exit;
                moved = true;
            }
        }
        if (!moved)
            break;
    }
    const portOf = (boxId, side, edgeIndex) => {
        const span = spanOf(boxId, side, false);
        const coordinate = placedPort.get(slotKey(boxId, side, edgeIndex)) ?? (span.low + span.high) / 2;
        return pointOn(boxId, side, coordinate);
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
    /** The points a drawn edge passes through, whichever of the two shapes carries it. */
    const pointsOfRoute = (shape) => shape.kind === 'path' ? shape.points : [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }];
    /** The straight pieces an edge draws, so a label can tell its own line from every other one. */
    const segmentsOfRoute = (shape) => {
        const points = pointsOfRoute(shape);
        const out = [];
        for (let index = 0; index + 1 < points.length; index += 1) {
            const from = points[index];
            const to = points[index + 1];
            out.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
        }
        return out;
    };
    /** Paint one edge as a polyline. Its label is placed once every edge is drawn; see the pass after the loop. */
    const paintPath = (edge, points, colour) => {
        const shape = {
            kind: 'path',
            points,
            label: edge.label,
            labelX: 0,
            labelY: 0,
            colour,
            ...(edge.dashed === undefined ? {} : { dashed: edge.dashed }),
            ...(edge.arrow === undefined ? {} : { arrow: edge.arrow }),
        };
        shapes.push(shape);
        routes.push(shape);
    };
    /** Two points are a line and more of them are a polyline; both are an edge carrying a label. */
    const paintRoute = (edge, points, colour) => {
        if (points.length > 2) {
            paintPath(edge, points, colour);
            return;
        }
        const exit = points[0];
        const entry = points[points.length - 1];
        const shape = {
            kind: 'link',
            x1: exit.x,
            y1: exit.y,
            x2: entry.x,
            y2: entry.y,
            label: edge.label,
            labelX: 0,
            labelY: 0,
            colour,
            ...(edge.dashed === undefined ? {} : { dashed: edge.dashed }),
            ...(edge.arrow === undefined ? {} : { arrow: edge.arrow }),
        };
        shapes.push(shape);
        routes.push(shape);
    };
    /** Does any segment of this route pass through a box other than its own two ends? */
    const clearOfBoxes = (points, from, to) => {
        for (let index = 0; index + 1 < points.length; index += 1) {
            const start = points[index];
            const end = points[index + 1];
            for (const box of boxList) {
                if (box === from || box === to)
                    continue;
                if (crossesBox(start.x, start.y, end.x, end.y, box))
                    return false;
            }
        }
        return true;
    };
    for (const [edgeIndex, edge] of diagram.edges.entries()) {
        const source = endBox(edge.from);
        const target = endBox(edge.to);
        if (source === undefined || target === undefined)
            continue;
        const colour = roleById.get(edge.from) ?? 'muted';
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
                // The one label that is not on its own edge: a self loop's longest run is eighteen points, and its name
                // does not fit on that. It sits beside the loop, where it belongs to the edge and touches nothing.
                labelX: x + 20 + textWidth(edge.label) / 2,
                labelY: y,
                colour,
                ...(edge.dashed === undefined ? {} : { dashed: edge.dashed }),
                ...(edge.arrow === undefined ? {} : { arrow: edge.arrow }),
            });
            continue;
        }
        const anchors = anchorsFor.get(edgeIndex);
        // A long edge follows the lane the channel stage gave it: down the exit stub, across to the lane's x on the run
        // the gap was assigned, down the lane, and across to the entry stub. The spine carries one point per gap, so the
        // two runs are the places where a port and the lane disagree, and everything between them is one straight drop.
        const lane = placement.lanes.get(edgeIndex);
        if (lane !== undefined && lane.points.length > 0 && anchors !== undefined) {
            const shift = laneShift.get(edgeIndex) ?? 0;
            const ordered = lane.reversed ? [...lane.points].reverse() : lane.points;
            const waypoints = shift === 0 ? ordered : ordered.map((point) => ({ x: point.x + shift, y: point.y }));
            const points = [anchors.exit];
            let previous = anchors.exit;
            for (const waypoint of waypoints) {
                if (Math.abs(previous.x - waypoint.x) > 0.5 && Math.abs(previous.y - waypoint.y) > 0.5)
                    points.push({ x: previous.x, y: waypoint.y });
                points.push(waypoint);
                previous = waypoint;
            }
            if (Math.abs(previous.x - anchors.entry.x) > 0.5 && Math.abs(previous.y - anchors.entry.y) > 0.5)
                points.push({ x: anchors.entry.x, y: previous.y });
            points.push(anchors.entry);
            paintPath(edge, simplify(points), colour);
            continue;
        }
        // Two rows with nothing between them: the edge is the two-bend run the channel stage stacked, which cannot cross
        // a box because the whole run sits in the empty strip between the rows. A wrapped drawing puts columns side by
        // side, so a run that would still meet a box is handed to the router instead.
        const runY = placement.runs.get(edgeIndex);
        if (runY !== undefined && anchors !== undefined) {
            const points = simplify([anchors.exit, { x: anchors.exit.x, y: runY }, { x: anchors.entry.x, y: runY }, anchors.entry]);
            if (clearOfBoxes(points, source, target)) {
                paintRoute(edge, points, colour);
                continue;
            }
        }
        paintRoute(edge, routeEdge(source, target, boxList, anchors).points, colour);
    }
    // Labels last. A label has to clear every other edge, and until the last edge is drawn the painter does not know
    // where those are: this is why the whole pass exists rather than a decision made edge by edge.
    const routeSegments = routes.map((shape) => segmentsOfRoute(shape));
    const placedLabels = [];
    routes.forEach((shape, index) => {
        const run = longestRun(pointsOfRoute(shape));
        // The middle of the longest run is where the label belongs; a label with nothing to avoid stays exactly there.
        let spot = { x: (run.from.x + run.to.x) / 2, y: (run.from.y + run.to.y) / 2, width: textWidth(shape.label), height: LABEL_HEIGHT };
        if (shape.label !== '') {
            spot = placeLabel(shape.label, run.from, run.to, boxList, placedLabels, routeSegments.flatMap((list, at) => (at === index ? [] : list)));
            placedLabels.push(spot);
        }
        shape.labelX = spot.x;
        shape.labelY = spot.y;
    });
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

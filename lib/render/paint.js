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
 * follows the symbol: a rectangle spreads its ports along the side, a cylinder's top port sits on its cap curve, and a
 * diamond or a circle has four legal points and no side to spread along at all.
 *
 * A symbol with discrete points gives each of its edges a point of its own: the point whose outward normal faces the
 * box at the other end is the one that edge takes, and an edge only shares a point when all four are spoken for. A
 * node with a run on its side keeps doing what it always did, because there the ports are places on the run and not
 * points at all. Sharing is the fallback, not the rule: two labelled branches of a decision leave by two vertices.
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
import { anchor, approachSides, crossesBox, normalOf, ROUTE_STUB, routeEdge, simplify } from './route.js';
import { cylinderApex, cylinderCaps, hasDiscretePorts, hexagonCut, stadiumRadius } from './symbol.js';
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
 * The sides of a box, in the order a symbol's own points are drawn: a diamond's top, right, bottom and left vertices.
 *
 * A shape with discrete ports has exactly one legal point per side, so this is also the order its points are offered
 * to the edges that want one, and the order a tie between two equally good sides falls back to.
 */
const PORT_SIDES = ['top', 'right', 'bottom', 'left'];
/** Is this one of the two sides a vertical run leaves by? A run is vertical in its own axis, not in the page. */
const isVerticalSide = (side) => side === 'top' || side === 'bottom';
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
    // opposite - unless the symbol has four legal points, and then the side is the point the edge was given. Where along
    // the side the port sits follows the drawing: a long edge takes the point its lane meets, so the lane leaves and
    // arrives square on, and a short edge points at the box it joins. Two edges that want the same place are spaced
    // apart, so two ports never share a pixel.
    const endKey = (index, end) => String(index) + ':' + end;
    const endsAt = new Map();
    for (const edge of diagram.edges) {
        if (edge.from === edge.to)
            continue;
        if (endBox(edge.from) === undefined || endBox(edge.to) === undefined)
            continue;
        endsAt.set(edge.from, (endsAt.get(edge.from) ?? 0) + 1);
        endsAt.set(edge.to, (endsAt.get(edge.to) ?? 0) + 1);
    }
    /**
     * Where a port may sit on one side of one node, as the interval its coordinate may take.
     *
     * This is the per-symbol rule, and it is why the rule lives here: a port slot is chosen in this module, so this is
     * where the symbol has to be known. A rectangle spreads a port along the side, and a subroutine does the same. A
     * diamond's side meets its outline at exactly one point - the vertex - so its interval is that point, and a circle's
     * is its cardinal point; a point is all that side has to give, so two edges on one side share it rather than take
     * two points in the air. A hexagon's top and bottom are the flat run between the cut corners, and its left and right
     * are the vertices. A stadium's flat run stops at the end caps, and a cylinder's flat sides are the two vertical
     * runs, never the caps.
     *
     * A zero-width interval is not a failure: the packer keeps every port on it, so a symbol that offers one point on a
     * side hands that point to every edge that wants it. Which is why a symbol with four points is given one edge per
     * side first - the point is only shared when the four are taken.
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
    /** The side each edge end's port is on, where the port is a point rather than a place along a run. */
    const claimed = new Map();
    const claimedAt = new Map();
    const claim = (id, index, end, side) => {
        claimed.set(endKey(index, end), side);
        claimedAt.set(id, [...(claimedAt.get(id) ?? []), { index, side }]);
    };
    /** The sides of one node another edge already holds. An edge is not crowded by its own other end. */
    const takenSides = (id, except) => (claimedAt.get(id) ?? []).filter((entry) => entry.index !== except).map((entry) => entry.side);
    /** The middle of one side: the coordinate that side's point sits at when nothing has moved it. */
    const sideMiddle = (box, side) => (isVerticalSide(side) ? box.x + box.width / 2 : box.y + box.height / 2);
    /** The point a side offers at its middle: a symbol's own point, or the middle of the run it spreads along. */
    const sidePoint = (boxId, side) => pointOn(boxId, side, sideMiddle(endBox(boxId), side));
    /** Does this side face away from the box at the other end? A route leaving it has to come back round its own box. */
    const facesAway = (box, other, side) => {
        const out = normalOf(side);
        const dx = other.x + other.width / 2 - (box.x + box.width / 2);
        const dy = other.y + other.height / 2 - (box.y + box.height / 2);
        return out.x * dx + out.y * dy < 0;
    };
    /** The coordinate a free side takes when the other end is pinned: the pinned port's stub, read on the free axis. */
    const stubAlong = (pinnedId, pinnedSide, freeSide) => {
        const point = sidePoint(pinnedId, pinnedSide);
        const out = normalOf(pinnedSide);
        return isVerticalSide(freeSide) ? point.x + out.x * ROUTE_STUB : point.y + out.y * ROUTE_STUB;
    };
    /** Can this side put a port at `value`? A point-side offers exactly one coordinate; a run offers an interval. */
    const offers = (boxId, side, value) => {
        const span = spanOf(boxId, side, true);
        return value >= span.low - 0.01 && value <= span.high + 0.01;
    };
    /**
     * The bend budget a candidate (exit side, entry side) pair spends on the orthogonal route it implies, before a lane
     * or a router is consulted. The numbers, and what each one is:
     *
     *   0  the two stubs share a line: both on vertical sides whose x can be the same, or both on horizontal sides
     *      whose y can be the same, with each stub pointing the way the edge travels. One straight run, no corner.
     *   1  an L: the two sides are perpendicular and the one that can still move can be placed exactly where the pinned
     *      side's stub ends, so the route turns once. It is the rung between the straight run and the Z: an L never
     *      beats a run that shares a line, and always beats a Z.
     *   2  a Z: the stubs are perpendicular but cannot meet at one corner, or they are parallel and offset. Out, across,
     *      in: two corners.
     *   4  a U: a side faces away from the box at the other end, so the route has to wrap a box - out, round, back
     *      in. The canonical U has both sides facing away; one is already enough to force the wrap, and a pair that
     *      has to come back the way it went is never worth a pair that does not.
     *
     * "Can be the same" is the symbol's own answer (`spanOf`): a rectangle offers its whole side, a diamond one point, a
     * cylinder's top the apex of its cap. Two rectangles facing each other therefore share a line wherever they sit; two
     * diamonds only when their vertices line up. This is a budget, not the final polyline: the router still adds the
     * length an obstacle demands, and the channel stage still decides which lanes exist.
     *
     * A side another edge already holds is charged for the L it costs: the packer has to move this pair's port at least
     * a port separation along the side, which turns the one corner the pair counted on into a jog. A Z is not charged -
     * it was already off the line, and a port that moves along its side does not add a corner to it.
     */
    const bendBudget = (fromId, toId, exit, entry, index) => {
        const from = endBox(fromId);
        const to = endBox(toId);
        if (facesAway(from, to, exit) || facesAway(to, from, entry))
            return 4;
        if (isVerticalSide(exit) === isVerticalSide(entry)) {
            // Parallel: a straight run only when the two stubs travel the same way and the sides can meet on one line.
            const out = normalOf(exit);
            const into = normalOf(entry);
            const sameWay = out.x === -into.x && out.y === -into.y;
            const fromSpan = spanOf(fromId, exit, true);
            const toSpan = spanOf(toId, entry, true);
            const meet = fromSpan.low <= toSpan.high + 0.01 && toSpan.low <= fromSpan.high + 0.01;
            return sameWay && meet ? 0 : 2;
        }
        // Perpendicular: one corner when the vertical side can be placed at the horizontal side's stub end.
        const horizontalId = isVerticalSide(exit) ? toId : fromId;
        const horizontalSide = isVerticalSide(exit) ? entry : exit;
        const verticalId = isVerticalSide(exit) ? fromId : toId;
        const verticalSide = isVerticalSide(exit) ? exit : entry;
        if (!offers(verticalId, verticalSide, stubAlong(horizontalId, horizontalSide, verticalSide)))
            return 2;
        const crowded = takenSides(fromId, index).includes(exit) || takenSides(toId, index).includes(entry);
        return crowded ? 2 : 1;
    };
    /**
     * The side a discrete port takes: the point whose pair with the edge's other end bends least.
     *
     * `partner` is the side the other end holds - the side it was claimed, or, until it is claimed, the side the route
     * approaches by. The bend budget comes first. Equal budgets fall back to the rule that was here before: the cosine
     * of the outward normal against the direction to the other box, then the point nearest that box, then the ground
     * between the two points - the small length term. So a case that already read well does not move, and a point that
     * costs an extra corner loses even when it faces the target more squarely.
     */
    const bestSide = (id, otherId, end, partner, index) => {
        const box = endBox(id);
        const other = endBox(otherId);
        const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const toward = { x: other.x + other.width / 2 - centre.x, y: other.y + other.height / 2 - centre.y };
        const reach = Math.hypot(toward.x, toward.y);
        const taken = takenSides(id, index);
        let best;
        for (const side of PORT_SIDES) {
            if (taken.includes(side))
                continue;
            const bends = end === 'exit' ? bendBudget(id, otherId, side, partner, index) : bendBudget(otherId, id, partner, side, index);
            const normal = normalOf(side);
            const score = reach === 0 ? 0 : (normal.x * toward.x + normal.y * toward.y) / reach;
            // How far the point is from the other box's rectangle: the nearest port is the one the edge reaches first.
            const point = anchor(box, side);
            const near = Math.hypot(Math.max(other.x - point.x, 0, point.x - (other.x + other.width)), Math.max(other.y - point.y, 0, point.y - (other.y + other.height)));
            const partnerPoint = anchor(other, partner);
            const ground = Math.abs(point.x - partnerPoint.x) + Math.abs(point.y - partnerPoint.y);
            const better = best === undefined ||
                bends < best.bends ||
                (bends === best.bends &&
                    (score > best.score + 1e-9 ||
                        (Math.abs(score - best.score) <= 1e-9 &&
                            (near < best.near - 1e-9 || (Math.abs(near - best.near) <= 1e-9 && ground < best.ground - 1e-9)))));
            if (better)
                best = { side, bends, score, near, ground };
        }
        return best?.side;
    };
    /**
     * The sides an edge leaves and enters by when no claimed point decides either end: the pair the budget likes best.
     *
     * Only the two same-kind pairs are offered. Both ends here spread their ports along a side, so the choice is which
     * side of the box the edge travels on; a pair that turns the corner one side further is the case `bestEnd` decides,
     * where a claimed point has already fixed the near end. A pair strictly cheaper than the one the route approaches by
     * wins; an equal pair keeps the approach, which leaves a drawing that was already right exactly as it was.
     */
    const bestPair = (fromId, toId, index) => {
        const approach = approachSides(endBox(fromId), endBox(toId));
        const pairs = [
            { exit: 'bottom', entry: 'top' },
            { exit: 'top', entry: 'bottom' },
            { exit: 'right', entry: 'left' },
            { exit: 'left', entry: 'right' },
        ];
        let best = approach;
        let bestBends = bendBudget(fromId, toId, approach.exit, approach.entry, index);
        for (const pair of pairs) {
            const bends = bendBudget(fromId, toId, pair.exit, pair.entry, index);
            if (bends >= bestBends)
                continue;
            best = pair;
            bestBends = bends;
        }
        return best;
    };
    /**
     * The side one end takes when the other end has already been decided: the cheapest of the four.
     *
     * The side the route approaches by wins a tie, for the same reason as `bestPair` - a drawing that already read well
     * does not move for a pair the budget cannot tell apart.
     */
    const bestEnd = (id, otherId, end, partner, index) => {
        const approach = end === 'exit'
            ? approachSides(endBox(id), endBox(otherId)).exit
            : approachSides(endBox(otherId), endBox(id)).entry;
        let best = approach;
        let bestBends = end === 'exit' ? bendBudget(id, otherId, approach, partner, index) : bendBudget(otherId, id, partner, approach, index);
        for (const side of PORT_SIDES) {
            const bends = end === 'exit' ? bendBudget(id, otherId, side, partner, index) : bendBudget(otherId, id, partner, side, index);
            if (bends >= bestBends)
                continue;
            best = side;
            bestBends = bends;
        }
        return best;
    };
    // A side the drawing has already decided is claimed first, because a point there would point the route away from
    // the corridor it has to run in: a long edge leaves by the side its lane starts from, and an edge read across two
    // wrapped columns leaves and arrives on the sides the reading order turns at.
    diagram.edges.forEach((edge, index) => {
        if (edge.from === edge.to)
            return;
        const source = endBox(edge.from);
        const target = endBox(edge.to);
        if (source === undefined || target === undefined)
            return;
        if (placement.across.has(index)) {
            claim(edge.from, index, 'exit', 'right');
            claim(edge.to, index, 'entry', 'left');
            return;
        }
        const lane = placement.lanes.get(index);
        if (lane === undefined || lane.points.length === 0)
            return;
        const down = target.y > source.y;
        claim(edge.from, index, 'exit', down ? 'bottom' : 'top');
        claim(edge.to, index, 'entry', down ? 'top' : 'bottom');
    });
    // Then a symbol with four legal points gives every edge end a point of its own, in source order, until the four are
    // gone. Only a node that needs one port, or one whose points are all spoken for, keeps the old answer - the side the
    // route approaches by - and then two edges share that side's single point and fan apart later. That is the fallback,
    // and it is why a decision with two labelled branches no longer draws both of them from one vertex.
    diagram.edges.forEach((edge, index) => {
        if (edge.from === edge.to)
            return;
        const source = endBox(edge.from);
        const target = endBox(edge.to);
        if (source === undefined || target === undefined)
            return;
        for (const end of ['exit', 'entry']) {
            if (claimed.has(endKey(index, end)))
                continue;
            const id = end === 'exit' ? edge.from : edge.to;
            if ((endsAt.get(id) ?? 0) < 2)
                continue;
            if (!hasDiscretePorts(shapeOf(id)))
                continue;
            // The side the other end holds, or will hold if nothing claims it first.
            const approached = approachSides(source, target);
            const partner = claimed.get(endKey(index, end === 'exit' ? 'entry' : 'exit')) ??
                (end === 'exit' ? approached.entry : approached.exit);
            const side = bestSide(id, end === 'exit' ? edge.to : edge.from, end, partner, index);
            if (side === undefined)
                continue;
            claim(id, index, end, side);
        }
    });
    const facing = diagram.edges.map((edge, index) => {
        const source = endBox(edge.from);
        const target = endBox(edge.to);
        if (source === undefined || target === undefined || edge.from === edge.to)
            return undefined;
        // A wrapped drawing is read in columns: the edge from one column to the next leaves and arrives at the side,
        // which is the direction that reading order travels. A column is always to the right of the one before it.
        if (placement.across.has(index))
            return { exit: 'right', entry: 'left' };
        const lane = placement.lanes.get(index);
        // A lane runs down the page, so its ends face the rows above and below wherever the box centres are.
        const down = target.y > source.y;
        if (lane !== undefined && lane.points.length > 0) {
            return {
                exit: claimed.get(endKey(index, 'exit')) ?? (down ? 'bottom' : 'top'),
                entry: claimed.get(endKey(index, 'entry')) ?? (down ? 'top' : 'bottom'),
                at: lane.points[0].x,
            };
        }
        // No claimed point and no lane: an end that was claimed keeps its point, the other one takes the side the budget
        // likes best against it; with neither claimed, the pair is chosen together.
        const exit = claimed.get(endKey(index, 'exit'));
        const entry = claimed.get(endKey(index, 'entry'));
        if (exit !== undefined && entry !== undefined)
            return { exit, entry };
        if (exit !== undefined)
            return { exit, entry: bestEnd(edge.to, edge.from, 'entry', exit, index) };
        if (entry !== undefined)
            return { exit: bestEnd(edge.from, edge.to, 'exit', entry, index), entry };
        return bestPair(edge.from, edge.to, index);
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
    for (const [index, entry] of facing.entries()) {
        if (entry === undefined)
            continue;
        const edge = diagram.edges[index];
        const from = endBox(edge.from);
        const to = endBox(edge.to);
        const middle = (box, side) => (isVerticalSide(side) ? box.x + box.width / 2 : box.y + box.height / 2);
        const fromMiddle = middle(from, entry.exit);
        const toMiddle = middle(to, entry.entry);
        // Both ports sit on one line - and the edge is a straight run - when the source's middle falls on the target's
        // side; otherwise the line is the target's middle clamped into the source's side, which is as close to a straight
        // run as a box that does not overlap the other allows. A long edge asks for the point its own lane meets instead,
        // and takes the corner nearest it when the lane runs outside the box: that edge turns anyway, and a straight edge
        // made to give up its port would gain two bends for nothing.
        const corner = entry.at !== undefined;
        // The k-th edge of a multi-edge set runs on a line of its own, perpendicular to the direction it runs: the fan's
        // offset is added to the side's own coordinate, which is x for a vertical run and y for a horizontal one. A long
        // edge carries the offset in its lane instead, so the whole edge moves rather than gaining two bends.
        const offset = fanOf.get(index) ?? 0;
        let exitWanted;
        let entryWanted;
        if (entry.at !== undefined) {
            const chosen = entry.at + (laneShift.get(index) ?? 0);
            exitWanted = clampTo(edge.from, entry.exit, chosen, corner);
            entryWanted = clampTo(edge.to, entry.entry, chosen, corner);
        }
        else if (isVerticalSide(entry.exit) === isVerticalSide(entry.entry)) {
            // Two ports on sides of the same kind: one coordinate serves both, as it always has.
            const target = spanOf(edge.to, entry.entry, false);
            const chosen = (fromMiddle >= target.low && fromMiddle <= target.high ? fromMiddle : clampTo(edge.from, entry.exit, toMiddle, false)) + offset;
            exitWanted = clampTo(edge.from, entry.exit, chosen, corner);
            entryWanted = clampTo(edge.to, entry.entry, chosen, corner);
        }
        else {
            // The two ports sit on sides of different kinds, which a discrete point causes. The end that is fixed on its
            // symbol's point keeps that point's coordinate; the other one sits where the route actually arrives - one step
            // out of the fixed port along that port's own normal, read on the free side's axis - so the two legs of the
            // route meet in one corner instead of jogging sideways to reach a middle the route never passes.
            exitWanted = hasDiscretePorts(shapeOf(edge.from))
                ? fromMiddle
                : clampTo(edge.from, entry.exit, stubAlong(edge.to, entry.entry, entry.exit), false) + offset;
            entryWanted = hasDiscretePorts(shapeOf(edge.to))
                ? toMiddle
                : clampTo(edge.to, entry.entry, stubAlong(edge.from, entry.exit, entry.entry), false) + offset;
        }
        wanted.set(slotKey(edge.from, entry.exit, index), exitWanted);
        wanted.set(slotKey(edge.to, entry.entry, index), entryWanted);
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
        const coordinate = placedPort.get(slotKey(boxId, side, edgeIndex));
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
    /**
     * The polyline through a run: out of one port, across the strip between two rows, and into the other, square to
     * whatever side each port belongs to.
     *
     * Two ports on top and bottom sides come out as the polyline the run always drew. A port on a left or right side
     * cannot be entered by a vertical drop, so the route steps out of it by one stub first and the strip meets the port
     * at a right angle: the edge leaves - or arrives - by the side its point belongs to, which is the side the router is
     * told about too.
     */
    const runRoute = (ports, runY) => {
        const out = isVerticalSide(ports.exitSide) ? 0 : normalOf(ports.exitSide).x * ROUTE_STUB;
        const into = isVerticalSide(ports.entrySide) ? 0 : normalOf(ports.entrySide).x * ROUTE_STUB;
        // A sideways port and a vertical one meet where the other port already is, if that is the way the stub points: the
        // stub is the straight run out of the port, and it is worth more than a stub to avoid the point-wide jog that
        // meeting at the nominal length leaves behind - a jog the edge would be charged a bend for and a reader for
        // nothing. Only when the other port is on the far side does the stub have to overshoot.
        const exitRun = out !== 0 && into === 0 && Math.sign(ports.entry.x - ports.exit.x) === Math.sign(out) ? ports.entry.x : ports.exit.x + out;
        const entryRun = into !== 0 && out === 0 && Math.sign(ports.exit.x - ports.entry.x) === Math.sign(into) ? ports.exit.x : ports.entry.x + into;
        const points = [ports.exit];
        if (out !== 0)
            points.push({ x: exitRun, y: ports.exit.y });
        points.push({ x: exitRun, y: runY }, { x: entryRun, y: runY });
        if (into !== 0)
            points.push({ x: entryRun, y: ports.entry.y });
        points.push(ports.entry);
        return simplify(points);
    };
    /**
     * Can the run draw this edge at all?
     *
     * A port on a top or bottom side faces along the vertical run, and the strip has to be on the side the port faces. A
     * point that faces away - the last of a diamond's four, when the others are taken - would have the route leave the
     * port and come straight back through its own box. Such an edge is the router's to draw: going round a box is what
     * the router does, and it knows the box is there.
     */
    const runFits = (ports, runY) => {
        if (isVerticalSide(ports.exitSide) && Math.abs(runY - ports.exit.y) > 0.5) {
            if (Math.sign(runY - ports.exit.y) !== Math.sign(normalOf(ports.exitSide).y))
                return false;
        }
        if (isVerticalSide(ports.entrySide) && Math.abs(ports.entry.y - runY) > 0.5) {
            if (Math.sign(ports.entry.y - runY) !== -Math.sign(normalOf(ports.entrySide).y))
                return false;
        }
        return true;
    };
    /** Does the route pass through a box it does not attach to? A run is an empty strip; a step out of a side may not be. */
    const clearsBoxes = (points, from, to) => {
        for (let at = 0; at + 1 < points.length; at += 1) {
            const a = points[at];
            const b = points[at + 1];
            for (const box of boxList) {
                if (box === from || box === to)
                    continue;
                if (crossesBox(a.x, a.y, b.x, b.y, box))
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
        // Two rows with nothing between them: the edge is the two-bend run the channel stage stacked. A run sits in the
        // empty strip between its own two rows and inside its own component's column, so it cannot meet a box - unless a
        // port on a side steps out of it, and then the step is checked and a route that would meet a box is the router's.
        const runY = placement.runs.get(edgeIndex);
        if (runY !== undefined && anchors !== undefined && runFits(anchors, runY)) {
            const points = runRoute(anchors, runY);
            const mixed = isVerticalSide(anchors.exitSide) !== isVerticalSide(anchors.entrySide);
            if (!mixed || clearsBoxes(points, source, target)) {
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

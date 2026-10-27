/**
 * Orthogonal edge routing around boxes.
 *
 * A straight line between two boxes is right until a third box sits between them; then it is a line drawn through a
 * component, which reads as a connection that is not there. Graphviz solves this by routing along a visibility
 * graph and then fitting splines; ELK, yFiles and mxGraph build a *sparse* grid from the boxes' own edges and run
 * A* over it with a bend penalty. Sparse is the whole trick: a pixel grid is O(pixels²), while the candidate lines
 * are the coordinate of every box edge plus a margin - O(boxes) per axis.
 *
 * So this module does exactly that, in the two steps those routers use:
 *
 * 1. **Candidate lines.** Every box contributes four: one lane just outside each side. Together with the anchor
 *    coordinates they form the grid a route may travel on.
 * 2. **A* with bends.** Moving along a candidate line costs its length; changing direction costs extra, because a
 *    route that zig-zags to save three points is harder to follow than one that goes around.
 *
 * A route is only computed for an edge that needs it: the cheap straight segment is tried first, and routing is the
 * fallback. That keeps the common case - a box directly above another - at two points and no search.
 *
 * The layered painter mostly does not ask: an edge between two rows and an edge with a lane are both built from the
 * channel stage's answer, because a route searched on its own cannot know which lanes the other edges already hold.
 * What is left for this router is the drawing the layers do not describe - an edge across two wrapped columns, an
 * edge one of whose ends is a boundary - and the fallback when a channel route would meet a box.
 */
/** How far outside a box a lane runs, so a route does not graze the border. */
const LANE_GAP = 10;
/** The length of the straight run an edge takes before it is allowed to turn. */
const STUB = 16;
/** The outward normal of a side: the direction an edge leaves along. */
export function normalOf(side) {
    switch (side) {
        case 'top':
            return { x: 0, y: -1 };
        case 'bottom':
            return { x: 0, y: 1 };
        case 'left':
            return { x: -1, y: 0 };
        case 'right':
            return { x: 1, y: 0 };
    }
}
/** What a bend costs, in points of length: a route prefers one long detour to three small ones. */
const BEND_COST = 24;
/** A segment crossing a box at all, with a little slack so a route does not shave a corner. */
export function crossesBox(x1, y1, x2, y2, box) {
    const minX = box.x + 0.5;
    const maxX = box.x + box.width - 0.5;
    const minY = box.y + 0.5;
    const maxY = box.y + box.height - 0.5;
    // Axis-aligned segments are the ones this router emits; test them exactly rather than by sampling.
    if (Math.abs(y1 - y2) < 0.001) {
        const y = y1;
        if (y <= minY || y >= maxY)
            return false;
        return Math.max(x1, x2) > minX && Math.min(x1, x2) < maxX;
    }
    if (Math.abs(x1 - x2) < 0.001) {
        const x = x1;
        if (x <= minX || x >= maxX)
            return false;
        return Math.max(y1, y2) > minY && Math.min(y1, y2) < maxY;
    }
    // A diagonal (the fallback, and the straight segment): sample it. Cheap, and only ever used for one segment.
    const steps = Math.max(8, Math.round(Math.hypot(x2 - x1, y2 - y1)));
    for (let index = 0; index <= steps; index += 1) {
        const x = x1 + ((x2 - x1) * index) / steps;
        const y = y1 + ((y2 - y1) * index) / steps;
        if (x > minX && x < maxX && y > minY && y < maxY)
            return true;
    }
    return false;
}
/** The point on a side of a box, in the middle of that side. */
export function anchor(box, side) {
    switch (side) {
        case 'top':
            return { x: box.x + box.width / 2, y: box.y };
        case 'bottom':
            return { x: box.x + box.width / 2, y: box.y + box.height };
        case 'left':
            return { x: box.x, y: box.y + box.height / 2 };
        case 'right':
            return { x: box.x + box.width, y: box.y + box.height / 2 };
    }
}
/**
 * Which side of `from` an edge leaves by, and which side of `to` it arrives at.
 *
 * The side is a property of the drawing, not of the distance between two centres. A layered drawing puts its boxes
 * in horizontal rows, and an edge between two rows approaches vertically: out of the bottom, into the top, and the
 * other way round for an edge drawn against the flow. Only two boxes in the same row are joined sideways, and then
 * the direction of travel decides which side.
 *
 * This replaces the old rule, which compared the two centres' dx and dy and picked the larger axis - so an edge
 * between two rows left through a box's side as soon as the target was far enough sideways, which is the hook a
 * top-down drawing is read as a defect.
 */
export function approachSides(from, to) {
    const fromCy = from.y + from.height / 2;
    const toCy = to.y + to.height / 2;
    if (Math.abs(toCy - fromCy) > 0.5)
        return toCy > fromCy ? { exit: 'bottom', entry: 'top' } : { exit: 'top', entry: 'bottom' };
    const fromCx = from.x + from.width / 2;
    const toCx = to.x + to.width / 2;
    return toCx >= fromCx ? { exit: 'right', entry: 'left' } : { exit: 'left', entry: 'right' };
}
/** The lane coordinates a route may use: both sides of every obstacle, plus the anchors themselves. */
function lanes(obstacles, extra) {
    const values = new Set(extra);
    for (const box of obstacles) {
        values.add(box.x - LANE_GAP);
        values.add(box.x + box.width + LANE_GAP);
        values.add(box.y - LANE_GAP);
        values.add(box.y + box.height + LANE_GAP);
    }
    return [...values].sort((left, right) => left - right);
}
export function routeEdge(from, to, obstacles, anchors) {
    const sides = approachSides(from, to);
    const exitSide = anchors?.exitSide ?? sides.exit;
    const entrySide = anchors?.entrySide ?? sides.entry;
    const exit = anchors?.exit ?? anchor(from, exitSide);
    const entry = anchors?.entry ?? anchor(to, entrySide);
    // The stub: an edge leaves square to its side and arrives square to the target's side. Without it a route may
    // slide sideways out of a box, which is what made the line look like it was glued to whatever box was nearest.
    const others = obstacles.filter((box) => box !== from && box !== to);
    // A stub that lands inside another box is no stub: keep the plain anchors and let the search decide.
    const blockedStub = (point) => others.some((box) => point.x > box.x && point.x < box.x + box.width && point.y > box.y && point.y < box.y + box.height);
    const outNormal = normalOf(exitSide);
    const inNormal = normalOf(entrySide);
    let exitStub = { x: exit.x + outNormal.x * STUB, y: exit.y + outNormal.y * STUB };
    let entryStub = { x: entry.x + inNormal.x * STUB, y: entry.y + inNormal.y * STUB };
    if (blockedStub(exitStub) || blockedStub(entryStub)) {
        exitStub = exit;
        entryStub = entry;
    }
    const straight = [exit, exitStub, entryStub, entry];
    // A straight line is only offered when it is axis-aligned and clear. A diagonal is clear often enough and still
    // wrong: in a layered drawing it reads as a connection that skips the layers it crosses.
    const axisAligned = Math.abs(exitStub.x - entryStub.x) < 0.5 || Math.abs(exitStub.y - entryStub.y) < 0.5;
    if (axisAligned && !others.some((box) => crossesBox(exitStub.x, exitStub.y, entryStub.x, entryStub.y, box))) {
        return { points: simplify(straight), routed: false };
    }
    // The grid: one axis is x-lane values, the other y-lane values, and the routes are their intersections.
    const xs = lanes(others, [exitStub.x, entryStub.x]);
    const ys = lanes(others, [exitStub.y, entryStub.y]);
    const blocked = (x1, y1, x2, y2) => others.some((box) => crossesBox(x1, y1, x2, y2, box));
    const start = { point: exitStub, axis: -1, cost: 0, bends: 0, path: exitStub === exit ? [exit] : [exit, exitStub] };
    const queue = [start];
    const best = new Map();
    const key = (point) => String(Math.round(point.x)) + ',' + String(Math.round(point.y));
    while (queue.length > 0) {
        // Small graphs: a linear scan for the cheapest open node is simpler than a heap and just as correct.
        let index = 0;
        for (let cursor = 1; cursor < queue.length; cursor += 1)
            if (queue[cursor].cost < queue[index].cost)
                index = cursor;
        const current = queue.splice(index, 1)[0];
        if (current.cost > (best.get(key(current.point)) ?? Infinity))
            continue;
        if (Math.abs(current.point.x - entryStub.x) < 0.5 && Math.abs(current.point.y - entryStub.y) < 0.5) {
            return { points: simplify([...current.path, entryStub, entry]), routed: true };
        }
        const options = [];
        for (const x of xs)
            if (Math.abs(x - current.point.x) > 0.5)
                options.push({ x, y: current.point.y });
        for (const y of ys)
            if (Math.abs(y - current.point.y) > 0.5)
                options.push({ x: current.point.x, y });
        for (const next of options) {
            if (blocked(current.point.x, current.point.y, next.x, next.y))
                continue;
            const axis = Math.abs(next.y - current.point.y) < 0.5 ? 0 : 1;
            const bend = current.axis === -1 || current.axis === axis ? 0 : 1;
            const cost = current.cost + Math.abs(next.x - current.point.x) + Math.abs(next.y - current.point.y) + bend * BEND_COST;
            const state = key(next);
            if (cost >= (best.get(state) ?? Infinity))
                continue;
            best.set(state, cost);
            queue.push({ point: next, axis, cost, bends: current.bends + bend, path: [...current.path, next] });
        }
    }
    // Nothing found: a two-bend orthogonal fallback still beats a diagonal, and it is what a reader expects.
    const elbow = { x: entryStub.x, y: exitStub.y };
    const mid = { x: exitStub.x, y: (exitStub.y + entryStub.y) / 2 };
    const detour = { x: entryStub.x, y: entryStub.y };
    void elbow;
    const fallback = axisAligned ? straight : [exit, exitStub, mid, { x: detour.x, y: mid.y }, entryStub, entry];
    return { points: simplify(fallback), routed: !axisAligned };
}
/** Drop the points in the middle of a straight run: three collinear points are one segment. */
export function simplify(points) {
    if (points.length <= 2)
        return points;
    const out = [points[0]];
    for (let index = 1; index < points.length - 1; index += 1) {
        const previous = out[out.length - 1];
        const current = points[index];
        const next = points[index + 1];
        const collinear = (Math.abs(previous.x - current.x) < 0.5 && Math.abs(current.x - next.x) < 0.5) ||
            (Math.abs(previous.y - current.y) < 0.5 && Math.abs(current.y - next.y) < 0.5);
        if (!collinear)
            out.push(current);
    }
    out.push(points[points.length - 1]);
    return out;
}

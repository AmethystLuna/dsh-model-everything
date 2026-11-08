import { textWidth } from './text.js';
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
/** The runs of one edge, longest first. A label prefers the run with the most room. */
function runsOf(points) {
    const runs = [];
    for (let index = 0; index + 1 < points.length; index += 1) {
        const from = points[index];
        const to = points[index + 1];
        const length = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
        if (length < 1)
            continue;
        runs.push({ from, to, length, index });
    }
    return runs.sort((left, right) => right.length - left.length || left.index - right.index);
}
export function placeLabel(label, points, boxes, placed, otherRoutes) {
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
    /** Everything one candidate place overlaps, counted by the thing it covers rather than by the segment that draws it. */
    const collisionsAt = (spot, run) => {
        let boxHits = 0;
        let labelHits = 0;
        let edgeHits = 0;
        for (const box of boxes)
            if (hitsBox(spot, box))
                boxHits += 1;
        for (const earlier of placed)
            if (hitsSpot(spot, earlier))
                labelHits += 1;
        for (const route of otherRoutes) {
            for (const segment of route) {
                if (!hitsSegment(spot, segment))
                    continue;
                edgeHits += 1;
                break;
            }
        }
        return { run, collisions: boxHits + labelHits + edgeHits, boxes: boxHits, labels: labelHits, edges: edgeHits };
    };
    const runs = runsOf(points);
    if (runs.length === 0) {
        // A route with no straight piece has no line to sit on: keep the label at the route's own point rather than move
        // it into the air. Only a degenerate route reaches this, and the writer still draws its mask.
        const point = points[0] ?? { x: 0, y: 0 };
        return { ...spotAt(point.x, point.y), run: -1, collisions: 0, boxes: 0, labels: 0, edges: 0 };
    }
    let best;
    for (const [runIndex, run] of runs.entries()) {
        const dx = run.to.x - run.from.x;
        const dy = run.to.y - run.from.y;
        const ux = dx / run.length;
        const uy = dy / run.length;
        const middle = { x: (run.from.x + run.to.x) / 2, y: (run.from.y + run.to.y) / 2 };
        // The walk is bounded so the label's own rectangle stays on the run that names it: a mask that hangs off the
        // end of its segment would be half over the next thing and would not read as sitting on this edge.
        const along = (Math.abs(ux) * width) / 2 + (Math.abs(uy) * height) / 2;
        const bound = Math.max(0, run.length / 2 - along);
        const walk = [0];
        for (let step = LABEL_STEP; step <= bound + 0.001; step += LABEL_STEP)
            walk.push(step, -step);
        for (const offset of walk) {
            const spot = spotAt(middle.x + ux * offset, middle.y + uy * offset);
            const placement = collisionsAt(spot, runIndex);
            // A clear place is the answer, and the first one is the preferred one: the search order is already the
            // drawing's preference - longest run, own midpoint, then either side.
            if (placement.collisions === 0)
                return { ...spot, ...placement };
            if (best === undefined ||
                placement.collisions < best.collisions ||
                (placement.collisions === best.collisions && placement.boxes + placement.labels < best.boxes + best.labels)) {
                best = { ...spot, ...placement };
            }
        }
    }
    return best;
}

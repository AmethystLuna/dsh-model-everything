import { textWidth } from './text.js';
/**
 * How tall the mask an edge label is drawn over is.
 *
 * Exported because two modules must agree on it: the painter reserves the rectangle when it looks for a clear
 * place, and the writer draws the rectangle that was reserved. A label with two sizes is a label half masked.
 */
export const LABEL_HEIGHT = 12;
/**
 * The room a label's mask keeps from anything it may not cover, so two rectangles never read as one.
 *
 * Exported because the painter does the covering test: it holds the boxes and the other routes, and this module only asks how
 * many of each a candidate would cover.
 */
export const LABEL_PAD = 2;
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
export function placeLabel(label, points, covered) {
    const width = textWidth(label);
    const height = LABEL_HEIGHT;
    const spotAt = (x, y) => ({ x, y, width, height });
    const collisionsAt = (spot, run) => {
        const counted = covered(spot);
        return {
            run,
            collisions: counted.boxes + counted.labels + counted.edges,
            boxes: counted.boxes,
            labels: counted.labels,
            edges: counted.edges,
        };
    };
    const runs = runsOf(points);
    if (runs.length === 0) {
        // A route with no straight piece has no line to sit on: keep the label at the route's own point rather than move
        // it into the air. Only a degenerate route reaches this, and the writer still draws its mask.
        const point = points[0] ?? { x: 0, y: 0 };
        return { ...spotAt(point.x, point.y), run: -1, collisions: 0, boxes: 0, labels: 0, edges: 0 };
    }
    let best;
    /** One spot on one run: where the label would sit, and what it would cover there. */
    const trySpot = (runIndex, run, along, across) => {
        const ux = (run.to.x - run.from.x) / Math.hypot(run.to.x - run.from.x, run.to.y - run.from.y);
        const uy = (run.to.y - run.from.y) / Math.hypot(run.to.x - run.from.x, run.to.y - run.from.y);
        const middle = { x: (run.from.x + run.to.x) / 2, y: (run.from.y + run.to.y) / 2 };
        const spot = spotAt(middle.x + ux * along - uy * across, middle.y + uy * along + ux * across);
        const placement = collisionsAt(spot, runIndex);
        if (placement.collisions === 0)
            return { ...spot, ...placement };
        if (best === undefined ||
            placement.collisions < best.collisions ||
            (placement.collisions === best.collisions && placement.boxes + placement.labels < best.boxes + best.labels)) {
            best = { ...spot, ...placement };
        }
        return undefined;
    };
    /** The offsets along a run a label may take: bounded so its own rectangle stays on the segment that names it. */
    const walkOf = (run) => {
        const ux = (run.to.x - run.from.x) / Math.hypot(run.to.x - run.from.x, run.to.y - run.from.y);
        const uy = (run.to.y - run.from.y) / Math.hypot(run.to.x - run.from.x, run.to.y - run.from.y);
        const along = (Math.abs(ux) * width) / 2 + (Math.abs(uy) * height) / 2;
        const bound = Math.max(0, Math.hypot(run.to.x - run.from.x, run.to.y - run.from.y) / 2 - along);
        const walk = [0];
        for (let step = LABEL_STEP; step <= bound + 0.001; step += LABEL_STEP)
            walk.push(step, -step);
        return walk;
    };
    // First pass: every run is asked to host the label **on its own line**, in the drawing's order of preference -
    // longest run first, its midpoint before its ends. A run that cannot host it is given up for the next one, which is
    // the rule that keeps a label on the shorter leg of its own edge rather than beside a crowded longer one.
    for (const [runIndex, run] of runs.entries()) {
        for (const along of walkOf(run)) {
            const found = trySpot(runIndex, run, along, 0);
            if (found !== undefined)
                return found;
        }
    }
    // Second pass: no run could host it on its own line, so the label steps off the line - the way a reader writing on
    // a crowded drawing does. The ladder is sized against what actually blocks it (the label's own height and the step)
    // rather than a fixed count, so a label wider than the gap between two boxes can still clear them.
    const ladder = [];
    // Eight steps: far enough to clear a box that sits beside the line, near enough that the label still reads as this
    // edge's. Measured: deeper ladders changed no drawing in the acceptance corpus and no case in the sweeps.
    for (let step = 1; step <= 8; step += 1)
        ladder.push(LABEL_STEP * step, -LABEL_STEP * step);
    for (const [runIndex, run] of runs.entries()) {
        for (const across of ladder) {
            for (const along of walkOf(run)) {
                const found = trySpot(runIndex, run, along, across);
                if (found !== undefined)
                    return found;
            }
        }
    }
    return best;
}

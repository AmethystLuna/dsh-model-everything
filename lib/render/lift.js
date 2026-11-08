/** The shortest arrival a reader reads as an approach rather than as a ledge. */
export const WHOLE_STUB = 16;
/** The lengths to try, longest first: a shorter one is better than a ledge, and none is better than a crossing. */
export const STUB_LADDER = [WHOLE_STUB, 12, 10, 8];
/** The last leg of a route, or `undefined` when the route is too short to have one. */
export function tailOf(points) {
    if (points.length < 3)
        return undefined;
    const tail = points[points.length - 1];
    const corner = points[points.length - 2];
    const head = points[points.length - 3];
    const down = Math.abs(corner.x - tail.x) < 0.5;
    const along = down ? Math.abs(corner.y - tail.y) : Math.abs(corner.x - tail.x);
    return { down, tail, corner, head, along };
}
/**
 * The length the arrival should have, or `undefined` when none of the ladder is free.
 *
 * `free` answers whether the line a given length would make is allowed: clear of every box it does not end at, and clear of
 * every other route by the near line.
 */
export function liftedSpan(points, free) {
    const tail = tailOf(points);
    if (tail === undefined)
        return undefined;
    if (tail.along >= WHOLE_STUB)
        return undefined;
    for (const span of STUB_LADDER) {
        const { down, tail: port, corner, head } = tail;
        const target = down ? port.y - Math.sign(port.y - corner.y) * span : port.x - Math.sign(port.x - corner.x) * span;
        // A length that would put the lifted line on the point before the corner is not a lift: it folds the route back on itself.
        if (down ? Math.abs(target - head.y) < 2 : Math.abs(target - head.x) < 2)
            continue;
        const line = down
            ? [{ x: corner.x, y: target }, { x: head.x, y: target }]
            : [{ x: target, y: corner.y }, { x: target, y: head.y }];
        if (!free(line, span))
            continue;
        return span;
    }
    return undefined;
}
/** Apply a lift in place: the corner and the point before it both move onto the lifted line. */
export function applyLift(points, span) {
    const tail = tailOf(points);
    if (tail === undefined)
        return false;
    const { down, tail: port, corner } = tail;
    const target = down ? port.y - Math.sign(port.y - corner.y) * span : port.x - Math.sign(port.x - corner.x) * span;
    const cornerPoint = points[points.length - 2];
    const headPoint = points[points.length - 3];
    if (down) {
        cornerPoint.y = target;
        headPoint.y = target;
    }
    else {
        cornerPoint.x = target;
        headPoint.x = target;
    }
    return true;
}

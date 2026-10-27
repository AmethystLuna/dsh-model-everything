/**
 * The geometry of a node's symbol, shared by the module that draws it and the module that attaches edges to it.
 *
 * A box is a rectangle, but a symbol is not: the diamond's side midpoints are its vertices, a circle has no side at
 * all, and a cylinder's top is an arc. Any rule that decides where an edge may meet a node therefore needs the
 * symbol's own points - and the module that draws the symbol needs the same numbers, or the anchor and the outline
 * disagree and an edge ends in the air.
 *
 * So the arithmetic lives here once: the painter reads a port from it, the writer draws the shape from it, and a
 * change to a symbol's outline moves both. Pure data and pure functions, no SVG markup.
 */
/** A point on a cubic Bezier at parameter `t`, which is what makes "the top of the cap" a shared fact. */
export function cubicPoint(curve, t) {
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    return {
        x: a * curve.from.x + b * curve.c1.x + c * curve.c2.x + d * curve.to.x,
        y: a * curve.from.y + b * curve.c1.y + c * curve.c2.y + d * curve.to.y,
    };
}
/**
 * A diamond's four points, in drawing order: top, right, bottom, left.
 *
 * These are the only four places an edge may meet a diamond: each side of the box meets the symbol at exactly that
 * point, and every other point on the side is in the air inside or outside the outline.
 */
export function diamondPoints(box) {
    return [
        { x: box.x + box.width / 2, y: box.y },
        { x: box.x + box.width, y: box.y + box.height / 2 },
        { x: box.x + box.width / 2, y: box.y + box.height },
        { x: box.x, y: box.y + box.height / 2 },
    ];
}
/** How much of each end of a hexagon the corner cuts away. */
export function hexagonCut(width) {
    return Math.min(12, width / 4);
}
/**
 * A hexagon's six points, in drawing order: top-left, top-right, right, bottom-right, bottom-left, left.
 *
 * The top and bottom are flat runs between the first two and the last two points; the left and right sides are the
 * single points at index 5 and 2, because the corner cut removed everything else.
 */
export function hexagonPoints(box) {
    const cut = hexagonCut(box.width);
    return [
        { x: box.x + cut, y: box.y },
        { x: box.x + box.width - cut, y: box.y },
        { x: box.x + box.width, y: box.y + box.height / 2 },
        { x: box.x + box.width - cut, y: box.y + box.height },
        { x: box.x + cut, y: box.y + box.height },
        { x: box.x, y: box.y + box.height / 2 },
    ];
}
/** The radius of a stadium's end caps: half its height, unless the box is narrower than that. */
export function stadiumRadius(box) {
    return Math.min(box.height / 2, box.width / 2);
}
/**
 * A cylinder's two caps.
 *
 * The writer draws the top cap from the left shoulder to the right shoulder with the box's own top edge as the
 * control line, and the bottom cap mirrored. The cap curve's apex - the point the painter attaches a top or bottom
 * port to - is therefore a property of this curve, not a constant: it sits a quarter of the cap's depth inside the
 * box, not `cap` inside it.
 */
export function cylinderCaps(box) {
    const cap = Math.min(10, box.height / 3);
    return {
        cap,
        top: {
            from: { x: box.x, y: box.y + cap },
            c1: { x: box.x, y: box.y },
            c2: { x: box.x + box.width, y: box.y },
            to: { x: box.x + box.width, y: box.y + cap },
        },
        bottom: {
            from: { x: box.x + box.width, y: box.y + box.height - cap },
            c1: { x: box.x + box.width, y: box.y + box.height },
            c2: { x: box.x, y: box.y + box.height },
            to: { x: box.x, y: box.y + box.height - cap },
        },
    };
}
/** The apex of a cylinder's top or bottom cap: the only point on that side an edge meets the outline at. */
export function cylinderApex(box, side) {
    const caps = cylinderCaps(box);
    return cubicPoint(side === 'top' ? caps.top : caps.bottom, 0.5);
}

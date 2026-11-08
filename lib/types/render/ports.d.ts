/**
 * Where two edges on one side of a box attach.
 *
 * A port is what a route asks for - a point on a side - and packing is what a side can grant. Each port stays as close to the
 * point it asked for as the gap to its neighbours allows, and the row is kept on the box. The separation is the side's, not a
 * constant: when the row cannot hold its ports at the full gap the gap shrinks, because two edges leaving from one pixel read
 * as one line that splits, which is worse than two lines drawn close together.
 *
 * Pure numbers in and out, so a test can ask a side of a given width what it would grant without a box, a drawing or a canvas.
 */
/** The closest two ports on one side may sit when the side has room. */
export declare const PORT_SEPARATION = 14;
/**
 * Spread the ports of one side along it.
 *
 * `wanted` arrives in the order the ports should be placed, which the caller has already sorted: the walk is monotone in that
 * order and does not sort again. Handing it unsorted points produces a row ordered as handed, not as a reader would expect.
 *
 * The same monotone fit the coordinate assignment uses on x, applied to one side of one box: a forward pass that keeps every
 * port at least the separation past the one before it, then a backward pass that pulls the row back onto the box without
 * closing those gaps.
 */
export declare function packPorts(wanted: readonly number[], low: number, high: number): number[];
/**
 * Centre a row of ports on the side it sits on.
 *
 * The row keeps its order and its gaps and is translated as a whole, so its outer two ports sit symmetrically about the middle
 * of the span. A row that cannot travel the whole way stops where its last port reaches the end of the span - the alternative
 * is a port off the box.
 */
export declare function centreRun(placed: readonly number[], low: number, high: number): number[];

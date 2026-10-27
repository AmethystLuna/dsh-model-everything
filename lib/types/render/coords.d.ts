/**
 * Coordinate assignment: how far right each box sits.
 *
 * The layers are rows and the order inside them is settled; the only freedom left is the x of each box. Three
 * properties make a drawing readable, and this module is built around them:
 *
 * - A box wants to sit under the mean of the boxes it is connected to. That is the least-squares answer to "point at
 *   what you are connected to", and it is what makes the drawing look balanced rather than left-packed.
 * - Nothing overlaps. A mean that would push two boxes into each other is not a placement, so each layer's desired
 *   positions are projected onto the nearest positions that keep the boxes apart (isotonic regression, which is a
 *   monotone fit and therefore exactly "keep the order and the minimum gap"). Rows are then separated by a fixed gap.
 * - A long edge's dummies share one x. They are one lane, not three points, so they are one variable here: the
 *   placeholder ids of one chain all read and write the same entry. That value is a proposal for the channel stage,
 *   not a promise: a lane is moved to a free corridor where routing needs it, and a box is never moved out of a lane.
 *
 * The projection is done a layer at a time, alternating down and up, until the means stop moving. Brandes-Kopf gets
 * the same three properties out of a more careful alignment; this relaxation is the simpler equivalent the drawing
 * can explain: every iteration sets a box to the mean of its neighbours, then repairs the overlaps that mean created.
 *
 * Pure: layers and chains in, coordinates out.
 */
import type { Chain } from './dummy.js';
export interface Sized {
    width: number;
    height: number;
}
export interface CoordInput {
    layers: string[][];
    chains: Chain[];
    sizeOf: (id: string) => Sized;
    /** A dummy instance, and the shared lane it belongs to. */
    chainOf: ReadonlyMap<string, string>;
}
export interface CoordOptions {
    /** The empty space between two side-by-side boxes. */
    gap: number;
    /** The empty strip between two layers. */
    layerGap: number;
}
export interface Coordinates {
    /** Centre x, keyed by node id and by lane id. A long edge's dummies share one entry. */
    x: Map<string, number>;
    /** The top y of each layer. */
    layerY: number[];
    layerHeight: number[];
    layerWidth: number[];
    width: number;
    height: number;
}
export declare function assignCoordinates(input: CoordInput, options: CoordOptions): Coordinates;

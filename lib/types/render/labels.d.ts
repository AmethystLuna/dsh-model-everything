/**
 * Where an edge's label sits.
 *
 * A label is not furniture parked beside the line: it names the transition, so it sits on the line - anchored on one of its
 * own straight runs - and the writer masks the stretch of line it covers. Text beside a line can be read as belonging to
 * whatever it happens to sit next to; text that interrupts its own line reads as part of it.
 *
 * The anchor then has to be earned, and earning it is arithmetic on rectangles. The painter supplies what a candidate would
 * cover (boxes, other labels, other routes); this module walks the runs and decides.
 */
import type { Box, Point } from './place.js';
export interface LabelPlacement {
    /** The straight run it sits on, 0 being the edge's longest. */
    run: number;
    /** Everything its mask overlaps: the other labels, boxes and edges it would have had to move off its line to clear. */
    collisions: number;
    boxes: number;
    labels: number;
    edges: number;
}
/**
 * How tall the mask an edge label is drawn over is.
 *
 * Exported because two modules must agree on it: the painter reserves the rectangle when it looks for a clear
 * place, and the writer draws the rectangle that was reserved. A label with two sizes is a label half masked.
 */
export declare const LABEL_HEIGHT = 12;
/** A straight piece of an edge, as the collision test needs it. */
interface Segment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
/** Where a label sits: the point it is centred on, and the rectangle its mask covers. */
interface LabelSpot {
    x: number;
    y: number;
    width: number;
    height: number;
}
export declare function placeLabel(label: string, points: Point[], boxes: Iterable<Box>, placed: LabelSpot[], otherRoutes: Segment[][]): LabelPlacement & LabelSpot;
export {};

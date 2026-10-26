/**
 * Where the boxes go.
 *
 * Two placements, chosen by the source:
 *
 * - **layered** (no groups): breadth-first rows, centred, no containment - the shape a state machine wants.
 * - **tree** (groups present): a group is a block, its members stack inside it, a nested group is a block inside
 *   its parent, and the top level stacks - the shape an architecture diagram wants, because a package whose
 *   members float somewhere else on the page is not showing containment at all.
 *
 * Split out of the painter so the two questions stay separate: this module decides positions, `paint.ts` decides
 * what to draw between them. A change to edge routing cannot move a box, and a change to nesting cannot move a
 * line.
 */
import type { Diagram } from './model.js';
/** Geometry of one placed box, before anything is drawn. */
export type Box = {
    x: number;
    y: number;
    width: number;
    height: number;
};
/** What a placement returns: every box, every drawn boundary, and how wide the content is. */
export interface Placement {
    boxes: Map<string, Box>;
    groupRects: Map<string, Box>;
    width: number;
}
/** Geometry constants shared by both placements. */
export declare const MARGIN = 20;
/** A box wide enough for its label, clamped so a long id cannot dominate the page. */
export declare const nodeWidth: (label: string) => number;
/**
 * Place every box of a diagram.
 *
 * The choice of placement is a property of the source, not of the caller: a drawing that declares boundaries is
 * read as containers and gets the tree; one that does not is read as a machine and gets the ranks.
 */
export declare function place(diagram: Diagram, top: number): Placement;

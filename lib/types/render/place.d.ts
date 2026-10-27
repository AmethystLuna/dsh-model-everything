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
import { type Measured as TextBox } from './text.js';
import type { Diagram, DiagramNode } from './model.js';
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
/** The text a node will draw, measured from its label - the id is what the source called it, not what it says. */
export declare function textOf(node: DiagramNode): TextBox;
/**
 * Place every box of a diagram.
 *
 * The choice of placement is a property of the source, not of the caller: a drawing that declares boundaries is
 * read as containers and gets the tree; one that does not is read as a machine and gets the ranks.
 */
export declare function place(diagram: Diagram, top: number): Placement;

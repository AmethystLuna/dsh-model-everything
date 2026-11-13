/**
 * The corrections a drawing needs after its lines are read: an endpoint that turns out to be a block, an edge that cannot attach to one,
 * and a block that ends up with nothing inside it.
 *
 * This is not a reader. It looks at the elements and the edges together and changes them - a name that an arrow wrote is deleted when a
 * block of that name exists, the edge is re-pointed at the rectangle, and every one of those decisions is reported against the line that
 * caused it.
 */
import type { DiagramEdge, DiagramGroup, DiagramNode } from './model.js';
/** What the pass needs to see and change. The parser hands its own builder, which has these and more. */
export interface Resolvable {
    nodes: Map<string, DiagramNode>;
    groups: DiagramGroup[];
    edges: DiagramEdge[];
    /** Ids no line declared: an arrow or a marker wrote them, so a block of the same name can take their place. */
    implicit: Set<string>;
    /** The source line of each edge, and the block each edge was written inside. */
    edgeLines: number[];
    edgeScopes: (string | undefined)[];
    /** The source line each boundary was opened on. */
    groupLines: Map<string, number>;
}
/**
 * Correct the drawing in place, reporting each correction against the line that caused it.
 *
 * `refuse` takes the message rather than the pass returning a list: the report's order is the order the lines were read, and one of these
 * findings must not be pushed ahead of another.
 */
export declare function resolveBoundaries(builder: Resolvable, refuse: (message: string) => void): void;

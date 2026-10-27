/**
 * Ranks for a machine, and the order of states within each rank.
 *
 * Breadth-first from the initial state decides the row: the layout a reader expects, and the one a layered
 * drawing asks for - edges mostly flow down, and a state's row is how far it is from the start. A state
 * nothing reaches goes in a block of its own rather than being dropped.
 *
 * Within a row, states are ordered by the mean position of their predecessors - the barycentre pass - because a
 * graph is not a tree: a node with several parents has to sit between them, and a row that keeps the order the
 * walk found it in draws two long edges crossing for no reason. Two sweeps are enough for a drawing this size;
 * a third has never moved anything in the fixtures.
 *
 * Pure, and asserted on the rows themselves.
 */
import type { DiagramEdge, DiagramNode } from './model.js';
export interface Ranked {
    /** The state ids of each row, top to bottom, already ordered left to right. */
    rows: string[][];
    /** States no edge reaches from the initial one. */
    unreachable: string[];
}
export declare function rankStates(nodes: DiagramNode[], edges: DiagramEdge[], init: string | undefined): Ranked;

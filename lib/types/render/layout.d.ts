/**
 * Ranks for a machine, and the order of states within each rank.
 *
 * Breadth-first from the initial state decides the row: the layout a reader expects, and the one a layered
 * drawing asks for - edges mostly flow down, and a state's row is how far it is from the start. A state
 * nothing reaches goes in a block of its own rather than being dropped.
 *
 * Within a row, states keep the order breadth-first found them in: a row is filled by walking the row above
 * left to right, so a state already sits under the parent that discovered it. A barycentre pass was written
 * and removed - with breadth-first insertion it could never move a state, so it was complexity without an
 * observable effect.
 *
 * Pure, and asserted on the rows themselves.
 */
import type { DiagramEdge, DiagramNode } from './viewmodel.js';
export interface Ranked {
    /** The state ids of each row, top to bottom, already ordered left to right. */
    rows: string[][];
    /** States no edge reaches from the initial one. */
    unreachable: string[];
}
export declare function rankStates(nodes: DiagramNode[], edges: DiagramEdge[], init: string | undefined): Ranked;

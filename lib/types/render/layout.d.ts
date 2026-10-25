/**
 * Ranks for a machine: which row each state sits in.
 *
 * Breadth-first from the initial state, which is the layout the reader expects and the one Sugiyama's
 * layered drawing asks for: edges mostly flow down, and a state's row is how far it is from the start. A
 * state nothing reaches goes in a last row of its own rather than being dropped - an unreachable state is
 * usually the finding.
 *
 * Pure, and the whole of the layout for now: no crossing minimisation, no coordinate assignment.
 */
import type { DiagramNode, DiagramEdge } from './viewmodel.js';
export interface Ranked {
    /** Row index per state id, in the order the rows should be drawn. */
    rows: string[][];
    /** States that no edge reaches from the initial one. */
    unreachable: string[];
}
export declare function rankStates(nodes: DiagramNode[], edges: DiagramEdge[], init: string | undefined): Ranked;

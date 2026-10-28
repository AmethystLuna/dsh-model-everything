/**
 * Fan-in trunks: a batch of arrows into one box from one side, drawn as one bundle.
 *
 * A node that four relations point at is drawn as four ports along its side and four lines converging on it. Each
 * line is right on its own, and the picture is wrong: the bundle reads as a comb, and a reader counts ports to count
 * arrows. The mature layered implementations solve this by merging the edges - ELK's *Merge Edges* with junction
 * points, Graphviz's `concentrate` - and the shape they produce is one straight run outside the node, with a branch
 * joining it wherever a separate edge arrives, and one shared stub into the node.
 *
 * This module decides only which ends may merge, where the shared run sits and which of the branches becomes the
 * shared entry. It is pure geometry over boxes and ports, so the rules can be asserted without a canvas; the painter
 * draws the answer.
 *
 * The rules, and why each one exists:
 *
 * - **One target, one entry side.** Edges that arrive from different sides are travelling in different directions,
 *   and a trunk that changed axis would be two trunks.
 * - **The exit faces the trunk.** A branch arrives at the trunk along the direction its own port leaves by, so the
 *   trunk is outside the source as well as outside the target. An end that does not face the trunk is not merged: it
 *   would have to turn before it got there, which is the bend the merge was supposed to save.
 * - **Distinct sources, three or more.** Two merged edges read as one thick line. A pair of relations about one pair
 *   has its own, older rule - they stay visibly apart - and that rule is the distinct-source rule here: two
 *   statements about one pair share their source, so they can never both be a branch of one trunk.
 * - **One arrow semantics.** A composition and an association are different statements about the relation; drawn on
 *   one trunk they would be read as one statement. Ends that disagree on their arrow are not merged with each other.
 * - **Clear of every box.** A trunk that crosses a box is the same defect as a route that does, and it is worse here
 *   because it is drawn once for the whole bundle.
 * - **One trunk per line.** Two groups whose trunks would be drawn on one line would read as one bundle between two
 *   unrelated targets, so the later group is refused.
 *
 * The shared entry is the middle of the target's side. A bundle enters the target through one port, and a side that
 * carries one port is centred on it, so the trunk runs to the middle and every branch joins it there: the branches
 * that are not in the middle bend, which is the price of one entry that reads as centred rather than one that leans
 * towards whichever branch happened to arrive straightest.
 *
 * Merging forces every branch but one to bend twice, so an unmerged drawing of `k` straight branches costs
 * `2 * (n - k)` bends and a merged one costs `2 * (n - 1)`; the branch nearest the middle is the lead because it is
 * the only one that can still reach the shared port without a horizontal leg, and on a target whose middle happens
 * to fall on a branch's own line that branch is free, as before.
 *
 * What this module does not decide: the colour of a branch, the text of its label, and how a branch's own route
 * reaches the trunk. Those belong to the painter.
 */
import { type Side } from './route.js';
import type { Box } from './place.js';
import type { EdgeArrow } from './model.js';
/** One edge end, as the trunk planner reads it. */
export interface TrunkEnd {
    /** The edge's index in the diagram, so the painter can key its answer back to the edge. */
    index: number;
    from: string;
    to: string;
    /** The side the edge's port leaves by, and the side it arrives at, as the port stage decided them. */
    exit: Side;
    entry: Side;
    /** The arrow the notation stated. Ends merge only when they agree on it; two unset arrows agree. */
    arrow?: EdgeArrow;
    /** The height of the run the channel stage gave the edge. An edge without one is not drawn by a run. */
    runY?: number;
}
/** A port in the drawing's coordinates. Structural, so this module needs no import from the painter. */
export interface TrunkPoint {
    x: number;
    y: number;
}
export interface TrunkInput {
    ends: TrunkEnd[];
    /** The box of a node, and nothing else: a boundary is not a trunk target, because an arrow points past it. */
    boxOf: (id: string) => Box | undefined;
    /** Every box the trunk and its branches must keep clear of. A boundary is not an obstacle, as on any route. */
    boxes: Iterable<Box>;
    /** Where an edge's own exit port sits, when it has one. The branch joins the trunk at that port's coordinate. */
    exitPortOf: (index: number) => TrunkPoint | undefined;
}
/** One accepted bundle: what it merges, where its run sits, and which branch the target is entered by. */
export interface TrunkGroup {
    /** Position in `groups`, which is also the id a junction dot carries. */
    id: number;
    target: string;
    side: Side;
    /** The coordinate of the trunk line: a y when the trunk runs across, an x when it runs down. */
    at: number;
    /** The coordinate of the one port the bundle enters by: the middle of the target's side. */
    entryAlong: number;
    /** The two ends of the run, along the axis it moves on. A branch joins it between them. */
    from: number;
    to: number;
    /** The member whose own exit is nearest the shared entry, and therefore the only branch that may still be a straight drop. */
    lead: number;
    /** The edges in the bundle, in the order the source wrote them. */
    members: number[];
}
export interface TrunkPlan {
    groups: TrunkGroup[];
    /** By edge index: the id of the group it joined. An edge not in here travels alone. */
    groupOf: Map<number, number>;
}
/**
 * Decide which ends merge, and where each accepted trunk runs.
 *
 * Ends that cannot merge are simply absent from the plan; the painter draws them as it always has. Groups are
 * ordered by the first member the source wrote, so the answer does not depend on map iteration order.
 */
export declare function planTrunks(input: TrunkInput): TrunkPlan;

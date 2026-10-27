/**
 * Minimum-length ranking: the network simplex of Gansner, Koutsofios, North and Vo (1993).
 *
 * The ranking problem: give every node a layer such that each edge spans at least its minimum length, and make the
 * total of all the slack - the layers every edge spans beyond its minimum - as small as it can be. Slack is what a
 * reader pays for: an edge that spans three layers has to be drawn through two of them.
 *
 * Longest paths are one feasible answer and they are not the best one. They put every node as high as it can
 * possibly go, which leaves a node whose edges leave it with nothing to do above the boxes it points at. The best
 * answer is the solution of a linear program, and network simplex is how the mature layering implementations solve
 * it: hold a *feasible tree* - a spanning tree every edge of which is tight - and a ranking that tightens it, attach
 * a *cut value* to each tree edge (the weight flowing one way across that cut minus the weight flowing the other),
 * and while some tree edge has a negative cut value, take it out, let the cheapest edge across its cut in, and move
 * the ranks so the new edge is tight. The cut value is the rate at which the total length falls as the tree edge is
 * left out, so every exchange shortens the drawing, and a tree with no negative cut value is the optimum: no single
 * exchange is left that would shorten it, and for this program that is the definition of optimal.
 *
 * Three things are done differently from the paper, each because this graph is not the paper's graph:
 *
 * - **Components are solved one at a time.** The ranking is translation invariant, so two components that share no
 *   edge can be laid out apart from each other; each is solved on its own and its top row is then numbered zero.
 * - **A node may be pinned to the top.** A state machine has an initial state and a reader expects it first, so the
 *   stage can name one node that must be on the topmost layer: a zero-length, zero-weight constraint edge runs from
 *   it to every other node of its component (`rank(v) >= rank(pinned)`), and the ranking is minimised subject to that.
 *   The constraint costs length when the free optimum would have put the pinned node below another source, and that
 *   price is what "the initial state is first" means.
 * - **The iteration is capped.** A degenerate exchange (one that moves nothing) is legal and in theory can go round
 *   in circles. The cap turns that into a ranking that is feasible and no worse than where it started.
 *
 * Pure, and generic in the ranking program: no ids, no sizes, no drawing.
 */
/** One edge of the ranking program: two layers, how far apart they may be, and what one layer of slack costs. */
export interface RankEdge {
    from: number;
    to: number;
    /** The least number of layers this edge may span. One for an edge that is drawn, zero for a constraint. */
    minLength: number;
    /** What one extra layer on this edge costs. Zero for a constraint, which must hold but is not worth shortening. */
    weight: number;
}
export interface RankProblem {
    count: number;
    edges: RankEdge[];
    /** A feasible ranking to start from: it already gives every edge at least its minimum length. */
    start: number[];
    /**
     * The node that has to sit on the topmost layer, when the source named one.
     *
     * It has to be a node nothing points at, or no ranking can hold it at the top - a predecessor forces it down. The
     * constraint is dropped when the start ranking cannot satisfy it.
     */
    pinned?: number;
}
export declare function minimumLength(problem: RankProblem): number[];

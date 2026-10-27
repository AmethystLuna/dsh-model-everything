/**
 * Cycle breaking, in the order a layered layout does it.
 *
 * A layered drawing is a drawing of a DAG: an edge that runs back up the page has no layer to go to. The fix is to
 * lay such an edge out backwards and draw its arrow the way the source wrote it - but *which* edges to turn around
 * is a decision, and deciding it edge by edge is what makes two back edges of one cycle end up pointing opposite
 * ways.
 *
 * So the graph is decomposed first. Tarjan's algorithm finds the strongly connected components; contracting each to
 * a node gives the condensation, which is a DAG, so every edge between components already points one way and nothing
 * between them needs reversing. Only inside a component - where by definition every edge lies on a cycle - is there
 * an order to choose: the nodes are ranked once, greedily, and every edge inside the component is oriented along that
 * single ranking. One ranking per component is what "consistently" means: after the pass, every surviving edge of a
 * component points from a lower rank to a higher one, so the component cannot contain a cycle any more.
 *
 * The initial state is a special case: it is layer zero by definition, so an edge that runs into it is a back edge
 * before the decomposition even starts. Turning those around leaves the state with no predecessor, so the ranking
 * of its component puts it first and nothing is ever oriented back into it.
 *
 * Pure: the same graph in, the same edge directions out.
 */
import type { LayoutEdge, LayoutGraph } from './layout.js';
/** One strongly connected component: a set of nodes that can all reach each other. */
export interface Component {
    /** The component's index in the condensation, numbered in topological order. */
    id: number;
    members: string[];
}
export interface BrokenGraph {
    /** The same edges, in the same order, with the ones that close a cycle turned around. */
    edges: LayoutEdge[];
    /** The diagram edges whose direction the layout changed. */
    reversed: Set<number>;
    /** The strongly connected components, numbered in topological order. */
    components: Component[];
    componentOf: Map<string, number>;
    /** Each node's rank inside its own component: every intra-component edge points from a lower rank to a higher. */
    rank: Map<string, number>;
    /** The condensation: an edge per pair of components that has at least one edge between them. Always acyclic. */
    condensation: Array<{
        from: number;
        to: number;
    }>;
}
export declare function breakCycles(graph: LayoutGraph): BrokenGraph;

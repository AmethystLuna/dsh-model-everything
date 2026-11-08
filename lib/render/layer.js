/**
 * Layering: which row each box is in.
 *
 * The graph is acyclic by the time it gets here. A layered drawing needs every edge to span at least one layer, so it
 * always travels downwards, and it wants the total of the layers every edge spans beyond one to be as small as
 * possible: those are the edges that have to be drawn through a row of placeholders instead of going straight down a
 * gap.
 *
 * Longest paths are the first guess: every source on the top row, every other node one layer below its latest
 * predecessor. It is feasible and it is not optimal, because it puts every node as high as it can go - a node whose
 * edges leave it with slack above the boxes it points at is a node that could have moved down and shortened them.
 * `network-simplex.ts` solves the program the mature layering implementations solve: the ranking that minimises the
 * total length, found by exchanging edges in a tight tree until no exchange is left that shortens it.
 *
 * The initial state is layer zero. It is a node with no predecessor - cycle breaking has turned around every edge
 * that ran into it - so a source, and every source is a candidate for the top row. The pin is passed to the solver as
 * a constraint, so the search never trades it away: an initial state that moved down the page would be a machine
 * diagram read from the wrong end.
 *
 * Pure: the graph in, one layer per node out.
 */
import { minimumLength } from './network-simplex.js';
/**
 * Pull every group onto one row.
 *
 * The row is the deepest a member already occupies, so the group keeps the room the rest of the drawing gave it and
 * the boxes above it do not move. Empty rows are dropped afterwards: a row elsewhere is a place with content, and a
 * hole in the middle of the page is not.
 */
export function mergeRanks(layering, groups) {
    const layerOf = new Map(layering.layerOf);
    const layers = layering.layers.map((row) => [...row]);
    for (const group of groups) {
        const present = group.filter((id) => layerOf.has(id));
        if (present.length < 2)
            continue;
        const deepest = Math.max(...present.map((id) => layerOf.get(id)));
        for (const id of present) {
            const from = layerOf.get(id);
            if (from === deepest)
                continue;
            const row = layers[from];
            const at = row.indexOf(id);
            if (at >= 0)
                row.splice(at, 1);
            layers[deepest].push(id);
            layerOf.set(id, deepest);
        }
    }
    const kept = [];
    const renumbered = new Map();
    layers.forEach((row, at) => {
        if (row.length === 0)
            return;
        renumbered.set(at, kept.length);
        kept.push(row);
    });
    for (const [id, rank] of layerOf)
        layerOf.set(id, renumbered.get(rank) ?? 0);
    return { layers: kept, layerOf };
}
/**
 * Put the named pairs in order along their row.
 *
 * A `-right->` says the far box is to the right of the near one, and the row order is decided by barycentres that do not
 * know that. The pair is a statement about the drawing, so it is kept: the two swap places when they came out the other
 * way round. Swapping one pair can disturb another, so the walk repeats until a pass changes nothing.
 */
export function orderRowPairs(layers, pairs) {
    if (pairs.length === 0)
        return;
    for (let round = 0; round < 4; round += 1) {
        let moved = false;
        for (const [first, second] of pairs) {
            for (const row of layers) {
                const at = row.indexOf(first);
                const to = row.indexOf(second);
                if (at < 0 || to < 0 || at < to)
                    continue;
                const as = row;
                as[at] = second;
                as[to] = first;
                moved = true;
            }
        }
        if (!moved)
            return;
    }
}
/**
 * The longest-path ranking: the highest layer each node can possibly take.
 *
 * Every source starts on layer zero and every other node one below its latest predecessor, which is the shortest
 * ranking that is feasible at all - and, because no node can then move up, the starting point the exchange search
 * needs. A node the walk never reaches is part of a cycle and is put on layer zero: the stage is defined on a DAG,
 * and a graph that arrived cyclic is laid out as far as it can be rather than losing the boxes of the cycle.
 */
function longestPath(ids, edges, index) {
    const rank = new Array(ids.length).fill(0);
    const pending = new Array(ids.length).fill(0);
    const outgoing = ids.map(() => []);
    for (const edge of edges) {
        outgoing[index.get(edge.from)].push(index.get(edge.to));
        pending[index.get(edge.to)] += 1;
    }
    const queue = [];
    for (let node = 0; node < ids.length; node += 1)
        if (pending[node] === 0)
            queue.push(node);
    for (let head = 0; head < queue.length; head += 1) {
        const node = queue[head];
        for (const target of outgoing[node]) {
            rank[target] = Math.max(rank[target], rank[node] + 1);
            pending[target] -= 1;
            if (pending[target] === 0)
                queue.push(target);
        }
    }
    return rank;
}
export function layer(graph, edges) {
    // A model is data: the same box may be written twice, and an edge may name a box this level does not have.
    const ids = [];
    const seen = new Set();
    for (const node of graph.nodes) {
        if (seen.has(node.id))
            continue;
        seen.add(node.id);
        ids.push(node.id);
    }
    const index = new Map(ids.map((id, offset) => [id, offset]));
    const forward = edges.filter((edge) => index.has(edge.from) && index.has(edge.to) && edge.from !== edge.to);
    const rankEdges = forward.map((edge) => ({
        from: index.get(edge.from),
        to: index.get(edge.to),
        minLength: 1,
        weight: 1,
    }));
    // The pin only means something for a node that could be on the top row. A node with a predecessor cannot be: it is
    // forced below it, and no ranking puts it first while keeping the edge that points at it.
    let pinned;
    if (graph.init !== undefined && index.has(graph.init)) {
        const start = index.get(graph.init);
        const forced = forward.some((edge) => edge.to === graph.init);
        if (!forced)
            pinned = start;
    }
    const rank = minimumLength({ count: ids.length, edges: rankEdges, start: longestPath(ids, forward, index), ...(pinned === undefined ? {} : { pinned }) });
    const layers = [];
    for (const [offset, id] of ids.entries()) {
        const depth = rank[offset];
        while (layers.length <= depth)
            layers.push([]);
        layers[depth].push(id);
    }
    const layerOf = new Map(ids.map((id, offset) => [id, rank[offset]]));
    return { layers, layerOf };
}

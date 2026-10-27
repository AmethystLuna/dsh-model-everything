/**
 * Layering: which row each box is in.
 *
 * The graph is acyclic by the time it gets here. Longest-path layering puts every source in layer zero and every
 * other node one layer below its latest predecessor, which gives what a layered drawing needs: every edge spans at
 * least one layer, so it always travels downwards.
 *
 * Longest paths alone, though, leave a free source stranded at the top of the page when everything it points at is
 * deep in the drawing - its edges then span several layers for no reason. The tight-tree pass fixes that: a node with
 * no predecessors can sit anywhere above its earliest successor, so it is moved down until one of its edges is tight
 * (spans exactly one layer). That is the shortening a tight tree buys, and it is the case a longest-path layering can
 * still improve without moving a node that another edge has already pinned.
 *
 * The initial state is layer zero and is never moved: the pass skips it.
 *
 * Pure: the graph in, one layer per node out.
 */
/**
 * Layer one weakly connected component.
 *
 * The caller splits the drawing into components first (`components.ts`) because each one gets its own layers; a
 * graph handed in here is expected to be connected, and a disconnected one still layers correctly, it just shares
 * layer zero between the pieces.
 */
export function layer(graph, edges) {
    const ids = graph.nodes.map((node) => node.id);
    const known = new Set(ids);
    const forward = edges.filter((edge) => known.has(edge.from) && known.has(edge.to) && edge.from !== edge.to);
    const outgoing = new Map();
    const incoming = new Map();
    for (const edge of forward) {
        outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
        incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
    }
    const layerOf = new Map();
    const pending = new Map();
    for (const id of ids)
        pending.set(id, (incoming.get(id) ?? []).length);
    const queue = ids.filter((id) => pending.get(id) === 0);
    for (const id of queue)
        layerOf.set(id, 0);
    for (let head = 0; head < queue.length; head += 1) {
        const id = queue[head];
        const depth = layerOf.get(id);
        for (const target of outgoing.get(id) ?? []) {
            layerOf.set(target, Math.max(layerOf.get(target) ?? 0, depth + 1));
            const left = pending.get(target) - 1;
            pending.set(target, left);
            if (left === 0)
                queue.push(target);
        }
    }
    // A node admitted by no predecessor is free to move down; nothing else is. Move each one until its earliest
    // successor is exactly one layer below it - a tight edge, and a shorter drawing.
    for (const id of ids) {
        if (id === graph.init)
            continue;
        if ((incoming.get(id) ?? []).length > 0)
            continue;
        const successors = (outgoing.get(id) ?? []).map((target) => layerOf.get(target));
        if (successors.length === 0)
            continue;
        const pulled = Math.min(...successors) - 1;
        if (pulled > layerOf.get(id))
            layerOf.set(id, pulled);
    }
    const layers = [];
    for (const id of ids) {
        const index = layerOf.get(id);
        if (index === undefined)
            continue;
        while (layers.length <= index)
            layers.push([]);
        layers[index].push(id);
    }
    return { layers, layerOf };
}

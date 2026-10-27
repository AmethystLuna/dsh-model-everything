/**
 * The graph the layout stages agree on, and the order they start from.
 *
 * A layout stage has no business knowing what a diagram is: it sees boxes with a size and edges
 * between them. That is what `LayoutGraph` is, and it is the whole vocabulary the pipeline shares -
 * cycle breaking reads it, layering writes layers, ordering and coordinate assignment read those.
 *
 * `rankStates` stays: it is the breadth-first order a source's own reading suggests, and it seeds
 * the ordering stage with the discovery order instead of whatever order the parser happened to
 * collect. It no longer decides which row a state is in - `layer.ts` does that now - so the rows it
 * returns are only a first guess at the left-to-right order.
 *
 * Pure, and asserted on the answer itself.
 */
export function rankStates(nodes, edges, init) {
    const ids = nodes.map((node) => node.id);
    const known = new Set(ids);
    const start = init !== undefined && known.has(init) ? init : ids[0];
    const outgoing = new Map();
    for (const edge of edges) {
        if (!known.has(edge.from) || !known.has(edge.to))
            continue;
        outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    }
    const depth = new Map();
    if (start !== undefined) {
        depth.set(start, 0);
        const queue = [start];
        while (queue.length > 0) {
            const id = queue.shift();
            const level = depth.get(id);
            for (const target of outgoing.get(id) ?? []) {
                if (depth.has(target))
                    continue;
                depth.set(target, level + 1);
                queue.push(target);
            }
        }
    }
    const rows = [];
    for (const id of ids) {
        const level = depth.get(id);
        if (level === undefined)
            continue;
        while (rows.length <= level)
            rows.push([]);
        rows[level].push(id);
    }
    return { rows, unreachable: ids.filter((id) => !depth.has(id)) };
}
/**
 * The left-to-right seed the ordering stage starts from.
 *
 * Breadth-first discovery is what a reader expects a drawing to follow, so it is a better first
 * guess than the order the parser collected. A state nothing reaches has no discovery order and
 * keeps the order it was written in, after everything that was reached.
 */
export function seedOrder(graph) {
    const ranked = rankStates(graph.nodes, graph.edges, graph.init);
    const order = new Map();
    let index = 0;
    for (const row of ranked.rows)
        for (const id of row)
            order.set(id, index++);
    for (const id of ranked.unreachable)
        order.set(id, index++);
    return order;
}

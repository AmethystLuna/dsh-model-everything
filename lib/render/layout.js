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
export function rankStates(nodes, edges, init) {
    const ids = nodes.map((node) => node.id);
    const known = new Set(ids);
    const start = init !== undefined && known.has(init) ? init : ids[0];
    const outgoing = new Map();
    const incoming = new Map();
    for (const edge of edges) {
        if (!known.has(edge.from) || !known.has(edge.to))
            continue;
        outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
        incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
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

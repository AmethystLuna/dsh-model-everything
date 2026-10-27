/**
 * Dummy nodes: the placeholders a long edge stands on.
 *
 * An edge from layer 0 to layer 3 has to cross layers 1 and 2. The router can go around whatever is in the way, but a
 * drawing reads better if the edge owns a lane through those layers: then ordering can keep other edges off it, and
 * coordinate assignment can give the whole lane one x. A dummy node is that lane: one per layer the edge crosses.
 *
 * A lane is one variable, not one variable per layer. The instances keep their own id (`#d<edge>_<layer>`) so the
 * ordering stage can sort them inside their layer, and they all point at one lane id (`#e<edge>`) so coordinate
 * assignment cannot give the same edge three different x values.
 *
 * Pure: the layers, the chains, and the map between the two.
 */
export function addDummies(layering, edges) {
    const layers = layering.layers.map((layer) => [...layer]);
    const chains = [];
    const chainOf = new Map();
    const laneOf = new Map();
    for (const edge of edges) {
        if (edge.from === edge.to) {
            chains.push({ index: edge.index, path: [edge.from, edge.to] });
            continue;
        }
        const from = layering.layerOf.get(edge.from);
        const to = layering.layerOf.get(edge.to);
        if (from === undefined || to === undefined || to <= from) {
            chains.push({ index: edge.index, path: [edge.from, edge.to] });
            continue;
        }
        const path = [edge.from];
        for (let cursor = from + 1; cursor < to; cursor += 1) {
            const instance = '#d' + String(edge.index) + '_' + String(cursor);
            const lane = '#e' + String(edge.index);
            chainOf.set(instance, lane);
            laneOf.set(edge.index, lane);
            layers[cursor].push(instance);
            path.push(instance);
        }
        path.push(edge.to);
        chains.push({ index: edge.index, path });
    }
    return { layers, chains, chainOf, laneOf };
}

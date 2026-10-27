/**
 * Ordering: the left-to-right order of each layer.
 *
 * The layer a box is in is fixed by now; the only freedom left is the order inside each layer, and that order decides
 * how many edges cross. A crossing is counted on a pair of adjacent layers: two edges between the same two layers
 * cross when their end points are in opposite order on the top and the bottom.
 *
 * The method is the one every layered layout uses. A median sweep takes each layer in turn and sorts it by the median
 * position of its neighbours in the layer just visited - down the drawing, then up. A down sweep alone settles each
 * layer against the one above it and can be undone by the next; alternating is what makes the passes converge.
 *
 * The median is a good guess, not a search. Greedy switch is the search: try swapping two neighbours in a layer, keep
 * the swap if the total crossing count falls, and stop when a whole pass finds nothing. That is where a crossing the
 * median cannot see gets removed.
 *
 * Pure: layers of ids in, layers of ids out, plus the crossing count that justified them.
 */
/** Where each id sits, by layer and by position within it. */
function locate(layers) {
    const found = new Map();
    layers.forEach((layer, depth) => layer.forEach((id, index) => found.set(id, { layer: depth, index })));
    return found;
}
/** The median position of an id's neighbours in the layer that was just visited; its own when it has none there. */
function medianOf(id, neighbours, reference, positions) {
    const found = (neighbours.get(id) ?? [])
        .filter((other) => positions.get(other)?.layer === reference)
        .map((other) => positions.get(other).index)
        .sort((left, right) => left - right);
    if (found.length === 0)
        return positions.get(id).index;
    const middle = Math.floor(found.length / 2);
    return found.length % 2 === 1 ? found[middle] : (found[middle - 1] + found[middle]) / 2;
}
/** How many pairs of edges between adjacent layers cross. */
export function countCrossings(layers, chains) {
    const positions = locate(layers);
    const segments = new Map();
    for (const chain of chains) {
        for (let cursor = 0; cursor + 1 < chain.path.length; cursor += 1) {
            const top = positions.get(chain.path[cursor]);
            const bottom = positions.get(chain.path[cursor + 1]);
            if (top === undefined || bottom === undefined || bottom.layer !== top.layer + 1)
                continue;
            const list = segments.get(top.layer) ?? [];
            list.push({ top: top.index, bottom: bottom.index });
            segments.set(top.layer, list);
        }
    }
    let crossings = 0;
    for (const list of segments.values()) {
        for (let left = 0; left < list.length; left += 1) {
            for (let right = left + 1; right < list.length; right += 1) {
                if ((list[left].top - list[right].top) * (list[left].bottom - list[right].bottom) < 0)
                    crossings += 1;
            }
        }
    }
    return crossings;
}
export function order(seedLayers, chains, seed) {
    // The first guess: the order the source's own reading suggests. A dummy has no such order and starts last in its
    // layer; the median sweep is what moves it to the lane its edge crosses.
    const layers = seedLayers.map((layer) => layer
        .map((id, index) => ({ id, index }))
        .sort((left, right) => (seed?.get(left.id) ?? Infinity) - (seed?.get(right.id) ?? Infinity) || left.index - right.index)
        .map((entry) => entry.id));
    const down = new Map();
    const up = new Map();
    for (const chain of chains) {
        for (let cursor = 0; cursor + 1 < chain.path.length; cursor += 1) {
            const top = chain.path[cursor];
            const bottom = chain.path[cursor + 1];
            down.set(top, [...(down.get(top) ?? []), bottom]);
            up.set(bottom, [...(up.get(bottom) ?? []), top]);
        }
    }
    let positions = locate(layers);
    for (let round = 0; round < 4; round += 1) {
        for (let depth = 1; depth < layers.length; depth += 1) {
            const layer = layers[depth];
            const sorted = layer
                .map((id, index) => ({ id, index, median: medianOf(id, up, depth - 1, positions) }))
                .sort((left, right) => left.median - right.median || left.index - right.index)
                .map((entry) => entry.id);
            layers[depth] = sorted;
            positions = locate(layers);
        }
        for (let depth = layers.length - 2; depth >= 0; depth -= 1) {
            const layer = layers[depth];
            const sorted = layer
                .map((id, index) => ({ id, index, median: medianOf(id, down, depth + 1, positions) }))
                .sort((left, right) => left.median - right.median || left.index - right.index)
                .map((entry) => entry.id);
            layers[depth] = sorted;
            positions = locate(layers);
        }
    }
    let crossings = countCrossings(layers, chains);
    for (let pass = 0; pass < 4; pass += 1) {
        let improved = false;
        for (const layer of layers) {
            for (let index = 0; index + 1 < layer.length; index += 1) {
                const before = layer[index];
                layer[index] = layer[index + 1];
                layer[index + 1] = before;
                const next = countCrossings(layers, chains);
                if (next < crossings) {
                    crossings = next;
                    improved = true;
                }
                else {
                    layer[index + 1] = layer[index];
                    layer[index] = before;
                }
            }
        }
        if (!improved)
            break;
    }
    return { layers, crossings };
}

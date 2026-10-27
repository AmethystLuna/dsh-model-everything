/**
 * Coordinate assignment: how far right each box sits.
 *
 * The layers are rows and the order inside them is settled; the only freedom left is the x of each box. Three
 * properties make a drawing readable, and this module is built around them:
 *
 * - A box wants to sit under the mean of the boxes it is connected to. That is the least-squares answer to "point at
 *   what you are connected to", and it is what makes the drawing look balanced rather than left-packed.
 * - Nothing overlaps. A mean that would push two boxes into each other is not a placement, so each layer's desired
 *   positions are projected onto the nearest positions that keep the boxes apart (isotonic regression, which is a
 *   monotone fit and therefore exactly "keep the order and the minimum gap"). Rows are then separated by a fixed gap.
 * - A long edge's dummies share one x. They are one lane, not three points, so they are one variable here: the
 *   placeholder ids of one chain all read and write the same entry. That value is a proposal for the channel stage,
 *   not a promise: a lane is moved to a free corridor where routing needs it, and a box is never moved out of a lane.
 *
 * The projection is done a layer at a time, alternating down and up, until the means stop moving. Brandes-Kopf gets
 * the same three properties out of a more careful alignment; this relaxation is the simpler equivalent the drawing
 * can explain: every iteration sets a box to the mean of its neighbours, then repairs the overlaps that mean created.
 *
 * Pure: layers and chains in, coordinates out.
 */
/**
 * The nearest position to each desired value that keeps neighbours at least `separation` apart.
 *
 * Substituting the cumulative separation out of the constraint turns it into "the answer must not decrease", which
 * is isotonic regression; pooling adjacent violators solves that in one pass, and the offset is added back.
 */
function project(desired, separation) {
    const offset = [0];
    for (let index = 1; index < desired.length; index += 1)
        offset.push(offset[index - 1] + separation[index]);
    const sums = [];
    const counts = [];
    for (const [index, value] of desired.entries()) {
        let sum = value - offset[index];
        let count = 1;
        while (sums.length > 0 && sums[sums.length - 1] / counts[counts.length - 1] > sum / count) {
            sum += sums.pop();
            count += counts.pop();
        }
        sums.push(sum);
        counts.push(count);
    }
    const fitted = [];
    for (const [block, sum] of sums.entries())
        for (let step = 0; step < counts[block]; step += 1)
            fitted.push(sum / counts[block]);
    return fitted.map((value, index) => value + offset[index]);
}
export function assignCoordinates(input, options) {
    const { layers, chains, sizeOf, chainOf } = input;
    const gap = options.gap;
    const laneIds = new Set(chainOf.values());
    const isDummy = (id) => chainOf.has(id);
    const isPoint = (id) => isDummy(id) || laneIds.has(id);
    const widthOf = (id) => (isPoint(id) ? 0 : sizeOf(id).width);
    const heightOf = (id) => (isPoint(id) ? 0 : sizeOf(id).height);
    const laneOf = (id) => chainOf.get(id) ?? id;
    const x = new Map();
    const read = (id) => x.get(laneOf(id)) ?? 0;
    const write = (id, value) => {
        x.set(laneOf(id), value);
    };
    const neighbours = new Map();
    const laneEnds = new Map();
    for (const chain of chains) {
        for (let cursor = 0; cursor + 1 < chain.path.length; cursor += 1) {
            const top = chain.path[cursor];
            const bottom = chain.path[cursor + 1];
            neighbours.set(top, [...(neighbours.get(top) ?? []), bottom]);
            neighbours.set(bottom, [...(neighbours.get(bottom) ?? []), top]);
        }
        if (chain.path.length > 2) {
            const lane = chainOf.get(chain.path[1]);
            if (lane !== undefined)
                laneEnds.set(lane, [chain.path[0], chain.path[chain.path.length - 1]]);
        }
    }
    // A first guess: pack each layer left to right, so the relaxation starts from something that already has no
    // overlaps. The means are what move it after that.
    for (const layer of layers) {
        let cursor = 0;
        for (const id of layer) {
            write(id, cursor + widthOf(id) / 2);
            cursor += widthOf(id) + gap;
        }
    }
    const desiredOf = (id) => {
        if (isDummy(id)) {
            const ends = (laneEnds.get(laneOf(id)) ?? []).filter((end) => !isDummy(end));
            if (ends.length === 0)
                return read(id);
            return ends.reduce((total, end) => total + read(end), 0) / ends.length;
        }
        // A dummy is a routing artifact, not a neighbour: letting a phantom lane pull a box off the mean of the boxes it
        // actually connects to is what strands a box between two corridors, with no straight edge to either.
        const near = (neighbours.get(id) ?? []).filter((other) => !isDummy(other));
        if (near.length === 0)
            return read(id);
        return near.reduce((total, other) => total + read(other), 0) / near.length;
    };
    const separationIn = (layer) => layer.map((id, index) => (index === 0 ? 0 : (widthOf(layer[index - 1]) + widthOf(id)) / 2 + gap));
    for (let round = 0; round < 12; round += 1) {
        const downwards = round % 2 === 0;
        for (let step = 0; step < layers.length; step += 1) {
            const depth = downwards ? step : layers.length - 1 - step;
            const layer = layers[depth];
            const placed = project(layer.map((id) => desiredOf(id)), separationIn(layer));
            layer.forEach((id, index) => write(id, placed[index]));
        }
    }
    // The last sweep left every box at the mean of the boxes it connects to, and those are the values the boxes keep.
    // A lane is one value across every row it crosses, and each row it passes through proposed one: the proposal is
    // their average. It stays a proposal - the channel stage moves a lane that lands on a box, because a box is what a
    // reader looks at and a lane is what routing needs.
    const proposals = new Map();
    for (const layer of layers) {
        for (const id of layer) {
            if (!isDummy(id))
                continue;
            const lane = laneOf(id);
            proposals.set(lane, [...(proposals.get(lane) ?? []), read(id)]);
        }
    }
    for (const [lane, values] of proposals)
        x.set(lane, values.reduce((total, value) => total + value, 0) / values.length);
    // The row's order and its gap survive the repair; a lane in the row does not move a box out of the way.
    for (const layer of layers) {
        let cursor = -Infinity;
        for (const id of layer) {
            if (isDummy(id)) {
                cursor = Math.max(cursor, read(id));
                continue;
            }
            const width = widthOf(id);
            const centre = Math.max(x.get(id), cursor + width / 2);
            x.set(id, centre);
            cursor = centre + width / 2 + gap;
        }
    }
    let left = 0;
    for (const [id, value] of x)
        left = Math.min(left, value - widthOf(id) / 2);
    for (const [id, value] of x)
        x.set(id, value - left);
    const layerHeight = layers.map((layer) => Math.max(0, ...layer.map((id) => heightOf(id))));
    const layerWidth = layers.map((layer) => {
        let lowest = Infinity;
        let highest = -Infinity;
        for (const id of layer) {
            const value = read(id);
            lowest = Math.min(lowest, value - widthOf(id) / 2);
            highest = Math.max(highest, value + widthOf(id) / 2);
        }
        return highest > lowest ? highest - lowest : 0;
    });
    const layerY = [];
    let top = 0;
    for (const [depth, height] of layerHeight.entries()) {
        layerY.push(top);
        top += height + options.layerGap;
    }
    let width = 0;
    for (const [id, value] of x)
        width = Math.max(width, value + widthOf(id) / 2);
    return {
        x,
        layerY,
        layerHeight,
        layerWidth,
        width,
        height: layerY.length === 0 ? 0 : layerY[layerY.length - 1] + layerHeight[layerHeight.length - 1],
    };
}

/**
 * Where the boxes go.
 *
 * The drawing is placed by the layered pipeline, in the order the mature implementations run it: cycle breaking turns
 * the graph into a DAG, layering gives every box a row, dummy nodes give every long edge a lane, ordering reduces the
 * crossings, and coordinate assignment decides the x of each lane and box. This module composes those stages; it does
 * not decide any of them itself. Each stage is a pure module next door, so it can be asserted without a canvas.
 *
 * Two decompositions sit around the pipeline. A level - the top of the drawing, or the inside of a boundary - is
 * split into weakly connected components, each laid out on its own and then packed onto the page, so a wide
 * subgraph cannot squeeze an unrelated one. A boundary is a node in its parent's layer whose size is whatever its
 * contents need, and its inside is laid out by the same pipeline; that is how nesting is drawn.
 *
 * What comes out is geometry only: a box per node, a rectangle per boundary, and - for a long edge - the lane its
 * dummies reserved, so the painter can draw one polyline through it instead of searching around the boxes.
 */
import { aspectOf, packRectangles, weakComponents } from './components.js';
import { assignCoordinates } from './coords.js';
import { breakCycles } from './cycle-break.js';
import { addDummies } from './dummy.js';
import { layer } from './layer.js';
import { seedOrder } from './layout.js';
import { order } from './order.js';
import { measure, MIN_NODE_WIDTH } from './text.js';
import { planBands } from './wrap.js';
/** Geometry constants in one place: a container with different proportions changes these, not the rules. */
export const MARGIN = 20;
/** The strip between two layers: room for a route and, when the level has labels, for one to sit in. */
const LAYER_GAP = 44;
const LABELLED_LAYER_GAP = 54;
/** The space between two boxes in one layer. */
const NODE_GAP = 30;
/** Two components are two drawings on one page, so they get a wider gap than two boxes. */
const COMPONENT_GAP = 30;
/** A boundary's inner padding and the strip its name sits in. */
const GROUP_PADDING = 10;
const GROUP_HEADER = 16;
/** The text a node will draw, measured from its label - the id is what the source called it, not what it says. */
export function textOf(node) {
    return measure(node.label !== undefined && node.label !== '' ? node.label : node.id);
}
/**
 * Read membership and containment off the model, which is data and can be wrong.
 *
 * Membership is read from `members`; containment from `parent`, because only the parser knows where a boundary was
 * written - a hand-written model may omit it, and then the tightest member-set that contains this one is the best
 * guess available. Guards, because a model is data: a parent that does not exist is ignored, a group that contains
 * itself or closes a cycle is treated as a root, and a member claimed by two groups belongs to the tightest one.
 */
function groupTree(groups) {
    const byId = new Map(groups.map((group) => [group.id, group]));
    const owner = new Map();
    const bySize = [...groups].sort((left, right) => left.members.length - right.members.length);
    for (const group of bySize) {
        for (const member of group.members)
            if (!owner.has(member))
                owner.set(member, group.id);
    }
    const declared = (group) => {
        const parent = group.parent;
        if (parent === undefined || parent === group.id)
            return undefined;
        return byId.has(parent) ? parent : undefined;
    };
    const members = new Map(groups.map((group) => [group.id, new Set(group.members)]));
    const infer = (group) => {
        let best;
        for (const other of groups) {
            if (other.id === group.id)
                continue;
            const outer = members.get(other.id);
            const inner = members.get(group.id);
            if (inner.size === 0 || inner.size >= outer.size)
                continue;
            let contained = true;
            for (const member of inner) {
                if (!outer.has(member)) {
                    contained = false;
                    break;
                }
            }
            if (contained && (best === undefined || outer.size < best.size))
                best = { id: other.id, size: outer.size };
        }
        return best?.id;
    };
    const parentOf = new Map();
    for (const group of groups) {
        const parent = declared(group) ?? infer(group);
        if (parent !== undefined)
            parentOf.set(group.id, parent);
    }
    // A cycle would recurse forever: walk up from each group and drop the link that closes the loop.
    for (const group of groups) {
        const seen = new Set([group.id]);
        let cursor = parentOf.get(group.id);
        while (cursor !== undefined) {
            if (seen.has(cursor)) {
                parentOf.delete(cursor);
                break;
            }
            seen.add(cursor);
            cursor = parentOf.get(cursor);
        }
    }
    const children = new Map();
    const roots = [];
    for (const group of groups) {
        const parent = parentOf.get(group.id);
        if (parent === undefined)
            roots.push(group.id);
        else
            children.set(parent, [...(children.get(parent) ?? []), group.id]);
    }
    return { owner, parentOf, children, roots };
}
export function place(diagram, top) {
    const groups = diagram.groups ?? [];
    const nodes = [];
    const seenNode = new Set();
    for (const node of diagram.nodes) {
        if (seenNode.has(node.id))
            continue;
        seenNode.add(node.id);
        nodes.push(node);
    }
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const tree = groupTree(groups);
    // The order the source wrote things in: the fallback order wherever connectivity says nothing.
    const appearance = new Map();
    for (const node of nodes)
        if (!appearance.has(node.id))
            appearance.set(node.id, appearance.size);
    for (const group of groups)
        if (!appearance.has(group.id))
            appearance.set(group.id, appearance.size);
    const visible = new Set();
    const asked = new Map();
    const isVisible = (id) => {
        const known = asked.get(id);
        if (known !== undefined)
            return known;
        const group = groupById.get(id);
        if (group === undefined) {
            asked.set(id, false);
            return false;
        }
        let found = false;
        for (const member of group.members) {
            if (tree.owner.get(member) === id && nodeById.has(member)) {
                found = true;
                break;
            }
        }
        if (!found) {
            for (const child of tree.children.get(id) ?? []) {
                if (isVisible(child)) {
                    found = true;
                    break;
                }
            }
        }
        asked.set(id, found);
        if (found)
            visible.add(id);
        return found;
    };
    // Every group is asked, not only the roots: a nested group's visibility is what tells its parent it has contents.
    for (const group of groups)
        isVisible(group.id);
    const directNodes = (scope) => nodes.filter((node) => tree.owner.get(node.id) === scope).map((node) => node.id);
    const directGroups = (scope) => (tree.children.get(scope) ?? []).filter((child) => visible.has(child));
    const firstIndexCache = new Map();
    const firstIndexOf = (id) => {
        const cached = firstIndexCache.get(id);
        if (cached !== undefined)
            return cached;
        if (nodeById.has(id))
            return appearance.get(id);
        const members = groupById.get(id).members
            .filter((member) => tree.owner.get(member) === id && nodeById.has(member))
            .map((member) => appearance.get(member));
        const children = directGroups(id).map(firstIndexOf);
        const all = [...members, ...children];
        const found = all.length === 0 ? (appearance.get(id) ?? Number.MAX_SAFE_INTEGER) : Math.min(...all);
        firstIndexCache.set(id, found);
        return found;
    };
    /** Which group or node a diagram node is drawn as, at one level; `undefined` when it is outside that level. */
    const entityAt = (scope, nodeId) => {
        if (!nodeById.has(nodeId))
            return undefined;
        const group = tree.owner.get(nodeId);
        if (scope === undefined) {
            if (group === undefined || !visible.has(group))
                return nodeId;
            let cursor = group;
            while (tree.parentOf.has(cursor))
                cursor = tree.parentOf.get(cursor);
            return cursor;
        }
        if (group === scope)
            return nodeId;
        if (group === undefined)
            return undefined;
        return tree.parentOf.get(group) === scope && visible.has(group) ? group : undefined;
    };
    const groupSizes = new Map();
    const groupLayouts = new Map();
    const measureGroup = (id) => {
        const cached = groupSizes.get(id);
        if (cached !== undefined)
            return cached;
        const inside = buildLevel(id);
        const size = {
            width: Math.max(MIN_NODE_WIDTH, inside.width) + GROUP_PADDING * 2,
            height: inside.height + GROUP_HEADER + GROUP_PADDING * 2,
        };
        groupSizes.set(id, size);
        groupLayouts.set(id, inside);
        return size;
    };
    const entityOf = (id) => {
        const node = nodeById.get(id);
        if (node !== undefined) {
            const text = textOf(node);
            return { id, group: false, width: text.width, height: text.height };
        }
        const size = measureGroup(id);
        return { id, group: true, width: size.width, height: size.height };
    };
    const entitiesIn = (scope) => {
        const found = [];
        if (scope === undefined) {
            for (const node of nodes) {
                const group = tree.owner.get(node.id);
                if (group === undefined || !visible.has(group))
                    found.push(entityOf(node.id));
            }
            for (const root of tree.roots)
                if (visible.has(root))
                    found.push(entityOf(root));
        }
        else {
            for (const id of directNodes(scope))
                found.push(entityOf(id));
            for (const id of directGroups(scope))
                found.push(entityOf(id));
        }
        return found.sort((left, right) => firstIndexOf(left.id) - firstIndexOf(right.id));
    };
    const edgesIn = (scope) => {
        const found = [];
        diagram.edges.forEach((edge, index) => {
            if (edge.from === edge.to)
                return;
            const from = entityAt(scope, edge.from);
            const to = entityAt(scope, edge.to);
            if (from === undefined || to === undefined || from === to)
                return;
            found.push({ index, from, to });
        });
        return found;
    };
    /** The entity that holds the initial state at this level, which is where layer zero is pinned. */
    const pinnedAt = (scope) => {
        if (diagram.init === undefined)
            return undefined;
        const entity = entityAt(scope, diagram.init);
        return entity === diagram.init || (entity !== undefined && groupById.has(entity)) ? entity : undefined;
    };
    /**
     * Lay out one weakly connected component: the pipeline, unshortened.
     *
     * A component has its own layers, its own ordering and its own coordinates. Nothing outside it can move it.
     */
    const layoutPiece = (entities, edges, pinned, seed) => {
        const byId = new Map(entities.map((entity) => [entity.id, entity]));
        const graph = {
            nodes: entities.map((entity) => ({ id: entity.id, width: entity.width, height: entity.height })),
            edges,
            ...(pinned === undefined ? {} : { init: pinned }),
        };
        const broken = breakCycles(graph);
        const layered = layer(graph, broken.edges);
        const augmented = addDummies(layered, broken.edges);
        const ordered = order(augmented.layers, augmented.chains, seed);
        const gap = edges.some((edge) => (diagram.edges[edge.index]?.label ?? '') !== '') ? LABELLED_LAYER_GAP : LAYER_GAP;
        const coordinates = assignCoordinates({
            layers: ordered.layers,
            chains: augmented.chains,
            sizeOf: (id) => {
                const entity = byId.get(id);
                return entity === undefined ? { width: 0, height: 0 } : { width: entity.width, height: entity.height };
            },
            chainOf: augmented.chainOf,
        }, { gap: NODE_GAP, layerGap: gap });
        const bands = planBands(coordinates.layerWidth, coordinates.layerHeight, gap);
        const bandOfLayer = new Array(coordinates.layerHeight.length).fill(0);
        bands.bands.forEach((band, index) => {
            for (let depth = band.first; depth <= band.last; depth += 1)
                bandOfLayer[depth] = index;
        });
        const layerTop = [];
        for (const band of bands.bands) {
            let y = 0;
            for (let depth = band.first; depth <= band.last; depth += 1) {
                layerTop[depth] = y;
                y += coordinates.layerHeight[depth] + gap;
            }
        }
        const items = new Map();
        ordered.layers.forEach((row, depth) => {
            const shift = bands.bands[bandOfLayer[depth]].offsetX;
            const top = layerTop[depth];
            const rowHeight = coordinates.layerHeight[depth];
            for (const id of row) {
                const entity = byId.get(id);
                if (entity === undefined)
                    continue;
                const centre = coordinates.x.get(id) ?? 0;
                items.set(id, {
                    box: {
                        x: centre + shift - entity.width / 2,
                        y: top + (rowHeight - entity.height) / 2,
                        width: entity.width,
                        height: entity.height,
                    },
                    group: entity.group,
                });
            }
        });
        // A lane is only worth reserving when both ends are boxes: a lane that ends on a boundary has no box to arrive
        // at, and one that crosses a band boundary is two lanes with different column offsets. Those edges get the
        // router instead.
        const lanes = new Map();
        for (const chain of augmented.chains) {
            if (chain.path.length <= 2)
                continue;
            const start = byId.get(chain.path[0]);
            const end = byId.get(chain.path[chain.path.length - 1]);
            if (start === undefined || end === undefined || start.group || end.group)
                continue;
            const fromLayer = layered.layerOf.get(chain.path[0]);
            const toLayer = layered.layerOf.get(chain.path[chain.path.length - 1]);
            if (fromLayer === undefined || toLayer === undefined)
                continue;
            if (bandOfLayer[fromLayer] !== bandOfLayer[toLayer])
                continue;
            const lane = augmented.chainOf.get(chain.path[1]);
            if (lane === undefined)
                continue;
            const laneX = coordinates.x.get(lane);
            if (laneX === undefined)
                continue;
            const shift = bands.bands[bandOfLayer[fromLayer]].offsetX;
            const points = [];
            for (let depth = fromLayer; depth < toLayer; depth += 1) {
                points.push({ x: laneX + shift, y: layerTop[depth] + coordinates.layerHeight[depth] + gap / 2 });
            }
            lanes.set(chain.index, { points, reversed: broken.reversed.has(chain.index) });
        }
        // An edge whose ends sit in two different columns is read across the page, not down it: the painter draws it
        // out of the side of one box and into the side of the other, which is where a wrapped reading order turns.
        const across = new Set();
        for (const edge of edges) {
            const from = layered.layerOf.get(edge.from);
            const to = layered.layerOf.get(edge.to);
            if (from === undefined || to === undefined)
                continue;
            if (bandOfLayer[from] !== bandOfLayer[to])
                across.add(edge.index);
        }
        let right = 0;
        let bottom = 0;
        for (const entry of items.values()) {
            right = Math.max(right, entry.box.x + entry.box.width);
            bottom = Math.max(bottom, entry.box.y + entry.box.height);
        }
        return { width: right, height: bottom, items, lanes, across };
    };
    const cache = new Map();
    function buildLevel(scope) {
        const key = scope ?? '';
        const cached = cache.get(key);
        if (cached !== undefined)
            return cached;
        const entities = entitiesIn(scope);
        if (entities.length === 0) {
            const empty = { width: 0, height: 0, items: new Map(), lanes: new Map(), across: new Set() };
            cache.set(key, empty);
            return empty;
        }
        const edges = edgesIn(scope);
        const pinned = pinnedAt(scope);
        const seed = seedOrder({ nodes: entities.map((entity) => ({ id: entity.id, width: entity.width, height: entity.height })), edges, ...(pinned === undefined ? {} : { init: pinned }) });
        const components = weakComponents(entities, edges);
        const pieces = [];
        for (const members of components) {
            const inside = new Set(members);
            const pieceEntities = entities.filter((entity) => inside.has(entity.id));
            const pieceEdges = edges.filter((edge) => inside.has(edge.from) && inside.has(edge.to));
            const pin = pinned !== undefined && inside.has(pinned) ? pinned : undefined;
            pieces.push(layoutPiece(pieceEntities, pieceEdges, pin, seed));
        }
        const packed = packRectangles(pieces.map((piece) => ({ width: piece.width, height: piece.height })), { gap: COMPONENT_GAP });
        const layout = { width: packed.width, height: packed.height, items: new Map(), lanes: new Map(), across: new Set() };
        pieces.forEach((piece, index) => {
            for (const edgeIndex of piece.across)
                layout.across.add(edgeIndex);
            const at = packed.placements[index];
            for (const [id, item] of piece.items) {
                layout.items.set(id, { box: { x: item.box.x + at.x, y: item.box.y + at.y, width: item.box.width, height: item.box.height }, group: item.group });
            }
            for (const [edgeIndex, lane] of piece.lanes) {
                layout.lanes.set(edgeIndex, { points: lane.points.map((point) => ({ x: point.x + at.x, y: point.y + at.y })), reversed: lane.reversed });
            }
        });
        cache.set(key, layout);
        return layout;
    }
    const root = buildLevel(undefined);
    const boxes = new Map();
    const groupRects = new Map();
    const lanes = new Map();
    const across = new Set();
    const placeLevel = (layout, originX, originY) => {
        for (const edgeIndex of layout.across)
            across.add(edgeIndex);
        for (const [id, item] of layout.items) {
            const box = { x: originX + item.box.x, y: originY + item.box.y, width: item.box.width, height: item.box.height };
            if (item.group) {
                groupRects.set(id, box);
                const inside = groupLayouts.get(id);
                placeLevel(inside, box.x + (box.width - inside.width) / 2, box.y + GROUP_HEADER + GROUP_PADDING);
                continue;
            }
            boxes.set(id, box);
        }
        for (const [edgeIndex, lane] of layout.lanes) {
            lanes.set(edgeIndex, { points: lane.points.map((point) => ({ x: point.x + originX, y: point.y + originY })), reversed: lane.reversed });
        }
    };
    placeLevel(root, MARGIN, top);
    let right = MARGIN;
    for (const box of boxes.values())
        right = Math.max(right, box.x + box.width);
    for (const box of groupRects.values())
        right = Math.max(right, box.x + box.width);
    return { boxes, groupRects, width: right + MARGIN, lanes, across };
}
/** The aspect ratio of a placement, for the tests that check a drawing is a page and not a strip. */
export function placementAspect(placement) {
    let right = 0;
    let bottom = 0;
    for (const box of [...placement.boxes.values(), ...placement.groupRects.values()]) {
        right = Math.max(right, box.x + box.width);
        bottom = Math.max(bottom, box.y + box.height);
    }
    return aspectOf(right, bottom);
}

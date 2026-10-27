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
 * before the decomposition even starts, and the state is put first in its component's ranking so nothing is ever
 * oriented back into it.
 *
 * Pure: the same graph in, the same edge directions out.
 */
/** Tarjan's strongly connected components, iterative enough to be read: the recursion is the algorithm. */
function tarjan(nodes, outgoing) {
    let counter = 0;
    const index = new Map();
    const low = new Map();
    const stack = [];
    const onStack = new Set();
    const found = [];
    const visit = (node) => {
        index.set(node, counter);
        low.set(node, counter);
        counter += 1;
        stack.push(node);
        onStack.add(node);
        for (const next of outgoing.get(node) ?? []) {
            if (!index.has(next)) {
                visit(next);
                low.set(node, Math.min(low.get(node), low.get(next)));
                continue;
            }
            if (onStack.has(next))
                low.set(node, Math.min(low.get(node), index.get(next)));
        }
        if (low.get(node) !== index.get(node))
            return;
        const component = [];
        let member;
        do {
            member = stack.pop();
            onStack.delete(member);
            component.push(member);
        } while (member !== node);
        found.push(component);
    };
    for (const node of nodes)
        if (!index.has(node))
            visit(node);
    return found;
}
export function breakCycles(graph) {
    const known = new Set(graph.nodes.map((node) => node.id));
    const position = new Map(graph.nodes.map((node, offset) => [node.id, offset]));
    const edges = graph.edges.map((edge) => ({ ...edge }));
    const reversed = new Set();
    const flip = (index) => {
        const edge = edges[index];
        const next = edge.from;
        edge.from = edge.to;
        edge.to = next;
    };
    // The initial state is layer zero: every edge running into it is a back edge already.
    if (graph.init !== undefined && known.has(graph.init)) {
        for (const [index, edge] of edges.entries()) {
            if (edge.to === graph.init && edge.from !== graph.init)
                flip(index);
        }
    }
    const outgoing = new Map();
    for (const edge of edges) {
        if (!known.has(edge.from) || !known.has(edge.to) || edge.from === edge.to)
            continue;
        outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    }
    const nodes = graph.nodes.map((node) => node.id);
    const raw = tarjan(nodes, outgoing);
    // Tarjan emits a component after everything it reaches, which is the reverse of a topological order.
    raw.reverse();
    const componentOf = new Map();
    const components = raw.map((members, id) => {
        for (const member of members)
            componentOf.set(member, id);
        return { id, members };
    });
    const condensation = [];
    const seen = new Set();
    for (const edge of edges) {
        const from = componentOf.get(edge.from);
        const to = componentOf.get(edge.to);
        if (from === undefined || to === undefined || from === to)
            continue;
        const key = String(from) + '>' + String(to);
        if (seen.has(key))
            continue;
        seen.add(key);
        condensation.push({ from, to });
    }
    // Inside each component: one ranking, decided greedily by how much of the flow leaves the node rather than enters
    // it. That is the order the edges are made to follow, so no two decisions can contradict each other.
    const rank = new Map();
    for (const component of components) {
        if (component.members.length < 2) {
            rank.set(component.members[0], 0);
            continue;
        }
        const inside = new Set(component.members);
        const score = new Map();
        for (const member of component.members)
            score.set(member, 0);
        for (const edge of edges) {
            if (!inside.has(edge.from) || !inside.has(edge.to) || edge.from === edge.to)
                continue;
            score.set(edge.from, score.get(edge.from) + 1);
            score.set(edge.to, score.get(edge.to) - 1);
        }
        const ordered = [...component.members].sort((left, right) => {
            if (left === graph.init)
                return -1;
            if (right === graph.init)
                return 1;
            const difference = score.get(right) - score.get(left);
            return difference !== 0 ? difference : position.get(left) - position.get(right);
        });
        ordered.forEach((member, offset) => rank.set(member, offset));
    }
    for (const [index, edge] of edges.entries()) {
        const from = rank.get(edge.from);
        const to = rank.get(edge.to);
        if (from === undefined || to === undefined || edge.from === edge.to)
            continue;
        if (componentOf.get(edge.from) !== componentOf.get(edge.to))
            continue;
        if (from > to)
            flip(index);
    }
    edges.forEach((edge, index) => {
        if (graph.edges[index].from !== edge.from)
            reversed.add(edge.index);
    });
    return { edges, reversed, components, componentOf, rank, condensation };
}

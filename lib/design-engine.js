/**
 * The design-review engine: shape, and the declared design principles.
 *
 * This is not the verification engine. That one decides whether a machine can misbehave;
 * this one decides whether a design keeps the contracts it declares about *itself* - which
 * layers may depend on which, which responsibility owns which dependency, which subtype may
 * refuse which event. The two answer different questions and their verdicts mean different
 * things, which is why they are two engines and two tools.
 *
 * Three levels, kept apart in the report because they are not the same claim:
 *
 * - **violations** - the design contradicts something it declared. These decide `verdict`.
 * - **signals** - a structural fact worth a reader's attention, reported without claiming it
 *   is wrong. A hub with high fan-in is a fact about a graph; whether it is a design defect
 *   depends on the design, and nothing here knows that.
 * - **facts** - counts and computed structure, for a reader or another tool.
 *
 * What this engine does *not* do is judge a design. It never says a decomposition is good,
 * a responsibility name is meaningful, or an abstraction is the right one. It compares a
 * design against its own declarations and computes features of its graph, and the wording of
 * every finding says which of those it is.
 *
 * @module model-everything-design-engine
 */
import { createHash } from 'node:crypto';
import { REPORT_SCHEMAS, valueHash } from './engine.js';
export { REPORT_SCHEMAS };
const STEREOTYPES = ['class', 'interface', 'abstract-class', 'enum', 'component', 'abstract-component'];
const MODEL_KEYS = new Set(['schemaVersion', 'artifact', 'architecture', 'types', 'declare', 'narrative']);
const ARCHITECTURE_KEYS = new Set(['nodes', 'edges']);
const TYPE_KEYS = new Set(['name', 'stereotype', 'extends', 'implements', 'operations', 'transitions', 'forbids', 'responsibilities', 'dependsOn', 'uses', 'layer']);
const OPERATION_KEYS = new Set(['name', 'parameters', 'returns']);
const DECLARE_KEYS = new Set(['layers', 'boundaries', 'allowedEdges', 'requiredEdges']);
function expectKeys(value, allowed, where, errors) {
    for (const key of Object.keys(value)) {
        if (key.startsWith('_'))
            continue;
        if (!allowed.has(key))
            errors.push(where + '.' + key + ': unknown field (the schema is closed; a typo would silently change the design under review)');
    }
}
/**
 * Validate a candidate design.
 *
 * The schema is closed, for the reason the verification engine gives: a mistyped field is not
 * a missing feature, it is a different design, and reviewing the wrong one silently is worse
 * than refusing.
 */
export function validateDesignModel(input) {
    const errors = [];
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        return { ok: false, errors: ['a design model must be an object with schemaVersion 1, architecture and types'] };
    }
    const model = input;
    expectKeys(model, MODEL_KEYS, 'model', errors);
    if (model.schemaVersion !== 1)
        errors.push('schemaVersion must be 1');
    if (model.architecture === null || typeof model.architecture !== 'object' || Array.isArray(model.architecture)) {
        errors.push('architecture is required and must be an object with nodes and edges');
        return { ok: false, errors };
    }
    const architecture = model.architecture;
    expectKeys(architecture, ARCHITECTURE_KEYS, 'architecture', errors);
    if (!Array.isArray(architecture.nodes))
        errors.push('architecture.nodes must be an array of ids');
    if (!Array.isArray(architecture.edges))
        errors.push('architecture.edges must be an array of [from, to] pairs');
    if (errors.length > 0)
        return { ok: false, errors };
    const nodes = architecture.nodes;
    const nodeIds = new Set();
    for (const node of nodes) {
        if (typeof node !== 'string' || node.trim() === '') {
            errors.push('architecture.nodes entries must be non-empty strings');
            continue;
        }
        if (nodeIds.has(node))
            errors.push('architecture.nodes has a duplicate: ' + node);
        nodeIds.add(node);
    }
    for (const edge of architecture.edges) {
        if (!Array.isArray(edge) || edge.length !== 2 || typeof edge[0] !== 'string' || typeof edge[1] !== 'string') {
            errors.push('architecture.edges entries must be [from, to] pairs of strings');
            continue;
        }
        if (!nodeIds.has(edge[0]))
            errors.push('architecture.edges names a node that is not declared: ' + edge[0]);
        if (!nodeIds.has(edge[1]))
            errors.push('architecture.edges names a node that is not declared: ' + edge[1]);
    }
    // A section the design did not declare is not a field that is missing: `declare` and
    // `types` are how the design states its own contracts, and a design that states none is
    // reviewed for its shape alone. Only a *present* section is checked.
    const types = (model.types ?? []);
    if (model.types !== undefined && !Array.isArray(model.types))
        errors.push('types must be an array when it is present');
    const typeNames = new Set();
    for (const entry of (Array.isArray(model.types) ? model.types : [])) {
        if (entry === null || typeof entry !== 'object') {
            errors.push('every type must be an object');
            continue;
        }
        const name = entry.name;
        if (typeof name !== 'string' || name.trim() === '') {
            errors.push('every type needs a non-empty name');
            continue;
        }
        expectKeys(entry, TYPE_KEYS, 'type ' + name, errors);
        if (typeNames.has(name))
            errors.push('duplicate type name: ' + name);
        typeNames.add(name);
        if (typeof entry.stereotype !== 'string' || !STEREOTYPES.includes(entry.stereotype)) {
            errors.push('type ' + name + ': stereotype must be one of ' + STEREOTYPES.join(' | '));
        }
        for (const operation of (entry.operations ?? [])) {
            if (operation === null || typeof operation !== 'object' || typeof operation.name !== 'string') {
                errors.push('type ' + name + ': every operation needs a name');
                continue;
            }
            expectKeys(operation, OPERATION_KEYS, 'type ' + name + ' operation ' + operation.name, errors);
        }
    }
    const declare = (model.declare ?? {});
    if (declare !== null && typeof declare === 'object' && !Array.isArray(declare))
        expectKeys(declare, DECLARE_KEYS, 'declare', errors);
    else if (model.declare !== undefined)
        errors.push('declare must be an object when it is present');
    if (errors.length > 0)
        return { ok: false, errors };
    return { ok: true, errors: [], model: input };
}
function adjacencyOf(nodes, edges) {
    const adjacency = new Map(nodes.map((id) => [id, []]));
    for (const [from, to] of edges)
        adjacency.get(from)?.push(to);
    return adjacency;
}
function undirectedOf(nodes, edges) {
    const adjacency = new Map(nodes.map((id) => [id, new Set()]));
    for (const [from, to] of edges) {
        adjacency.get(from)?.add(to);
        adjacency.get(to)?.add(from);
    }
    return adjacency;
}
/** Strongly connected components (Tarjan), returned largest first. */
function stronglyConnected(nodes, edges) {
    const adjacency = adjacencyOf(nodes, edges);
    const index = new Map();
    const low = new Map();
    const onStack = new Set();
    const stack = [];
    const components = [];
    let counter = 0;
    const visit = (id) => {
        index.set(id, counter);
        low.set(id, counter);
        counter += 1;
        stack.push(id);
        onStack.add(id);
        for (const next of adjacency.get(id) ?? []) {
            if (!index.has(next)) {
                visit(next);
                low.set(id, Math.min(low.get(id), low.get(next)));
            }
            else if (onStack.has(next)) {
                low.set(id, Math.min(low.get(id), index.get(next)));
            }
        }
        if (low.get(id) === index.get(id)) {
            const component = [];
            for (;;) {
                const popped = stack.pop();
                onStack.delete(popped);
                component.push(popped);
                if (popped === id)
                    break;
            }
            components.push(component.sort());
        }
    };
    for (const id of nodes)
        if (!index.has(id))
            visit(id);
    return components.sort((left, right) => right.length - left.length || left[0].localeCompare(right[0]));
}
/**
 * The edges a canonical peel leaves: repeatedly remove every node nothing depends on; what is
 * left cannot be peeled, because every remaining node has something depending on it.
 *
 * The wording matters. This is not a *minimum* feedback arc set: deleting exactly these is not
 * guaranteed to be the fewest edges that make the graph acyclic, and finding a minimum is
 * NP-hard (Garey & Johnson, 1979). For a directed cycle of `n` nodes it leaves all `n` edges,
 * because a peel has nowhere to start; breaking that cycle costs `n - 1` edges. So the report
 * says "these edges cannot be peeled", never "delete these".
 */
function unpeelableEdges(nodes, edges) {
    // Keyed by edge position: the peel walks out-edges, and `edges[position]` is what tells it
    // where an edge lands. Indexing by node id here silently peeled every edge of every cycle.
    const outgoing = new Map(nodes.map((id) => [id, []]));
    const indegree = new Map(nodes.map((id) => [id, 0]));
    edges.forEach(([from, to], position) => {
        outgoing.get(from)?.push(position);
        indegree.set(to, (indegree.get(to) ?? 0) + 1);
    });
    const queue = nodes.filter((id) => indegree.get(id) === 0).sort();
    const peeled = new Set();
    while (queue.length > 0) {
        const id = queue.shift();
        for (const position of outgoing.get(id) ?? []) {
            peeled.add(position);
            const next = edges[position][1];
            indegree.set(next, (indegree.get(next) ?? 0) - 1);
            if (indegree.get(next) === 0)
                queue.push(next);
        }
    }
    return edges.filter((_, position) => !peeled.has(position));
}
/** Most nodes an exact minimum feedback arc set is attempted on. */
const EXACT_FAS_LIMIT = 14;
/**
 * The fewest edges whose removal makes the graph acyclic, exactly where that is affordable.
 *
 * A minimum feedback arc set is NP-hard (Garey & Johnson, 1979), so this is a decision, not a
 * default: the edges of every cycle form the *core*, and only the core is searched. The search
 * is the standard subset dynamic program - build an ordering node by node, paying one for each
 * edge that points from a node not yet placed back to the one being placed, which is exactly
 * the set of backward edges the ordering induces. It solves graphs up to `EXACT_FAS_LIMIT`
 * nodes; past that the peel's leftover is reported instead, with `exact: false`, because a
 * wrong number presented as a minimum would be worse than a stated upper bound.
 */
function minimumFeedbackArcs(nodes, edges) {
    const unpeelable = unpeelableEdges(nodes, edges);
    if (unpeelable.length === 0) {
        return { edges: [], exact: true, note: 'the graph is acyclic: no edge has to go' };
    }
    const core = [...new Set(unpeelable.flatMap(([from, to]) => [from, to]))].sort();
    if (core.length > EXACT_FAS_LIMIT) {
        return {
            edges: unpeelable,
            exact: false,
            note: 'the cyclic part has ' + String(core.length) + ' nodes, past the ' + String(EXACT_FAS_LIMIT) + ' this search decides exactly (a minimum feedback arc set is NP-hard, Garey & Johnson 1979). These are the edges a canonical peel cannot remove: an upper bound, not a minimum.',
        };
    }
    const index = new Map(core.map((id, position) => [id, position]));
    const size = core.length;
    const total = 1 << size;
    const cost = new Int32Array(total);
    const choice = new Int8Array(total);
    const INFINITE = 0x3fffffff;
    cost.fill(INFINITE);
    cost[0] = 0;
    for (let mask = 0; mask < total; mask += 1) {
        const base = cost[mask];
        if (base === INFINITE)
            continue;
        for (let candidate = 0; candidate < size; candidate += 1) {
            const bit = 1 << candidate;
            if ((mask & bit) !== 0)
                continue;
            // Edges from a node not yet placed into the node being placed: they point backwards in
            // the ordering being built, so each one is an edge the ordering would have to cut.
            let backwards = 0;
            for (const [from, to] of edges) {
                if (index.get(to) !== candidate)
                    continue;
                const source = index.get(from);
                if (source === undefined || source === candidate)
                    continue;
                if ((mask & (1 << source)) === 0)
                    backwards += 1;
            }
            const next = mask | bit;
            if (base + backwards < cost[next]) {
                cost[next] = base + backwards;
                choice[next] = candidate;
            }
        }
    }
    const order = [];
    for (let mask = total - 1; mask !== 0;) {
        const candidate = choice[mask];
        order.push(candidate);
        mask &= ~(1 << candidate);
    }
    order.reverse();
    const placed = new Map(order.map((node, position) => [node, position]));
    const cuts = edges.filter(([from, to]) => {
        const left = index.get(from);
        const right = index.get(to);
        if (left === undefined || right === undefined)
            return false;
        // An edge inside the core that runs against the chosen order is one of the removed edges.
        return placed.get(right) < placed.get(left);
    });
    return {
        edges: cuts,
        exact: true,
        note: 'a minimum: no smaller set of edges makes this graph acyclic (found by subset search over the ' + String(size) + '-node cyclic part)',
    };
}
function articulationAndBridges(nodes, edges) {
    const adjacency = new Map(nodes.map((id) => [id, []]));
    edges.forEach(([from, to], position) => {
        adjacency.get(from)?.push([to, position]);
        adjacency.get(to)?.push([from, position]);
    });
    const discovery = new Map();
    const low = new Map();
    const points = new Set();
    const bridges = [];
    let counter = 0;
    const visit = (id, viaEdge, isRoot) => {
        discovery.set(id, counter);
        low.set(id, counter);
        counter += 1;
        let children = 0;
        for (const [next, position] of adjacency.get(id) ?? []) {
            if (position === viaEdge)
                continue;
            if (!discovery.has(next)) {
                children += 1;
                visit(next, position, false);
                low.set(id, Math.min(low.get(id), low.get(next)));
                if (!isRoot && low.get(next) >= discovery.get(id))
                    points.add(id);
                if (low.get(next) > discovery.get(id))
                    bridges.push(edges[position]);
            }
            else {
                low.set(id, Math.min(low.get(id), discovery.get(next)));
            }
        }
        if (isRoot && children > 1)
            points.add(id);
    };
    for (const id of nodes)
        if (!discovery.has(id))
            visit(id, -1, true);
    return { points: [...points].sort(), bridges: bridges.sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1])) };
}
/** Longest-path rank over the condensation: the depth a node sits at once cycles are collapsed. */
function ranksOf(nodes, edges) {
    const components = stronglyConnected(nodes, edges);
    const componentOf = new Map();
    components.forEach((members, index) => members.forEach((id) => componentOf.set(id, index)));
    const dag = new Map(components.map((_, index) => [index, new Set()]));
    const indegree = new Map(components.map((_, index) => [index, 0]));
    for (const [from, to] of edges) {
        const left = componentOf.get(from);
        const right = componentOf.get(to);
        if (left === right || dag.get(left).has(right))
            continue;
        dag.get(left).add(right);
        indegree.set(right, (indegree.get(right) ?? 0) + 1);
    }
    const rank = new Map(components.map((_, index) => [index, 0]));
    const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([index]) => index).sort((left, right) => left - right);
    while (queue.length > 0) {
        const current = queue.shift();
        for (const next of dag.get(current) ?? []) {
            rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(current) ?? 0) + 1));
            indegree.set(next, (indegree.get(next) ?? 0) - 1);
            if (indegree.get(next) === 0)
                queue.push(next);
        }
    }
    const out = {};
    for (const id of [...nodes].sort())
        out[id] = rank.get(componentOf.get(id)) ?? 0;
    return out;
}
/** Every shape feature, computed once so every check reads the same numbers. */
export function designFeatures(model) {
    const nodes = model.architecture.nodes;
    const edges = model.architecture.edges;
    const adjacency = undirectedOf(nodes, edges);
    const seen = new Set();
    let components = 0;
    for (const id of nodes) {
        if (seen.has(id))
            continue;
        components += 1;
        const queue = [id];
        while (queue.length > 0) {
            const current = queue.pop();
            if (seen.has(current))
                continue;
            seen.add(current);
            for (const next of adjacency.get(current) ?? [])
                queue.push(next);
        }
    }
    const directed = adjacencyOf(nodes, edges);
    const fanOut = {};
    const fanIn = {};
    for (const id of nodes)
        fanOut[id] = new Set(directed.get(id) ?? []).size;
    for (const id of nodes)
        fanIn[id] = 0;
    for (const [, to] of edges)
        fanIn[to] = (fanIn[to] ?? 0) + 1;
    const mutualPairs = [];
    for (const [from, to] of edges) {
        if (from < to && edges.some(([otherFrom, otherTo]) => otherFrom === to && otherTo === from))
            mutualPairs.push([from, to]);
    }
    const scc = stronglyConnected(nodes, edges);
    const largest = scc[0] ?? [];
    const { points, bridges } = articulationAndBridges(nodes, edges);
    return {
        nodes: nodes.length,
        edges: edges.length,
        components,
        cyclomatic: edges.length - nodes.length + 2 * components,
        density: nodes.length < 2 ? 0 : Number((edges.length / (nodes.length * (nodes.length - 1))).toFixed(6)),
        largestCycle: largest.length > 1 ? largest : [],
        feedbackArcs: minimumFeedbackArcs(nodes, edges),
        articulationPoints: points,
        bridges,
        ranks: ranksOf(nodes, edges),
        fanOut,
        fanIn,
        mutualPairs: mutualPairs.sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1])),
    };
}
function check(id, name, findings, detail) {
    const errors = findings.filter((finding) => finding.severity === 'error').length;
    const warnings = findings.filter((finding) => finding.severity === 'warning').length;
    return {
        id,
        name,
        status: errors + warnings === 0 ? 'pass' : 'fail',
        detail: detail !== '' ? detail : (errors + warnings === 0 ? 'nothing to report' : String(errors) + ' error(s), ' + String(warnings) + ' warning(s)'),
        findings,
    };
}
/**
 * A check that had nothing to hold the design to.
 *
 * This is deliberately not `pass`. A design that declares no layers cannot violate a layer
 * order, and reporting that as a pass would read as "this design's layering was verified".
 * The distinction reaches the reader through `facts.checksSkipped` and `nextSteps`.
 */
function skip(id, name, why) {
    return { id, name, status: 'skip', detail: 'skipped: ' + why, findings: [] };
}
const typesByName = (model) => new Map((model.types ?? []).map((entry) => [entry.name, entry]));
/**
 * DES12: a name a type relation points at, resolved.
 *
 * `architecture.edges` had both endpoints resolved and `requiredEdges` had its edge checked, but
 * every type relation was taken on trust: `extends: 'Ghost'`, a type extending itself, a cycle of
 * extends, `implements: ['Ghost']`, an interface implementing itself, `dependsOn: ['Ghost']`,
 * `uses: [{type: 'Ghost'}]` and a layer member that is not an architecture node all returned
 * verdict=pass with no findings. A reader had no way to tell a design that satisfies its
 * declarations from one whose declarations point at nothing.
 *
 * DES7 already skipped a base it could not find (`if (base === undefined) continue`) and then
 * reported "no declared contract is strengthened or weakened" - the same shape of empty all-clear
 * the robustness audit found in the other two engines.
 */
function DES12_typeRelations(model) {
    const findings = [];
    const types = model.types ?? [];
    const byName = typesByName(model);
    const architectureNodes = new Set(model.architecture.nodes);
    const missingType = (type, field, name) => {
        findings.push({
            code: 'DES12_UNKNOWN_TYPE',
            severity: 'error',
            message: type.name + '.' + field + ' names a type the model does not declare: ' + JSON.stringify(name) + '.',
            detail: 'A relation that resolves to nothing is not checked, so the report would say the design keeps a contract it never read.',
            evidence: { type: type.name, field, name },
        });
    };
    for (const type of types) {
        if (type.extends !== undefined) {
            if (type.extends === type.name) {
                findings.push({
                    code: 'DES12_TYPE_CYCLE',
                    severity: 'error',
                    message: type.name + ' extends itself, so it can never be the base of anything.',
                    evidence: { type: type.name, cycle: [type.name, type.name] },
                });
            }
            else if (!byName.has(type.extends)) {
                missingType(type, 'extends', type.extends);
            }
        }
        for (const implemented of type.implements ?? []) {
            if (implemented === type.name) {
                findings.push({
                    code: 'DES12_TYPE_CYCLE',
                    severity: 'error',
                    message: type.name + ' implements itself, which is not a relation.',
                    evidence: { type: type.name, cycle: [type.name, type.name] },
                });
            }
            else if (!byName.has(implemented)) {
                missingType(type, 'implements', implemented);
            }
        }
        for (const dependency of type.dependsOn ?? []) {
            // A dependency may name anything in the architecture, not only a declared type: the
            // architecture is the graph the shape features are computed from, and a node without a type
            // is normal.
            if (!byName.has(dependency) && !architectureNodes.has(dependency))
                missingType(type, 'dependsOn', dependency);
        }
        for (const use of type.uses ?? []) {
            if (!byName.has(use.type) && !architectureNodes.has(use.type))
                missingType(type, 'uses', use.type);
        }
    }
    // A cycle through `extends`, not only a self-loop: a chain that closes on itself has no
    // most-general type, so the substitutability question has no answer rather than a yes.
    const chain = (start) => {
        const seen = [];
        let current = start;
        while (current !== undefined && current.extends !== undefined) {
            if (seen.includes(current.name))
                return [...seen, current.name];
            seen.push(current.name);
            current = byName.get(current.extends);
        }
        return undefined;
    };
    const reported = new Set();
    for (const type of types) {
        const cycle = chain(type);
        if (cycle === undefined)
            continue;
        const key = [...cycle].sort().join(',');
        if (reported.has(key))
            continue;
        reported.add(key);
        findings.push({
            code: 'DES12_TYPE_CYCLE',
            severity: 'error',
            message: 'the inheritance chain ' + cycle.join(' -> ') + ' closes on itself, so none of these types has a most-general base.',
            detail: 'Substitutability is decided over this chain: a cycle means the question has no answer, not that the answer is yes.',
            evidence: { cycle },
        });
    }
    // Every declared layer and boundary member must be a node of the architecture, or the layer
    // order and the boundary rules are computed over names that do not exist.
    const declare = model.declare ?? {};
    for (const [kind, groups] of [['layers', declare.layers ?? []], ['boundaries', declare.boundaries ?? []]]) {
        for (const group of groups) {
            for (const member of group.members) {
                if (architectureNodes.has(member))
                    continue;
                findings.push({
                    code: 'DES12_UNKNOWN_NODE',
                    severity: 'error',
                    message: group.name + ' (declared under ' + kind + ') lists ' + JSON.stringify(member) + ', which the architecture does not declare.',
                    detail: 'A member that is not a node cannot break a layer order or a boundary rule, so listing it hides the member that should have been there.',
                    evidence: { group: group.name, kind, member },
                });
            }
        }
    }
    // A rule whose source names no declared group judges nothing, and a required edge with an
    // unknown endpoint could never have been satisfied.
    const groupNames = new Set([
        ...(declare.layers ?? []).map((group) => group.name),
        ...(declare.boundaries ?? []).map((group) => group.name),
    ]);
    for (const rule of declare.allowedEdges ?? []) {
        if (rule.source === '*' || groupNames.has(rule.source))
            continue;
        findings.push({
            code: 'DES12_UNKNOWN_NODE',
            severity: 'error',
            message: 'allowedEdges rule ' + rule.id + ' has source ' + JSON.stringify(rule.source) + ', which names no declared layer or boundary.',
            detail: 'A rule with no source judges no edge, so its allow and deny lists are never consulted.',
            evidence: { rule: rule.id, source: rule.source },
        });
    }
    for (const requirement of declare.requiredEdges ?? []) {
        if (architectureNodes.has(requirement.from) && architectureNodes.has(requirement.to))
            continue;
        const unknown = [requirement.from, requirement.to].filter((node) => !architectureNodes.has(node));
        findings.push({
            code: 'DES12_UNKNOWN_NODE',
            severity: 'error',
            message: 'requiredEdges entry ' + requirement.id + ' names ' + unknown.map((node) => JSON.stringify(node)).join(' and ') + ', which the architecture does not declare.',
            detail: 'DES6 can only report that the edge is absent; an endpoint that is not a node means the requirement was never satisfiable.',
            evidence: { requirement: requirement.id, from: requirement.from, to: requirement.to, unknown },
        });
    }
    return check('DES12', 'Type Relations', findings, findings.length === 0 ? 'every type relation and declared member resolves' : 'Unresolved relations: ' + String(findings.length));
}
/** DES1: a cycle in a design, named with the canonical peeling that would break it. */
function DES1_cycles(model, features) {
    const findings = [];
    if (features.feedbackArcs.edges.length > 0) {
        const members = features.largestCycle;
        findings.push({
            code: 'DES1_CYCLE',
            severity: 'error',
            message: 'the dependency graph is cyclic: ' + (features.feedbackArcs.exact ? 'the fewest edges that make it acyclic is ' : 'at least ') + String(features.feedbackArcs.edges.length) + ', and the largest mutual-dependency group has ' + String(members.length) + ' members.',
            detail: (features.feedbackArcs.exact
                ? 'A minimum: these ' + String(features.feedbackArcs.edges.length) + ' edge(s) are the fewest whose removal makes the graph acyclic. '
                : 'An upper bound, not a minimum: these are the edges a canonical peel cannot remove. ') + features.feedbackArcs.edges.map(([from, to]) => from + ' -> ' + to).join(', ') + '. ' + features.feedbackArcs.note + (members.length > 1 ? ' Mutually reachable: ' + members.join(', ') + '.' : ''),
            evidence: { feedbackArcs: features.feedbackArcs.edges, feedbackArcsExact: features.feedbackArcs.exact, largestCycle: members, ranks: features.ranks },
        });
    }
    return check('DES1', 'Acyclic Dependency', findings, findings.length === 0 ? 'the graph is acyclic' : 'cycles: ' + String(features.feedbackArcs.edges.length));
}
/** DES2: the edges a declared layering forbids — upward, or skipping a band. */
function DES2_layerOrder(model, features) {
    const layers = model.declare?.layers ?? [];
    if (layers.length === 0)
        return skip('DES2', 'Layer Order', 'the design declares no layers');
    const layerOf = new Map();
    layers.forEach((layer, index) => layer.members.forEach((member) => layerOf.set(member, index)));
    const findings = [];
    for (const [from, to] of model.architecture.edges) {
        const left = layerOf.get(from);
        const right = layerOf.get(to);
        if (left === undefined || right === undefined)
            continue;
        if (left === right)
            continue;
        if (right > left + 1) {
            findings.push({
                code: 'DES2_LAYER_ORDER',
                severity: 'error',
                message: from + ' (layer ' + layers[left].name + ') depends on ' + to + ' (layer ' + layers[right].name + '), skipping ' + layers.slice(left + 1, right).map((layer) => layer.name).join(', ') + '.',
                detail: 'A declared layering says which bands may depend on which; an edge that jumps a band is not a style question, it is a dependency the declaration does not admit.',
                evidence: { from, to, fromLayer: layers[left].name, toLayer: layers[right].name, skipped: layers.slice(left + 1, right).map((layer) => layer.name) },
            });
        }
        else if (right < left) {
            findings.push({
                code: 'DES2_LAYER_ORDER',
                severity: 'error',
                message: from + ' (layer ' + layers[left].name + ') depends upward on ' + to + ' (layer ' + layers[right].name + ').',
                detail: 'The layers are declared in order, so a later band depending on an earlier one inverts the declaration.',
                evidence: { from, to, fromLayer: layers[left].name, toLayer: layers[right].name },
            });
        }
    }
    // Two layers claiming the same member is a declaration defect: no edge can satisfy both.
    const claimed = new Map();
    for (const layer of layers) {
        for (const member of layer.members) {
            const previous = claimed.get(member);
            if (previous !== undefined && previous !== layer.name) {
                findings.push({
                    code: 'DES2_LAYER_ORDER',
                    severity: 'error',
                    message: member + ' is claimed by two layers (' + previous + ' and ' + layer.name + '), so the ordering says two things at once.',
                    evidence: { member, layers: [previous, layer.name] },
                });
            }
            claimed.set(member, layer.name);
        }
    }
    void features;
    return check('DES2', 'Layer Order', findings, findings.length === 0 ? 'every edge follows the declared order' : String(findings.length) + ' edge(s) against the declaration');
}
/** DES3: an edge that crosses a declared boundary the rules do not allow. */
function DES3_boundaries(model) {
    const boundaries = model.declare?.boundaries ?? [];
    const rules = model.declare?.allowedEdges ?? [];
    if (boundaries.length === 0)
        return skip('DES3', 'Boundary Leak', 'the design declares no boundaries');
    const boundaryOf = new Map();
    for (const boundary of boundaries)
        for (const member of boundary.members)
            boundaryOf.set(member, boundary.name);
    const findings = [];
    for (const [from, to] of model.architecture.edges) {
        const left = boundaryOf.get(from);
        const right = boundaryOf.get(to);
        if (left === undefined || right === undefined || left === right)
            continue;
        const permitted = rules.some((rule) => {
            const sourceMatches = rule.source === left || rule.source === '*';
            const denied = (rule.deny ?? []).some((target) => target === right || target === '*');
            if (denied)
                return false;
            const allowed = rule.allow ?? [];
            return allowed.length === 0 ? sourceMatches : allowed.some((target) => target === right || target === '*');
        });
        if (permitted)
            continue;
        findings.push({
            code: 'DES3_BOUNDARY_LEAK',
            severity: 'error',
            message: from + ' (' + left + ') depends on ' + to + ' (' + right + '), and no declared rule allows ' + left + ' -> ' + right + '.',
            detail: 'Boundaries partition responsibility; an edge across one that the declaration does not admit means the two are not as separate as the model says.',
            evidence: { from, to, fromBoundary: left, toBoundary: right },
        });
    }
    return check('DES3', 'Boundary Leak', findings, findings.length === 0 ? 'no edge crosses a boundary without a rule allowing it' : String(findings.length) + ' crossing(s) not allowed');
}
/** DES4: a node whose removal disconnects the design — a single point of failure, as a fact. */
function DES4_loadBearing(model, features) {
    const findings = [];
    for (const id of features.articulationPoints) {
        findings.push({
            code: 'DES4_LOAD_BEARING_ELEMENT',
            severity: 'warning',
            message: 'removing ' + id + ' disconnects the dependency graph: everything on one side reaches the other only through it. ' + id + ' is an articulation point.',
            detail: 'This is a fact about the graph, not a verdict about the design. A gateway layer is supposed to be such a node; the point is that it was not stated.',
            evidence: { node: id, kind: 'articulation point' },
        });
    }
    for (const [from, to] of features.bridges) {
        findings.push({
            code: 'DES4_LOAD_BEARING_ELEMENT',
            severity: 'warning',
            message: 'the edge ' + from + ' -> ' + to + ' is a bridge: it is the only dependency joining its two sides.',
            evidence: { from, to, kind: 'bridge' },
        });
    }
    return check('DES4', 'Load-Bearing Elements', findings, findings.length === 0 ? 'no articulation point and no bridge' : String(findings.length) + ' element(s) the graph depends on');
}
/** DES5: something the design never placed — no layer, no boundary, no rule mentions it. */
function DES5_undeclared(model) {
    const layers = model.declare?.layers ?? [];
    const boundaries = model.declare?.boundaries ?? [];
    if (layers.length === 0 && boundaries.length === 0)
        return skip('DES5', 'Placement', 'the design declares no layers and no boundaries');
    const placed = new Set();
    for (const layer of layers)
        for (const member of layer.members)
            placed.add(member);
    for (const boundary of boundaries)
        for (const member of boundary.members)
            placed.add(member);
    const findings = [];
    for (const id of model.architecture.nodes) {
        if (placed.has(id))
            continue;
        findings.push({
            code: 'DES5_UNDECLARED_NODE',
            severity: 'error',
            message: id + ' is in the architecture but in no declared layer and no declared boundary, so the design says nothing about where it belongs.',
            evidence: { node: id, layers: layers.map((layer) => layer.name), boundaries: boundaries.map((boundary) => boundary.name) },
        });
    }
    return check('DES5', 'Placement', findings, findings.length === 0 ? 'every node is placed' : String(findings.length) + ' node(s) unplaced');
}
/** DES6: a dependency the design says must exist, and does not. */
function DES6_required(model) {
    const required = model.declare?.requiredEdges ?? [];
    if (required.length === 0)
        return skip('DES6', 'Required Dependencies', 'the design declares no required edges');
    const present = new Set(model.architecture.edges.map(([from, to]) => from + '\u0000' + to));
    const findings = [];
    for (const requirement of required) {
        if (present.has(requirement.from + '\u0000' + requirement.to))
            continue;
        findings.push({
            code: 'DES6_MISSING_REQUIRED_EDGE',
            severity: 'error',
            message: requirement.id + ': the design requires ' + requirement.from + ' -> ' + requirement.to + ', and the architecture does not have it.',
            evidence: { id: requirement.id, from: requirement.from, to: requirement.to },
        });
    }
    return check('DES6', 'Required Dependencies', findings, findings.length === 0 ? 'every required edge is present' : String(findings.length) + ' missing');
}
/**
 * DES7: substitutability, where the model states the contract.
 *
 * The decidable fragment, in the vocabulary this model has: a subtype may not refuse an event
 * its supertype accepts (that is a strengthened precondition), and a signature may only stay
 * or widen in parameters and stay or narrow in results. Liskov & Wing, *A Behavioral Notion
 * of Subtyping*, TOPLAS 1994.
 */
function DES7_substitution(model) {
    const types = model.types ?? [];
    const byName = typesByName(model);
    const withBehaviour = types.filter((entry) => entry.transitions !== undefined || entry.forbids !== undefined);
    if (withBehaviour.length === 0)
        return skip('DES7', 'Substitutability', 'no type declares transitions or forbids, so no behavioural contract is stated');
    const findings = [];
    for (const entry of types) {
        if (entry.extends === undefined)
            continue;
        const base = byName.get(entry.extends);
        if (base === undefined)
            continue;
        // Behaviour: the supertype accepts an event the subtype refuses.
        const baseEvents = new Set((base.transitions ?? []).map((transition) => transition.event));
        const baseForbidden = new Set((base.forbids ?? []).map((rule) => rule.event));
        for (const rule of entry.forbids ?? []) {
            if (baseForbidden.has(rule.event))
                continue;
            if (!baseEvents.has(rule.event))
                continue;
            findings.push({
                code: 'DES7_LSP_CONTRACT',
                severity: 'error',
                message: entry.name + ' refuses ' + rule.event + ', which its supertype ' + base.name + ' declares it handles. A subtype may not strengthen a precondition.',
                detail: 'Liskov & Wing (1994): a subtype must accept everything its supertype accepts. Refusing an event the supertype handles means the subtype cannot stand in for it.',
                evidence: { subtype: entry.name, base: base.name, event: rule.event, kind: 'forbidden event' },
            });
        }
        // A guard the subtype states in words and the supertype does not: a strengthened
        // precondition, only when the text differs and both exist.
        for (const transition of entry.transitions ?? []) {
            const baseTransition = (base.transitions ?? []).find((candidate) => candidate.event === transition.event);
            if (baseTransition?.guard === undefined || transition.guard === undefined)
                continue;
            if (baseTransition.guard === transition.guard)
                continue;
            findings.push({
                code: 'DES7_LSP_CONTRACT',
                severity: 'warning',
                message: entry.name + ' guards ' + transition.event + ' with ' + JSON.stringify(transition.guard) + ' where ' + base.name + ' states ' + JSON.stringify(baseTransition.guard) + '.',
                detail: 'The guards are compared as text, not parsed: a differing guard on an inherited event is reported for a reader to judge, because whether it strengthens or weakens the precondition is not decidable from two strings.',
                evidence: { subtype: entry.name, base: base.name, event: transition.event, subGuard: transition.guard, baseGuard: baseTransition.guard, kind: 'guard text differs' },
            });
        }
        // Signature: parameters may widen, results may narrow. Both need the model to say what
        // the supertype relationship is, so only an explicit widening/narrowing declares it.
        for (const operation of entry.operations ?? []) {
            const inherited = (base.operations ?? []).find((candidate) => candidate.name === operation.name);
            if (inherited === undefined)
                continue;
            const baseParameters = inherited.parameters ?? [];
            const parameters = operation.parameters ?? [];
            if (parameters.length !== baseParameters.length) {
                findings.push({
                    code: 'DES7_LSP_CONTRACT',
                    severity: 'error',
                    message: entry.name + '.' + operation.name + ' takes ' + String(parameters.length) + ' parameter(s) where ' + base.name + '.' + operation.name + ' takes ' + String(baseParameters.length) + '.',
                    detail: 'A subtype operation must accept at least what the supertype operation accepts.',
                    evidence: { subtype: entry.name, base: base.name, operation: operation.name, kind: 'arity changed' },
                });
            }
        }
    }
    return check('DES7', 'Substitutability', findings, findings.length === 0 ? 'no declared contract is strengthened or weakened' : String(findings.length) + ' contract(s) against the declaration');
}
/**
 * DES8: an interface carrying operations no client calls.
 *
 * Martin (2002); and the empirical line on interface design anomalies, where unused methods
 * and fat interfaces are the measured defect. The check needs `uses`, which is the model's
 * statement of what each client actually calls.
 */
function DES8_interfaceWidth(model) {
    const types = model.types ?? [];
    const interfaces = types.filter((entry) => entry.stereotype === 'interface' && (entry.operations ?? []).length > 0);
    if (interfaces.length === 0)
        return skip('DES8', 'Interface Width', 'the design declares no interface with operations');
    const called = new Map();
    for (const client of types) {
        for (const dependency of client.uses ?? []) {
            const set = called.get(dependency.type) ?? new Set();
            for (const operation of dependency.operations)
                set.add(operation);
            called.set(dependency.type, set);
        }
        for (const implemented of client.implements ?? []) {
            // An implementer must provide every operation, so implementing does not tell us which
            // ones are needed - only calling does.
            void implemented;
        }
    }
    const findings = [];
    for (const entry of interfaces) {
        const used = called.get(entry.name) ?? new Set();
        const unused = (entry.operations ?? []).map((operation) => operation.name).filter((name) => !used.has(name));
        if (unused.length === 0)
            continue;
        findings.push({
            code: 'DES8_ISP_UNUSED_OPERATION',
            severity: 'warning',
            message: entry.name + ' declares ' + String(unused.length) + ' operation(s) no client in this model calls: ' + unused.join(', ') + '.',
            detail: 'A client that must know about operations it never calls is coupled to them: that is the fat-interface signal (Martin, 2002; the interface-anomaly literature measures unused methods as the defect). This is a signal, not a verdict - a published interface may keep operations for callers outside this model.',
            evidence: { interface: entry.name, unused, called: [...used].sort() },
        });
    }
    return check('DES8', 'Interface Width', findings, findings.length === 0 ? 'every declared operation is called by some client' : String(findings.length) + ' interface(s) wider than their callers');
}
/** DES9: an interface whose clients split into groups sharing no operation. */
function DES9_interfaceSplit(model) {
    const types = model.types ?? [];
    const interfaces = new Set(types.filter((entry) => entry.stereotype === 'interface').map((entry) => entry.name));
    if (interfaces.size === 0)
        return skip('DES9', 'Interface Cohesion', 'the design declares no interface');
    const groups = new Map();
    for (const client of types) {
        for (const dependency of client.uses ?? []) {
            if (!interfaces.has(dependency.type))
                continue;
            const key = [...dependency.operations].sort().join(',');
            if (key === '')
                continue;
            const byInterface = groups.get(dependency.type) ?? new Map();
            byInterface.set(key, [...(byInterface.get(key) ?? []), client.name]);
            groups.set(dependency.type, byInterface);
        }
    }
    const findings = [];
    for (const [name, byInterface] of groups) {
        if (byInterface.size < 2)
            continue;
        const sets = [...byInterface.keys()].map((key) => new Set(key.split(',')));
        let overlap = false;
        for (let left = 0; left < sets.length && !overlap; left += 1) {
            for (let right = left + 1; right < sets.length; right += 1) {
                for (const operation of sets[left])
                    if (sets[right].has(operation)) {
                        overlap = true;
                        break;
                    }
            }
        }
        if (overlap)
            continue;
        findings.push({
            code: 'DES9_ISP_DISJOINT_CLIENTS',
            severity: 'error',
            message: name + ' is called by client groups that share no operation: ' + [...byInterface.entries()].map(([operations, clients]) => clients.join('/') + ' call ' + operations).join('; ') + '.',
            detail: 'Two sets of clients with no operation in common are two interfaces wearing one name: neither group can be changed without touching the other. Martin (2002) states this as the interface segregation principle; here it is decided over the calls the model declares.',
            evidence: { interface: name, groups: [...byInterface.entries()].map(([operations, clients]) => ({ operations: operations.split(','), clients })) },
        });
    }
    return check('DES9', 'Interface Cohesion', findings, findings.length === 0 ? 'no interface is called by disjoint client groups' : String(findings.length) + ' split interface(s)');
}
/**
 * DES10: a declared responsibility that does not match the dependencies the model gives it.
 *
 * The comparison is only as good as the tags: this says the tags and the dependency list
 * disagree - a dependency no responsibility owns, or a responsibility owning nothing - and it
 * cannot say whether a responsibility is the right one, or named honestly.
 */
function DES10_responsibilities(model) {
    const types = (model.types ?? []).filter((entry) => (entry.responsibilities ?? []).length > 0);
    if (types.length === 0)
        return skip('DES10', 'Responsibility Boundaries', 'no type declares responsibilities');
    const findings = [];
    for (const entry of types) {
        const declared = entry.responsibilities ?? [];
        const dependencies = [...new Set(entry.dependsOn ?? [])];
        const owners = new Map();
        for (const responsibility of declared) {
            for (const dependency of responsibility.uses) {
                owners.set(dependency, [...(owners.get(dependency) ?? []), responsibility.name]);
            }
        }
        const unclaimed = dependencies.filter((dependency) => !owners.has(dependency));
        if (unclaimed.length > 0) {
            findings.push({
                code: 'DES10_RESPONSIBILITY_GAP',
                severity: 'warning',
                message: entry.name + ' depends on ' + unclaimed.join(', ') + ', which no declared responsibility owns.',
                detail: 'The responsibilities and the dependency list disagree. Either the dependency belongs to a responsibility that was not declared, or the tag list is incomplete - the model cannot say which, so this is reported as the disagreement it is.',
                evidence: { type: entry.name, unclaimed, responsibilities: declared.map((responsibility) => responsibility.name) },
            });
        }
        const empty = declared.filter((responsibility) => responsibility.uses.length === 0);
        if (empty.length > 0) {
            findings.push({
                code: 'DES10_RESPONSIBILITY_GAP',
                severity: 'warning',
                message: entry.name + ' declares responsibilities that own no dependency: ' + empty.map((responsibility) => responsibility.name).join(', ') + '.',
                detail: 'A responsibility owning nothing is either not implemented here or a rename that was never finished.',
                evidence: { type: entry.name, empty: empty.map((responsibility) => responsibility.name) },
            });
        }
        const shared = [...owners.entries()].filter(([, names]) => names.length > 1);
        for (const [dependency, names] of shared) {
            findings.push({
                code: 'DES10_RESPONSIBILITY_GAP',
                severity: 'warning',
                message: entry.name + ': ' + dependency + ' is claimed by ' + String(names.length) + ' responsibilities (' + names.join(', ') + ').',
                detail: 'Two responsibilities reaching the same dependency are not separable: changing that dependency touches both.',
                evidence: { type: entry.name, dependency, responsibilities: names },
            });
        }
    }
    return check('DES10', 'Responsibility Boundaries', findings, findings.length === 0 ? 'every declared responsibility matches the dependencies' : String(findings.length) + ' mismatch(es)');
}
/** DES11: an abstraction that depends on a concrete type. */
function DES11_inversion(model) {
    const types = model.types ?? [];
    const abstractions = new Set(types.filter((entry) => entry.stereotype === 'interface' || entry.stereotype === 'abstract-class' || entry.stereotype === 'abstract-component').map((entry) => entry.name));
    if (abstractions.size === 0)
        return skip('DES11', 'Dependency Inversion', 'the design declares no interface and no abstract type');
    const concretes = new Map(types.filter((entry) => entry.stereotype === 'class' || entry.stereotype === 'component').map((entry) => [entry.name, entry]));
    const findings = [];
    for (const entry of types) {
        if (!abstractions.has(entry.name))
            continue;
        for (const dependency of entry.dependsOn ?? []) {
            if (!concretes.has(dependency))
                continue;
            findings.push({
                code: 'DES11_CONCRETE_DEPENDENCY',
                severity: 'warning',
                message: entry.name + ' is declared an abstraction and depends on the concrete type ' + dependency + '.',
                detail: 'Dependency inversion (Martin, 2002) asks the abstraction to depend on nothing concrete, so the concrete type can be replaced. This is a signal about the declared stereotype and the declared dependencies; whether the dependency is real is the extractor\'s question.',
                evidence: { abstraction: entry.name, concrete: dependency, stereotype: entry.stereotype },
            });
        }
    }
    return check('DES11', 'Dependency Inversion', findings, findings.length === 0 ? 'no abstraction depends on a declared concrete type' : String(findings.length) + ' concrete dependency(ies)');
}
/** Which level each code belongs to, so a reader never has to guess. */
export const DESIGN_CODE_LEVEL = {
    DES1_CYCLE: 'violation',
    DES2_LAYER_ORDER: 'violation',
    DES3_BOUNDARY_LEAK: 'violation',
    DES4_LOAD_BEARING_ELEMENT: 'signal',
    DES5_UNDECLARED_NODE: 'violation',
    DES6_MISSING_REQUIRED_EDGE: 'violation',
    DES7_LSP_CONTRACT: 'violation',
    DES8_ISP_UNUSED_OPERATION: 'signal',
    DES9_ISP_DISJOINT_CLIENTS: 'violation',
    DES10_RESPONSIBILITY_GAP: 'signal',
    DES11_CONCRETE_DEPENDENCY: 'signal',
    DES12_UNKNOWN_TYPE: 'violation',
    DES12_TYPE_CYCLE: 'violation',
    DES12_UNKNOWN_NODE: 'violation',
};
function verdictOf(errors, warnings, first) {
    // `first error:` rather than `first:` - what follows is a code, and the reader should be able to tell.
    if (errors > 0)
        return { verdict: 'fail', verdictReason: String(errors) + ' error finding(s)' + (first === undefined ? '' : ' (first error: ' + first + ')') };
    if (warnings > 0)
        return { verdict: 'pass_with_findings', verdictReason: String(warnings) + ' warning finding(s)' };
    return { verdict: 'pass', verdictReason: 'no error or warning findings' };
}
/**
 * Review a design: its graph, and the contracts it declares about itself.
 *
 * Read `verdict`, never `ok`. A design that declares nothing gets `pass` with an empty
 * vocabulary only for the checks that had something to hold it to - which is why the report
 * carries each check's `status` and `detail`, and why `facts.declared` says how much the
 * model actually declared.
 */
export function runDesignReview(input) {
    const validation = validateDesignModel(input);
    if (!validation.ok || validation.model === undefined) {
        const findings = validation.errors.map((message) => ({ code: 'DESIGN_INVALID', severity: 'error', message }));
        return {
            ok: false,
            ran: true,
            ...verdictOf(findings.length, 0, 'DESIGN_INVALID'),
            schema: REPORT_SCHEMAS.design,
            checks: [{ id: 'DESIGN', name: 'Design Model Validation', status: 'fail', detail: 'the model was rejected before any check ran', findings }],
            violations: findings,
            signals: [],
            facts: { nodes: 0, edges: 0, declared: {} },
            summary: { errors: findings.length, warnings: 0, info: 0, checksRun: 0, nodes: 0, edges: 0 },
            hashes: { modelHash: '' },
            modelHash: '',
            nextSteps: ['Fix the reported field(s) and run the review again: the schema is closed, so an unknown key is a typo that would change the design under review.'],
        };
    }
    const model = validation.model;
    const features = designFeatures(model);
    const checks = [
        DES1_cycles(model, features),
        DES2_layerOrder(model, features),
        DES3_boundaries(model),
        DES4_loadBearing(model, features),
        DES5_undeclared(model),
        DES6_required(model),
        DES7_substitution(model),
        DES8_interfaceWidth(model),
        DES9_interfaceSplit(model),
        DES10_responsibilities(model),
        DES11_inversion(model),
        DES12_typeRelations(model),
    ];
    const all = checks.flatMap((result) => result.findings);
    const violations = all.filter((finding) => DESIGN_CODE_LEVEL[finding.code] === 'violation');
    const signals = all.filter((finding) => DESIGN_CODE_LEVEL[finding.code] === 'signal');
    const facts = all.filter((finding) => DESIGN_CODE_LEVEL[finding.code] === 'fact');
    const errors = violations.filter((finding) => finding.severity === 'error').length;
    const warnings = signals.filter((finding) => finding.severity === 'warning').length;
    const info = all.length - errors - warnings;
    const declared = {
        layers: (model.declare?.layers ?? []).length,
        boundaries: (model.declare?.boundaries ?? []).length,
        edgeRules: (model.declare?.allowedEdges ?? []).length,
        requiredEdges: (model.declare?.requiredEdges ?? []).length,
        types: (model.types ?? []).length,
        withBehaviour: (model.types ?? []).filter((entry) => entry.transitions !== undefined || entry.forbids !== undefined).length,
        withResponsibilities: (model.types ?? []).filter((entry) => (entry.responsibilities ?? []).length > 0).length,
    };
    // Name first, code in parentheses, and the code is kept because the `includes` tests below need it -
    // a bare list of six codes tells a reader nothing about what went unchecked.
    const skipped = checks.filter((result) => result.status === 'skip');
    const skippedCodes = skipped.map((result) => result.id);
    const skippedLabels = skipped.map((result) => result.name + ' (' + result.id + ')');
    const modelHash = valueHash(model);
    const nextSteps = [];
    if (violations.length > 0)
        nextSteps.push('Fix the ' + String(violations.length) + ' violation(s) the design contradicts itself about, or change the declaration they contradict.');
    if (signals.length > 0)
        nextSteps.push('Read the ' + String(signals.length) + ' signal(s) and decide which are intended: they are structural facts, not defects. To see whether the drawing this design came from holds up against a dependency matrix, use `uml_structure_verify`.');
    if (skipped.length > 0)
        nextSteps.push('These had nothing to hold the design to: ' + skippedLabels.join('; ') + '. Declare ' + (skippedCodes.includes('DES2') ? 'layers, ' : '') + (skippedCodes.includes('DES7') ? 'transitions/forbids, ' : '') + (skippedCodes.includes('DES8') || skippedCodes.includes('DES9') ? 'interfaces with callers, ' : '') + 'or accept that those principles are unverified here. For behaviour rather than structure, `model_verify` decides a state machine on its own and `model_compose_verify` decides two that interact.');
    if (nextSteps.length === 0)
        nextSteps.push('Nothing to fix. The design keeps every contract it declares; the shape facts in `facts` are for a reader. To audit the drawing this design came from against a dependency matrix, use `uml_structure_verify`; for a state machine or protocol among these types, use `model_verify`; to accept a later revision, compare the two reports with `report_diff`.');
    void facts;
    return {
        ok: true,
        ran: true,
        ...verdictOf(errors, warnings, violations[0]?.code),
        schema: REPORT_SCHEMAS.design,
        ...(model.artifact === undefined ? {} : { artifact: model.artifact }),
        checks,
        violations,
        signals,
        facts: {
            nodes: features.nodes,
            edges: features.edges,
            components: features.components,
            cyclomatic: features.cyclomatic,
            density: features.density,
            ranks: features.ranks,
            fanIn: features.fanIn,
            fanOut: features.fanOut,
            largestCycle: features.largestCycle,
            feedbackArcs: features.feedbackArcs.edges,
            feedbackArcsExact: features.feedbackArcs.exact,
            articulationPoints: features.articulationPoints,
            bridges: features.bridges,
            mutualPairs: features.mutualPairs,
            declared,
            checksSkipped: skippedCodes,
        },
        // `checksRun` counts the checks that examined the design: a skipped check examined nothing, so counting it
        // here answered "fully reviewed" for a design that declared nothing to review it against. The roster is
        // `checks`, and `facts.checksSkipped` names the ones this number excludes.
        summary: { errors, warnings, info, checksRun: checks.length - skipped.length, nodes: features.nodes, edges: features.edges },
        hashes: { modelHash },
        modelHash,
        nextSteps,
    };
}
/** A stable hash of the design, for a baseline diff or an archive record. */
export function designHash(model) {
    return createHash('sha256').update(JSON.stringify(model)).digest('hex');
}

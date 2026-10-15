/**
 * The structure families: class, object, package, component and deployment diagrams.
 *
 * A structure diagram is not a machine and not a use case list: it is a graph of
 * nodes and the edges between them. The five families differ in vocabulary, not in
 * shape, so they share one module factory and one model.
 *
 * Parsing is not reimplemented here. `structure.ts` already reads this text as a
 * dependency graph, and it is the single source for that reading: this module calls
 * it, then gives the result the family's name. Reviewing does the same - the graph is
 * rendered back and handed to `reviewStructure`, so a structure diagram reviewed
 * through the UML front end and one reviewed through `uml_structure_verify`
 * report the same defects with the same codes.
 *
 * @module model-everything-uml-structure
 */
import { UmlError, UML_PLAIN_ID, directiveLine, readUmlDirectives, umlSourceLines, } from './uml-syntax.js';
import { parseStructure, reviewStructure } from './structure.js';
const STRUCTURE_FAMILIES = ['class', 'object', 'package', 'component', 'deployment'];
/** PlantUML keyword each kind is drawn with; the first is the fallback for the family. */
const PLANTUML_KEYWORDS = {
    class: 'class', interface: 'interface', enum: 'enum', object: 'object', package: 'package',
    component: 'component', node: 'node', artifact: 'artifact', database: 'database', actor: 'actor',
    rectangle: 'rectangle', cloud: 'cloud', queue: 'queue', usecase: 'usecase', unknown: 'class',
};
const FAMILY_FALLBACK_KIND = {
    class: 'class', object: 'object', package: 'package', component: 'component', deployment: 'node',
};
const RESERVED_IDS = new Set(['class', 'classDiagram', 'end', 'graph', 'subgraph', 'direction', 'style', 'click', 'note', 'hide', 'show', 'title', 'namespace']);
function isPlainId(id) {
    return UML_PLAIN_ID.test(id) && !RESERVED_IDS.has(id.toLowerCase());
}
export function validateStructureModel(input, family) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new UmlError('a structure model must be an object with schemaVersion 1, nodes and edges', 'UML_INPUT');
    }
    const model = input;
    if (model.schemaVersion !== 1)
        throw new UmlError('a structure model must declare schemaVersion 1', 'UML_INPUT');
    const declaredFamily = model.family;
    if (declaredFamily !== undefined && !STRUCTURE_FAMILIES.includes(declaredFamily)) {
        throw new UmlError('unknown structure family "' + String(declaredFamily) + '"; expected ' + STRUCTURE_FAMILIES.join(' | '), 'UML_INPUT');
    }
    if (declaredFamily !== undefined && declaredFamily !== family) {
        throw new UmlError('this model is a ' + declaredFamily + ' diagram, and it was handed to the ' + family + ' module: render and review it as the family it declares.', 'UML_INPUT');
    }
    if (!Array.isArray(model.nodes) || !Array.isArray(model.edges)) {
        // A model with neither field is not an empty structure diagram: it is some other
        // family's model, and reading it as an empty diagram would hide that.
        throw new UmlError('a structure model must declare nodes and edges as arrays', 'UML_INPUT');
    }
    const nodes = model.nodes;
    const edges = model.edges;
    const ids = new Set();
    for (const node of nodes) {
        if (node === null || typeof node !== 'object' || typeof node.id !== 'string' || node.id.trim() === '') {
            throw new UmlError('every node needs a non-empty string id', 'UML_INPUT');
        }
        if (ids.has(node.id))
            throw new UmlError('duplicate node id "' + node.id + '"', 'UML_INPUT');
        ids.add(node.id);
    }
    for (const edge of edges) {
        if (edge === null || typeof edge !== 'object')
            throw new UmlError('every edge must be an object', 'UML_INPUT');
        if (!ids.has(edge.from) || !ids.has(edge.to)) {
            throw new UmlError('edge ' + edge.from + ' -> ' + edge.to + ' names a node the model does not declare', 'UML_INPUT');
        }
    }
    const entries = nodes.map((node) => ({ id: node.id, kind: typeof node.kind === 'string' && node.kind !== '' ? node.kind : FAMILY_FALLBACK_KIND[family], ...(node.label === undefined ? {} : { label: node.label }), ...(node.parent === undefined ? {} : { parent: node.parent }) }));
    // Canonical order: a container precedes what it contains, which is the order the
    // renderer can draw. A model that arrives with a child first is normalised rather
    // than reported as a fidelity difference the notation cannot actually express.
    const known = new Set(entries.map((entry) => entry.id));
    const canonical = [];
    const emitted = new Set();
    const emit = (entry) => {
        if (emitted.has(entry.id))
            return;
        emitted.add(entry.id);
        canonical.push(entry);
        for (const child of entries)
            if (child.parent === entry.id)
                emit(child);
    };
    for (const entry of entries)
        if (entry.parent === undefined || entry.parent === entry.id || !known.has(entry.parent))
            emit(entry);
    for (const entry of entries)
        emit(entry);
    return {
        schemaVersion: 1,
        family,
        nodes: canonical,
        edges: edges.map((edge) => ({ from: edge.from, to: edge.to, ...(edge.label === undefined ? {} : { label: edge.label }) })),
    };
}
function graphToModel(graph, family) {
    return {
        schemaVersion: 1,
        family,
        nodes: graph.nodes.map((node) => ({
            id: node.id,
            kind: node.kind === 'unknown' ? FAMILY_FALLBACK_KIND[family] : node.kind,
            ...(node.label === undefined ? {} : { label: node.label }),
            ...(node.parent === undefined ? {} : { parent: node.parent }),
        })),
        edges: graph.edges.map((edge) => ({ from: edge.from, to: edge.to, ...(edge.label === undefined ? {} : { label: edge.label }) })),
    };
}
// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
export function parseStructureFamily(text, notation, family) {
    const graph = parseStructure(text, notation);
    const directives = readUmlDirectives(text.split(/\r?\n/), notation);
    const alias = new Map();
    for (const value of directives.values.get('alias') ?? []) {
        const split = value.indexOf(' ');
        if (split > 0)
            alias.set(value.slice(0, split).trim(), value.slice(split + 1).trim());
    }
    const parents = new Map();
    for (const value of directives.values.get('parent') ?? []) {
        const split = value.indexOf(' ');
        if (split > 0)
            parents.set(value.slice(0, split).trim(), value.slice(split + 1).trim());
    }
    const kinds = new Map();
    for (const value of directives.values.get('kind') ?? []) {
        const split = value.indexOf(' ');
        if (split > 0)
            kinds.set(value.slice(0, split).trim(), value.slice(split + 1).trim());
    }
    const restore = (id) => alias.get(id) ?? id;
    const labels = {};
    const nodes = graph.nodes.map((node) => {
        const id = restore(node.id);
        const label = node.label === undefined || node.label === id ? undefined : node.label;
        if (label !== undefined)
            labels[id] = label;
        const pinned = kinds.get(node.id);
        const kind = pinned ?? (node.kind === 'unknown' ? FAMILY_FALLBACK_KIND[family] : node.kind);
        const declaredParent = parents.get(node.id);
        const parent = declaredParent !== undefined ? declaredParent : (node.parent === undefined ? undefined : restore(node.parent));
        return { id, kind, ...(label === undefined ? {} : { label }), ...(parent === undefined ? {} : { parent }) };
    });
    const edges = graph.edges.map((edge) => ({
        from: restore(edge.from),
        to: restore(edge.to),
        ...(edge.label === undefined ? {} : { label: edge.label }),
    }));
    return {
        model: validateStructureModel({ schemaVersion: 1, family, nodes, edges }, family),
        labels,
        warnings: [...graph.warnings],
        discardedConstructs: [],
        discardedEdges: 0,
    };
}
// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
/** Which keyword draws this kind, in the family it was declared in. */
function keywordFor(kind, family) {
    return PLANTUML_KEYWORDS[kind] ?? FAMILY_FALLBACK_KIND[family];
}
export function renderStructureFamily(input, notation, family) {
    const model = validateStructureModel(input, family);
    const warnings = [];
    const taken = new Set();
    const alias = new Map();
    const aliasFor = (id) => {
        if (isPlainId(id) && !taken.has(id)) {
            taken.add(id);
            return id;
        }
        let index = 1;
        let candidate = 'N' + String(index);
        while (taken.has(candidate)) {
            index += 1;
            candidate = 'N' + String(index);
        }
        taken.add(candidate);
        alias.set(candidate, id);
        return candidate;
    };
    if (notation === 'mermaid') {
        if (family !== 'class') {
            throw new UmlError('mermaid has no ' + family + ' diagram: its nearer views (architecture-beta, C4) use another vocabulary, and drawing one here would mislabel the model. Render it with notation "plantuml".', 'UML_VIEW_UNREPRESENTABLE');
        }
        const lines = ['classDiagram'];
        lines.push(directiveLine('mermaid', 'uml v1 notation=mermaid family=' + family));
        const notationIds = model.nodes.map((node) => aliasFor(node.id));
        model.nodes.forEach((node, index) => lines.push(directiveLine('mermaid', 'kind ' + notationIds[index] + ' ' + node.kind)));
        model.nodes.forEach((node, index) => { if (node.parent !== undefined)
            lines.push(directiveLine('mermaid', 'parent ' + notationIds[index] + ' ' + node.parent)); });
        for (const [notationId, modelId] of alias)
            lines.push(directiveLine('mermaid', 'alias ' + notationId + ' ' + modelId));
        model.nodes.forEach((node, index) => {
            const id = notationIds[index];
            if (/["\n\r]/.test(node.label ?? '')) {
                warnings.push('UML_RENDER_LABEL_UNSAFE: the label of "' + node.id + '" contains a quote or a line break; it was written with single quotes instead and will not read back verbatim.');
            }
            const label = (node.label ?? '').replace(/["\n\r]+/g, "'");
            lines.push(label === '' || label === id ? '  class ' + id : '  class ' + id + '["' + label + '"]');
        });
        for (const edge of model.edges) {
            const idOf = new Map(model.nodes.map((node, index) => [node.id, notationIds[index]]));
            lines.push('  ' + (idOf.get(edge.from) ?? edge.from) + ' --> ' + (idOf.get(edge.to) ?? edge.to) + (edge.label === undefined ? '' : ' : ' + edge.label));
        }
        return { primary: lines.join('\n') + '\n', warnings };
    }
    const lines = ['@startuml'];
    lines.push(directiveLine('plantuml', 'uml v1 notation=plantuml family=' + family));
    const notationIds = model.nodes.map((node) => aliasFor(node.id));
    model.nodes.forEach((node, index) => lines.push(directiveLine('plantuml', 'kind ' + notationIds[index] + ' ' + node.kind)));
    model.nodes.forEach((node, index) => { if (node.parent !== undefined)
        lines.push(directiveLine('plantuml', 'parent ' + notationIds[index] + ' ' + node.parent)); });
    for (const [notationId, modelId] of alias)
        lines.push(directiveLine('plantuml', 'alias ' + notationId + ' ' + modelId));
    const position = new Map(model.nodes.map((node, index) => [node.id, index]));
    const children = new Map();
    const roots = [];
    const known = new Set(model.nodes.map((node) => node.id));
    for (const node of model.nodes) {
        const parent = node.parent !== undefined && node.parent !== node.id && known.has(node.parent) ? node.parent : undefined;
        if (parent === undefined) {
            roots.push(node);
            continue;
        }
        const list = children.get(parent);
        if (list === undefined)
            children.set(parent, [node]);
        else
            list.push(node);
    }
    const declare = (node, indent) => {
        const id = notationIds[position.get(node.id)];
        const keyword = keywordFor(node.kind, family);
        const label = (node.label ?? '').replace(/["\n\r]+/g, "'");
        if ((node.label ?? '') !== label)
            warnings.push('UML_RENDER_LABEL_UNSAFE: the label of "' + node.id + '" contains a quote or a line break; it was written with single quotes instead and will not read back verbatim.');
        const members = children.get(node.id) ?? [];
        const head = label === '' || label === id ? keyword + ' ' + id : keyword + ' "' + label + '" as ' + id;
        if (members.length === 0) {
            lines.push(indent + head);
            return;
        }
        lines.push(indent + head + ' {');
        for (const member of members)
            declare(member, indent + '  ');
        lines.push(indent + '}');
    };
    for (const root of roots)
        declare(root, '');
    const idOf = new Map(model.nodes.map((node, index) => [node.id, notationIds[index]]));
    for (const edge of model.edges) {
        lines.push((idOf.get(edge.from) ?? edge.from) + ' --> ' + (idOf.get(edge.to) ?? edge.to) + (edge.label === undefined ? '' : ' : ' + edge.label));
    }
    lines.push('@enduml');
    return { primary: lines.join('\n') + '\n', warnings };
}
// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------
/**
 * The review is the structure tool's, reached through a render.
 *
 * A structure diagram's defects are properties of its graph, and `reviewStructure`
 * already checks them (isolated node, dangling endpoint, cycle, and the matrix rules
 * when one is declared). Re-deriving them here would be a second implementation of
 * the same checks, and the two would drift. So the model is rendered back and handed
 * over, which also proves the round trip on the way.
 */
export function reviewStructureFamily(model, labels, notation) {
    const rendered = renderStructureFamily(model, notation, model.family);
    const report = reviewStructure({ diagram: rendered.primary, notation });
    const findings = report.findings.map((finding) => ({
        code: finding.code,
        severity: finding.severity,
        message: finding.message,
        ...(finding.detail === undefined ? {} : { detail: finding.detail }),
        ...(finding.evidence === undefined ? {} : { evidence: finding.evidence }),
    }));
    for (const node of model.nodes) {
        if (node.label !== undefined || labels[node.id] !== undefined)
            continue;
        findings.push({
            code: 'UML040_STRUCTURE_NODE_UNDOCUMENTED',
            severity: 'info',
            message: 'node ' + node.id + ' carries no name a reader can map back to the code: give it a display label.',
            evidence: { id: node.id },
        });
    }
    return findings;
}
/** One module per structure family: they differ in vocabulary, not in shape. */
export function structureFamilyModule(family) {
    return {
        id: family,
        render: (input, notation, _options) => renderStructureFamily(input, notation, family),
        parse: (text, notation) => parseStructureFamily(text, notation, family),
        review: (model, labels, notation) => reviewStructureFamily(model, labels, notation),
    };
}

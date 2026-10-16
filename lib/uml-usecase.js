/**
 * The use case diagram module.
 *
 * A use case diagram is not a machine: it says who uses the system and which services
 * the system offers, not in what order anything happens. So it has its own model
 * (actors, use cases, a subject, and the relations between them), its own renderer,
 * and its own review. Handing this text to the state parser was the bug this module
 * exists to fix: `:User: --> (Login)` used to come back as a state machine with no
 * finding at all.
 *
 * PlantUML is the only notation that draws one. Mermaid has no use case diagram, and
 * the engine's capability table says so with a reason instead of rendering something
 * else under the name.
 *
 * @module model-everything-uml-usecase
 */
import { UmlError, UML_PLAIN_ID, directiveLine, readUmlDirectives, declaredFamily, umlSourceLines, splitUmlEdge, escapeRegExp, } from './uml-syntax.js';
const RELATION_KINDS = ['association', 'include', 'extend', 'generalization'];
/** PlantUML ids that cannot stand alone in a declaration. */
const RESERVED_IDS = new Set(['actor', 'usecase', 'rectangle', 'package', 'end', 'left', 'right', 'top', 'bottom', 'note', 'hide', 'show', 'skinparam', 'title']);
function isPlainId(id) {
    return UML_PLAIN_ID.test(id) && !RESERVED_IDS.has(id.toLowerCase());
}
export function validateUseCaseModel(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new UmlError('a use case model must be an object with schemaVersion 1, actors, useCases and relations', 'UML_INPUT');
    }
    const model = input;
    if (model.schemaVersion !== 1) {
        throw new UmlError('a use case model must declare schemaVersion 1', 'UML_INPUT');
    }
    const actors = model.actors ?? [];
    const useCases = model.useCases ?? [];
    if (!Array.isArray(actors) || !Array.isArray(useCases)) {
        throw new UmlError('actors and useCases must be arrays', 'UML_INPUT');
    }
    const ids = new Set();
    for (const element of [...actors, ...useCases]) {
        if (element === null || typeof element !== 'object' || typeof element.id !== 'string' || element.id.trim() === '') {
            throw new UmlError('every actor and use case needs a non-empty string id', 'UML_INPUT');
        }
        if (ids.has(element.id))
            throw new UmlError('duplicate element id "' + element.id + '"', 'UML_INPUT');
        ids.add(element.id);
    }
    for (const relation of model.relations ?? []) {
        if (relation === null || typeof relation !== 'object')
            throw new UmlError('every relation must be an object', 'UML_INPUT');
        if (!ids.has(relation.from) || !ids.has(relation.to)) {
            throw new UmlError('relation ' + relation.from + ' -> ' + relation.to + ' names an element the model does not declare', 'UML_INPUT');
        }
        if (!RELATION_KINDS.includes(relation.kind)) {
            throw new UmlError('unknown relation kind "' + String(relation.kind) + '"; expected ' + RELATION_KINDS.join(' | '), 'UML_INPUT');
        }
    }
    return {
        schemaVersion: 1,
        ...(model.subject === undefined ? {} : { subject: model.subject }),
        actors: actors.map((element) => ({ id: element.id, ...(element.label === undefined ? {} : { label: element.label }) })),
        useCases: useCases.map((element) => ({ id: element.id, ...(element.label === undefined ? {} : { label: element.label }) })),
        relations: (model.relations ?? []).map((relation) => ({ from: relation.from, to: relation.to, kind: relation.kind })),
        ...(model.undeclared === undefined || model.undeclared.length === 0 ? {} : { undeclared: [...model.undeclared] }),
        ...(model.narrative === undefined ? {} : { narrative: model.narrative }),
    };
}
function labelOf(element) {
    return element.label ?? element.id;
}
function safeLabel(text, warnings) {
    if (/["\n\r]/.test(text)) {
        warnings.push('UML_RENDER_LABEL_UNSAFE: the label "' + text + '" contains a quote or a line break, which the declaration syntax uses; it was written with single quotes instead and will not read back verbatim.');
        return text.replace(/["\n\r]+/g, "'");
    }
    return text;
}
function relationOperator(kind) {
    if (kind === 'generalization')
        return '--|>';
    if (kind === 'include' || kind === 'extend')
        return '..>';
    return '-->';
}
function relationLabel(kind) {
    if (kind === 'include')
        return '<<include>>';
    if (kind === 'extend')
        return '<<extend>>';
    return undefined;
}
/**
 * The Mermaid view: `usecase-beta` (Mermaid 12+). It draws the same model, and it is
 * still an approximation - an extension point has no spelling there - so the engine
 * marks the render as one and the round trip stays in plantuml.
 */
function renderMermaidUseCase(model, warnings) {
    const lines = ['usecase-beta'];
    lines.push(directiveLine('mermaid', 'uml v1 notation=mermaid family=use-case'));
    if (model.subject !== undefined)
        lines.push(directiveLine('mermaid', 'subject ' + model.subject));
    const idOf = new Map();
    const taken = new Set();
    const aliasFor = (id) => {
        if (isPlainId(id) && !taken.has(id)) {
            taken.add(id);
            return id;
        }
        let index = 1;
        let candidate = 'E' + String(index);
        while (taken.has(candidate)) {
            index += 1;
            candidate = 'E' + String(index);
        }
        taken.add(candidate);
        lines.push(directiveLine('mermaid', 'alias ' + candidate + ' ' + id));
        return candidate;
    };
    for (const actor of model.actors) {
        const id = aliasFor(actor.id);
        const label = safeLabel(labelOf(actor), warnings);
        idOf.set(actor.id, id);
        lines.push(id === label ? 'actor ' + id : 'actor ' + id + '["' + label + '"]');
    }
    const useCaseLines = [];
    for (const useCase of model.useCases) {
        const id = aliasFor(useCase.id);
        const label = safeLabel(labelOf(useCase), warnings);
        idOf.set(useCase.id, id);
        useCaseLines.push(id === label ? '  ' + id : '  ' + id + '["' + label + '"]');
    }
    if (model.subject === undefined)
        lines.push(...useCaseLines);
    else
        lines.push('systemBoundary "' + safeLabel(model.subject, warnings) + '"', ...useCaseLines, 'end');
    for (const relation of model.relations) {
        const from = idOf.get(relation.from) ?? relation.from;
        const to = idOf.get(relation.to) ?? relation.to;
        const label = relationLabel(relation.kind);
        lines.push(from + ' ' + relationOperator(relation.kind) + ' ' + to + (label === undefined ? '' : ' : ' + label));
    }
    return { primary: lines.join('\n') + '\n', warnings };
}
export function renderUseCase(input, notation) {
    const model = validateUseCaseModel(input);
    const warnings = [];
    if (notation === 'mermaid')
        return renderMermaidUseCase(model, warnings);
    const lines = ['@startuml'];
    lines.push(directiveLine('plantuml', 'uml v1 notation=plantuml family=use-case'));
    if (model.subject !== undefined)
        lines.push(directiveLine('plantuml', 'subject ' + model.subject));
    const alias = new Map();
    const taken = new Set();
    const aliasFor = (id) => {
        if (isPlainId(id) && !taken.has(id)) {
            taken.add(id);
            return id;
        }
        let index = 1;
        let candidate = 'E' + String(index);
        while (taken.has(candidate)) {
            index += 1;
            candidate = 'E' + String(index);
        }
        taken.add(candidate);
        alias.set(candidate, id);
        return candidate;
    };
    const actorIds = model.actors.map((element) => aliasFor(element.id));
    const useCaseIds = model.useCases.map((element) => aliasFor(element.id));
    for (const [notationId, modelId] of alias)
        lines.push(directiveLine('plantuml', 'alias ' + notationId + ' ' + modelId));
    model.actors.forEach((element, index) => {
        const id = actorIds[index];
        const label = safeLabel(labelOf(element), warnings);
        lines.push(id === label ? 'actor ' + id : 'actor "' + label + '" as ' + id);
    });
    model.useCases.forEach((element, index) => {
        const id = useCaseIds[index];
        const label = safeLabel(labelOf(element), warnings);
        lines.push(id === label ? 'usecase ' + id : 'usecase "' + label + '" as ' + id);
    });
    const idOf = new Map();
    model.actors.forEach((element, index) => idOf.set(element.id, actorIds[index]));
    model.useCases.forEach((element, index) => idOf.set(element.id, useCaseIds[index]));
    for (const relation of model.relations) {
        const from = idOf.get(relation.from) ?? relation.from;
        const to = idOf.get(relation.to) ?? relation.to;
        const label = relationLabel(relation.kind);
        lines.push(from + ' ' + relationOperator(relation.kind) + ' ' + to + (label === undefined ? '' : ' : ' + label));
    }
    lines.push('@enduml');
    return { primary: lines.join('\n') + '\n', warnings };
}
/** Read a PlantUML declaration target: a bare id, a bare label, or a quoted label as an id. */
function readTarget(rest) {
    const trimmed = rest.trim().replace(/[;{]\s*$/, '').trim();
    if (trimmed === '')
        return undefined;
    const aliased = /^(.*?)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(trimmed);
    if (aliased !== null) {
        const label = aliased[1].trim().replace(/^"|"$/g, '').trim();
        return label === '' ? { id: aliased[2] } : { id: aliased[2], label };
    }
    const quoted = /^"([^"]*)"\s*$/.exec(trimmed);
    if (quoted !== null)
        return quoted[1] === '' ? undefined : { id: quoted[1] };
    const bare = /^([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(trimmed);
    if (bare !== null)
        return { id: bare[1] };
    return { id: trimmed.replace(/^"|"$/g, '').trim() };
}
/** (Label), (Label) as (ID), (Label) as ID. */
const PAREN_USE_CASE = /^\(\s*([^()]*?)\s*\)(?:\s+as\s+\(?\s*([^()\s]+)\s*\)?)?$/;
/** :Actor: or :Actor: as ID. */
const COLON_ACTOR = /^:\s*([^:]+?)\s*:(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/;
/** The system boundary, which PlantUML draws as a container. */
const BOUNDARY = /^(rectangle|package|frame)\s+(?:"([^"]*)"|([A-Za-z_][A-Za-z0-9_.-]*))\s*\{?\s*$/i;
/** A declaration from another family, kept so a mixed file does not parse silently. */
const FOREIGN_DECLARATION = /^\s*(class|interface|enum|enumeration|abstract|object|component|artifact|node|database|storage|cloud|state|participant|boundary|control|entity|collections|queue|robust|concise|binary|clock)\b/i;
function relationKindFromLabel(label) {
    if (label === undefined)
        return { kind: 'include', assumed: true };
    const text = label.toLowerCase();
    if (text.includes('include'))
        return { kind: 'include', assumed: false };
    if (text.includes('extend'))
        return { kind: 'extend', assumed: false };
    return { kind: 'include', assumed: true };
}
export function parseUseCase(text, notation) {
    if (notation !== 'plantuml') {
        throw new UmlError('mermaid has no use case diagram: there is no text to read back. Write the diagram in plantuml, or review the model instead.', 'UML_VIEW_UNREPRESENTABLE');
    }
    const all = text.split(/\r?\n/);
    const directives = readUmlDirectives(all, 'plantuml');
    const alias = new Map();
    for (const value of directives.values.get('alias') ?? []) {
        const split = value.indexOf(' ');
        if (split > 0)
            alias.set(value.slice(0, split).trim(), value.slice(split + 1).trim());
    }
    const restore = (id) => alias.get(id) ?? id;
    const actors = [];
    const useCases = [];
    const labels = {};
    const warnings = [];
    const discarded = [];
    const declared = new Map();
    const undeclared = [];
    const declareActor = (entry) => {
        const id = restore(entry.id);
        if (!declared.has(id)) {
            declared.set(id, 'actor');
            actors.push({ id, ...(entry.label === undefined ? {} : { label: entry.label }) });
        }
        if (entry.label !== undefined)
            labels[id] = entry.label;
        return id;
    };
    const declareUseCase = (entry) => {
        const id = restore(entry.id);
        if (!declared.has(id)) {
            declared.set(id, 'use-case');
            useCases.push({ id, ...(entry.label === undefined ? {} : { label: entry.label }) });
        }
        if (entry.label !== undefined)
            labels[id] = entry.label;
        return id;
    };
    // An endpoint may spell itself as an actor or a use case instead of naming a
    // declared id: `:User: --> (Login)` is the everyday hand-written form.
    const resolveEndpoint = (raw) => {
        const actor = COLON_ACTOR.exec(raw);
        if (actor !== null) {
            const label = actor[1].trim();
            return declareActor(actor[2] === undefined ? { id: label } : { id: actor[2], label });
        }
        const paren = PAREN_USE_CASE.exec(raw);
        if (paren !== null && paren[1].trim() !== '') {
            return declareUseCase(paren[2] === undefined ? { id: paren[1].trim() } : { id: paren[2], label: paren[1].trim() });
        }
        return restore(raw);
    };
    let subject;
    for (const value of directives.values.get('subject') ?? [])
        subject = value;
    const lines = umlSourceLines(text, 'plantuml');
    const relations = [];
    for (const line of lines) {
        const source = line.text;
        const boundary = BOUNDARY.exec(source);
        if (boundary !== null) {
            if (subject === undefined || subject === '')
                subject = (boundary[2] ?? boundary[3] ?? '').trim();
            continue;
        }
        if (source === '}' || source === '{')
            continue;
        const declaration = /^(usecase|actor)\s+(.+)$/i.exec(source);
        if (declaration !== null) {
            const target = readTarget(declaration[2]);
            if (target === undefined) {
                warnings.push('UML_PARSE_IGNORED_LINE: "' + source + '" declares nothing; it was ignored.');
                continue;
            }
            if (declaration[1].toLowerCase() === 'usecase')
                declareUseCase(target);
            else
                declareActor(target);
            continue;
        }
        const paren = PAREN_USE_CASE.exec(source);
        if (paren !== null) {
            const label = paren[1].trim();
            if (label === '') {
                warnings.push('UML_PARSE_IGNORED_LINE: "' + source + '" declares no use case name; it was ignored.');
                continue;
            }
            declareUseCase(paren[2] === undefined ? { id: label } : { id: paren[2], label });
            continue;
        }
        const colon = COLON_ACTOR.exec(source);
        if (colon !== null) {
            const label = colon[1].trim();
            declareActor(colon[2] === undefined ? { id: label } : { id: colon[2], label });
            continue;
        }
        const foreign = FOREIGN_DECLARATION.exec(source);
        if (foreign !== null) {
            discarded.push({ construct: foreign[1].toLowerCase(), line: line.number, text: source });
            continue;
        }
        const edge = splitUmlEdge(source, 'plantuml');
        if (edge !== undefined) {
            const fromRaw = resolveEndpoint(edge.from);
            const toRaw = resolveEndpoint(edge.to);
            const operator = edge.operator;
            const generalization = operator === '--|>' || operator === '<|--';
            // A generalization arrow points at the general element, so the specific element
            // is the left side for --|> and the right side for <|--.
            const from = generalization && operator === '<|--' ? toRaw : fromRaw;
            const to = generalization && operator === '<|--' ? fromRaw : toRaw;
            let kind = generalization ? 'generalization' : 'association';
            if (!generalization && (operator === '..>' || operator === '.>')) {
                const read = relationKindFromLabel(edge.label);
                kind = read.kind;
                if (read.assumed) {
                    warnings.push('UML_PARSE_ASSUMED_INCLUDE: the dashed arrow ' + edge.from + ' ..> ' + edge.to + ' carries ' + (edge.label === undefined ? 'no stereotype' : '"' + edge.label + '"') + ', which is neither include nor extend; it was read as an include.');
                }
            }
            for (const id of [from, to]) {
                if (declared.has(id) || undeclared.includes(id))
                    continue;
                undeclared.push(id);
                warnings.push('UML_PARSE_UNDECLARED_ENDPOINT: "' + id + '" is used as a relation endpoint but nothing declares it; it is kept so the review can report it.');
            }
            relations.push({ from, to, kind });
            continue;
        }
        warnings.push('UML_PARSE_IGNORED_LINE: "' + source + '" is not a use case statement; it was ignored.');
    }
    for (const value of directives.values.get('undeclared') ?? []) {
        const id = restore(value.trim());
        if (id !== '' && !undeclared.includes(id))
            undeclared.push(id);
    }
    const model = {
        schemaVersion: 1,
        ...(subject === undefined || subject === '' ? {} : { subject }),
        actors,
        useCases,
        relations,
        ...(undeclared.length === 0 ? {} : { undeclared }),
    };
    return { model, labels, warnings, discardedConstructs: discarded, discardedEdges: 0 };
}
export const USE_CASE_FINDING_CODES = [
    'UML030_USE_CASE_NO_ACTORS',
    'UML031_USE_CASE_NO_USE_CASES',
    'UML032_ISOLATED_ACTOR',
    'UML033_USE_CASE_WITHOUT_ACTOR',
    'UML034_DANGLING_RELATION_ENDPOINT',
    'UML035_INCLUDE_EXTEND_CYCLE',
    'UML036_ACTOR_TO_ACTOR_ASSOCIATION',
    'UML037_ACTOR_INCLUDE_EXTEND',
    'UML038_SELF_RELATION',
    'UML039_USE_CASE_UNDOCUMENTED',
];
/** The first include/extend cycle reachable from the given start, as a path. */
function includeCycle(relations) {
    const adjacency = new Map();
    for (const relation of relations) {
        if (relation.kind !== 'include' && relation.kind !== 'extend')
            continue;
        const list = adjacency.get(relation.from);
        if (list === undefined)
            adjacency.set(relation.from, [relation.to]);
        else
            list.push(relation.to);
    }
    const state = new Map();
    const path = [];
    const walk = (node) => {
        const seen = state.get(node);
        if (seen === 'visiting') {
            const start = path.indexOf(node);
            return [...path.slice(start), node];
        }
        if (seen === 'done')
            return undefined;
        state.set(node, 'visiting');
        path.push(node);
        for (const next of adjacency.get(node) ?? []) {
            const cycle = walk(next);
            if (cycle !== undefined)
                return cycle;
        }
        path.pop();
        state.set(node, 'done');
        return undefined;
    };
    for (const node of adjacency.keys()) {
        const cycle = walk(node);
        if (cycle !== undefined)
            return cycle;
    }
    return undefined;
}
/** Every element reachable from an actor over associations, includes, extends and generalizations. */
function reachedFromActors(model) {
    const adjacency = new Map();
    const link = (left, right) => {
        const list = adjacency.get(left);
        if (list === undefined)
            adjacency.set(left, [right]);
        else
            list.push(right);
    };
    for (const relation of model.relations) {
        link(relation.from, relation.to);
        link(relation.to, relation.from);
    }
    const reached = new Set();
    const queue = model.actors.map((actor) => actor.id);
    while (queue.length > 0) {
        const node = queue.shift();
        if (reached.has(node))
            continue;
        reached.add(node);
        for (const next of adjacency.get(node) ?? [])
            if (!reached.has(next))
                queue.push(next);
    }
    return reached;
}
export function reviewUseCaseModel(model, labels) {
    const findings = [];
    const actorIds = new Set(model.actors.map((actor) => actor.id));
    const useCaseIds = new Set(model.useCases.map((useCase) => useCase.id));
    const name = (id) => labels[id] ?? id;
    if (model.actors.length === 0) {
        findings.push({ code: 'UML030_USE_CASE_NO_ACTORS', severity: 'error', message: 'the diagram declares no actor, so it does not say who uses the system.', evidence: { actors: 0 } });
    }
    if (model.useCases.length === 0) {
        findings.push({ code: 'UML031_USE_CASE_NO_USE_CASES', severity: 'error', message: 'the diagram declares no use case, so it does not say what the system offers.', evidence: { useCases: 0 } });
    }
    const undeclared = model.undeclared ?? [];
    if (undeclared.length > 0) {
        findings.push({
            code: 'UML034_DANGLING_RELATION_ENDPOINT',
            severity: 'error',
            message: 'a relation names ' + String(undeclared.length) + ' element(s) the diagram never declares, so the line points at nothing a reader can look up.',
            detail: undeclared.join(', '),
            evidence: { ids: undeclared },
        });
    }
    for (const relation of model.relations) {
        if (relation.from === relation.to) {
            findings.push({ code: 'UML038_SELF_RELATION', severity: 'warning', message: name(relation.from) + ' relates to itself, which says nothing.', evidence: { id: relation.from, kind: relation.kind } });
        }
        if (relation.kind === 'association' && actorIds.has(relation.from) && actorIds.has(relation.to)) {
            findings.push({
                code: 'UML036_ACTOR_TO_ACTOR_ASSOCIATION',
                severity: 'error',
                message: 'an association joins two actors (' + name(relation.from) + ' and ' + name(relation.to) + '): actors do not use each other. A shared role is a generalization, and shared behaviour belongs in a use case.',
                evidence: { from: relation.from, to: relation.to },
            });
        }
        if ((relation.kind === 'include' || relation.kind === 'extend') && (actorIds.has(relation.from) || actorIds.has(relation.to))) {
            findings.push({
                code: 'UML037_ACTOR_INCLUDE_EXTEND',
                severity: 'error',
                message: 'an actor ' + relation.kind + 's a use case (' + name(relation.from) + ' and ' + name(relation.to) + '): only use cases include or extend each other. An actor reaches a use case by an association.',
                evidence: { from: relation.from, to: relation.to, kind: relation.kind },
            });
        }
    }
    const cycle = includeCycle(model.relations);
    if (cycle !== undefined) {
        findings.push({
            code: 'UML035_INCLUDE_EXTEND_CYCLE',
            severity: 'error',
            message: 'include and extend form a cycle, so the use cases can never be performed in a finite order.',
            detail: cycle.map((id) => name(id)).join(' -> '),
            evidence: { path: cycle },
        });
    }
    const reached = reachedFromActors(model);
    for (const actor of model.actors) {
        const touched = model.relations.some((relation) => relation.from === actor.id || relation.to === actor.id);
        if (!touched) {
            findings.push({ code: 'UML032_ISOLATED_ACTOR', severity: 'info', message: 'actor ' + name(actor.id) + ' takes part in nothing: no use case is associated with it.', evidence: { id: actor.id } });
        }
    }
    for (const useCase of model.useCases) {
        if (!reached.has(useCase.id)) {
            findings.push({ code: 'UML033_USE_CASE_WITHOUT_ACTOR', severity: 'warning', message: 'use case ' + name(useCase.id) + ' is connected to no actor, directly or through an include or extend: nothing says who triggers it.', evidence: { id: useCase.id } });
        }
        const narrative = model.narrative?.useCases?.[useCase.id];
        if (labels[useCase.id] === undefined && narrative === undefined) {
            findings.push({ code: 'UML039_USE_CASE_UNDOCUMENTED', severity: 'info', message: 'use case ' + useCase.id + ' carries no name a reader can map back to the system: give it a display label or a narrative entry.', evidence: { id: useCase.id } });
        }
    }
    return findings;
}
/** The use case family, as the engine's registry expects it. */
export const useCaseModule = {
    id: 'use-case',
    render: (input, notation, _options) => renderUseCase(input, notation),
    parse: (text, notation) => parseUseCase(text, notation),
    review: (model, labels) => reviewUseCaseModel(model, labels),
};

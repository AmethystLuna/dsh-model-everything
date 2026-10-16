/**
 * The profile diagram module.
 *
 * A profile is a package that extends the metamodel: stereotypes, the metaclasses they
 * extend, and the profiles applied to a package. That is a shape of its own, so it has
 * its own model rather than being flattened into a class diagram.
 *
 * PlantUML draws one *approximately*: it has `metaclass` and `stereotype` elements and
 * `class X <<stereotype>>`, and the relation set of its class diagram, but no `profile`
 * keyword and no Profile/ProfileApplication element. The drawing is therefore one-way.
 * Reading the text back would have to guess which `--|>` is a stereotype extending a
 * metaclass and which is one stereotype specialising another — two different facts about
 * the profile, drawn identically — so the parse is refused by name instead of inventing
 * the one the reader cannot see. That refusal is the family table's `parseable: false`.
 *
 * @module model-everything-uml-profile
 */
import { UmlError, UML_PLAIN_ID, directiveLine, } from './uml-syntax.js';
const MULTIPLICITIES = ['0..1', '1'];
/** PlantUML ids that cannot stand alone in a declaration. */
const RESERVED_IDS = new Set(['class', 'metaclass', 'stereotype', 'enum', 'interface', 'abstract', 'package', 'end', 'note', 'hide', 'show', 'skinparam', 'title', 'left', 'right', 'top', 'bottom']);
function isPlainId(id) {
    return UML_PLAIN_ID.test(id) && !RESERVED_IDS.has(id.toLowerCase());
}
function quote(text) {
    return '"' + text.replace(/"/g, "'") + '"';
}
/**
 * Validate a candidate model and normalize it.
 *
 * The contract every family keeps: an undeclared key or a wrong type is a refusal with
 * `UML_INPUT`, never a silently dropped field.
 */
export function validateProfileModel(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new UmlError('a profile model must be an object with schemaVersion 1, a profile, stereotypes, metaclasses and extensions', 'UML_INPUT');
    }
    const model = input;
    if (model.schemaVersion !== 1)
        throw new UmlError('a profile model must declare schemaVersion 1', 'UML_INPUT');
    const profile = model.profile;
    if (profile === null || typeof profile !== 'object' || typeof profile.id !== 'string' || profile.id.trim() === '') {
        throw new UmlError('a profile model needs a `profile` with a non-empty id', 'UML_INPUT');
    }
    const lists = {
        stereotypes: model.stereotypes ?? [],
        metaclasses: model.metaclasses ?? [],
        extensions: model.extensions ?? [],
        applications: model.applications ?? [],
        generalizations: model.generalizations ?? [],
    };
    for (const [name, value] of Object.entries(lists)) {
        if (!Array.isArray(value))
            throw new UmlError(name + ' must be an array', 'UML_INPUT');
    }
    const stereotypeIds = new Set();
    for (const stereotype of lists.stereotypes) {
        if (stereotype === null || typeof stereotype !== 'object' || typeof stereotype.id !== 'string' || stereotype.id.trim() === '') {
            throw new UmlError('every stereotype needs a non-empty string id', 'UML_INPUT');
        }
        if (stereotypeIds.has(stereotype.id))
            throw new UmlError('duplicate stereotype id ' + quote(stereotype.id), 'UML_INPUT');
        stereotypeIds.add(stereotype.id);
    }
    const metaclassIds = new Set();
    for (const metaclass of lists.metaclasses) {
        if (metaclass === null || typeof metaclass !== 'object' || typeof metaclass.id !== 'string' || metaclass.id.trim() === '') {
            throw new UmlError('every metaclass needs a non-empty string id', 'UML_INPUT');
        }
        if (metaclassIds.has(metaclass.id))
            throw new UmlError('duplicate metaclass id ' + quote(metaclass.id), 'UML_INPUT');
        metaclassIds.add(metaclass.id);
    }
    for (const id of [...stereotypeIds]) {
        if (metaclassIds.has(id))
            throw new UmlError(quote(id) + ' is declared as both a stereotype and a metaclass', 'UML_INPUT');
    }
    const undeclared = new Set();
    const extensions = [];
    for (const extension of lists.extensions) {
        if (extension === null || typeof extension !== 'object')
            throw new UmlError('every extension must be an object', 'UML_INPUT');
        if (typeof extension.stereotype !== 'string' || extension.stereotype.trim() === '')
            throw new UmlError('every extension needs the stereotype that extends', 'UML_INPUT');
        if (typeof extension.metaclass !== 'string' || extension.metaclass.trim() === '')
            throw new UmlError('every extension needs the metaclass it extends', 'UML_INPUT');
        if (!stereotypeIds.has(extension.stereotype))
            undeclared.add(extension.stereotype);
        if (!metaclassIds.has(extension.metaclass))
            undeclared.add(extension.metaclass);
        if (extension.multiplicity !== undefined && !MULTIPLICITIES.includes(extension.multiplicity)) {
            throw new UmlError('extension multiplicity must be ' + MULTIPLICITIES.join(' | ') + ', got ' + quote(String(extension.multiplicity)), 'UML_INPUT');
        }
        extensions.push({
            stereotype: extension.stereotype,
            metaclass: extension.metaclass,
            ...(extension.multiplicity === undefined ? {} : { multiplicity: extension.multiplicity }),
            ...(extension.label === undefined ? {} : { label: extension.label }),
        });
    }
    const generalizations = [];
    for (const generalization of lists.generalizations) {
        if (generalization === null || typeof generalization !== 'object')
            throw new UmlError('every generalization must be an object', 'UML_INPUT');
        for (const side of ['general', 'specific']) {
            const id = generalization[side];
            if (typeof id !== 'string' || id.trim() === '')
                throw new UmlError('every generalization needs a non-empty `' + side + '` stereotype id', 'UML_INPUT');
            if (!stereotypeIds.has(id))
                undeclared.add(id);
        }
        if (generalization.general === generalization.specific) {
            throw new UmlError('stereotype ' + quote(generalization.general) + ' cannot generalize itself', 'UML_INPUT');
        }
        generalizations.push({ general: generalization.general, specific: generalization.specific });
    }
    const applications = [];
    for (const application of lists.applications) {
        if (application === null || typeof application !== 'object')
            throw new UmlError('every application must be an object', 'UML_INPUT');
        for (const side of ['profile', 'applyTo']) {
            const value = application[side];
            if (typeof value !== 'string' || value.trim() === '')
                throw new UmlError('every application needs a non-empty `' + side + '`', 'UML_INPUT');
        }
        if (application.profile !== profile.id)
            undeclared.add(application.profile);
        applications.push({ profile: application.profile, applyTo: application.applyTo });
    }
    return {
        schemaVersion: 1,
        profile: { id: profile.id, ...(profile.label === undefined ? {} : { label: profile.label }) },
        stereotypes: lists.stereotypes.map((stereotype) => ({ id: stereotype.id, ...(stereotype.label === undefined ? {} : { label: stereotype.label }) })),
        metaclasses: lists.metaclasses.map((metaclass) => ({ id: metaclass.id, ...(metaclass.label === undefined ? {} : { label: metaclass.label }) })),
        extensions,
        applications,
        generalizations,
        ...(undeclared.size === 0 ? {} : { undeclared: [...undeclared].sort() }),
        ...(model.narrative === undefined ? {} : { narrative: model.narrative }),
    };
}
function labelOf(element) {
    return element.label ?? element.id;
}
/**
 * How one element is declared, and the alias the rest of the diagram uses.
 *
 * PlantUML puts the label where the name goes, so an id that needs no alias is used
 * directly and one that does gets a generated id plus an `alias` directive. That is the
 * same shape the use case module uses, for the same reason: the round trip has to come
 * back with the id the model wrote.
 */
function declaredAs(element, taken) {
    if (isPlainId(element.id) && !taken.has(element.id)) {
        taken.add(element.id);
        return { id: element.id, alias: element.id };
    }
    let index = 1;
    let candidate = 'E' + String(index);
    while (taken.has(candidate)) {
        index += 1;
        candidate = 'E' + String(index);
    }
    taken.add(candidate);
    return { id: element.id, alias: candidate };
}
// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
/**
 * Render a profile as PlantUML.
 *
 * The drawing is the approximation the family table declares: stereotypes and
 * metaclasses as the class diagram draws them, extensions and generalizations both as a
 * `--|>` because the notation has no second arrow for the first. Everything the drawing
 * cannot carry — which arrow is which, the extension multiplicity and role, the
 * applications — is written as a directive, so the text is a faithful record of the
 * model even though the picture is not.
 *
 * @param input - candidate `ProfileModelV1`.
 * @param notation - only `plantuml` draws a profile; mermaid has no view of this family.
 */
export function renderProfile(input, notation) {
    if (notation !== 'plantuml') {
        throw new UmlError('a profile diagram can only be drawn in plantuml; mermaid has no profile diagram: it has no metaclass or stereotype elements. Render it with notation "plantuml".', 'UML_VIEW_UNREPRESENTABLE');
    }
    const model = validateProfileModel(input);
    const warnings = [
        'UML_RENDER_APPROXIMATE_VIEW: plantuml has no profile element, so the profile package itself is not drawn; stereotypes and metaclasses are drawn as a class diagram draws them, and an extension and a generalization are both a --|> arrow.',
    ];
    const lines = ['@startuml'];
    lines.push(directiveLine('plantuml', 'uml v1 notation=plantuml family=profile'));
    lines.push(directiveLine('plantuml', 'profile ' + model.profile.id));
    const taken = new Set();
    const aliasOf = new Map();
    for (const metaclass of model.metaclasses) {
        const declared = declaredAs(metaclass, taken);
        aliasOf.set(metaclass.id, declared.alias);
        if (declared.alias !== metaclass.id)
            lines.push(directiveLine('plantuml', 'alias ' + declared.alias + ' ' + metaclass.id));
        lines.push('metaclass ' + quote(labelOf(metaclass)) + ' as ' + declared.alias);
    }
    for (const stereotype of model.stereotypes) {
        const declared = declaredAs(stereotype, taken);
        aliasOf.set(stereotype.id, declared.alias);
        if (declared.alias !== stereotype.id)
            lines.push(directiveLine('plantuml', 'alias ' + declared.alias + ' ' + stereotype.id));
        lines.push('class ' + quote(labelOf(stereotype)) + ' <<stereotype>> as ' + declared.alias);
    }
    // The directives come before the arrows: they are what tells the arrows apart on the
    // way back, and a reader of the text sees the legend before the drawing.
    for (const extension of model.extensions) {
        lines.push(directiveLine('plantuml', 'profileExtension ' + extension.stereotype + ' -> ' + extension.metaclass +
            (extension.multiplicity === undefined ? '' : ' ' + extension.multiplicity) +
            (extension.label === undefined ? '' : ' ' + extension.label)));
    }
    for (const application of model.applications) {
        lines.push(directiveLine('plantuml', 'profileApply ' + application.profile + ' -> ' + application.applyTo));
    }
    for (const extension of model.extensions) {
        lines.push((aliasOf.get(extension.stereotype) ?? extension.stereotype) + ' --|> ' + (aliasOf.get(extension.metaclass) ?? extension.metaclass));
    }
    for (const generalization of model.generalizations) {
        lines.push((aliasOf.get(generalization.specific) ?? generalization.specific) + ' --|> ' + (aliasOf.get(generalization.general) ?? generalization.general));
    }
    lines.push('@enduml');
    return { primary: lines.join('\n') + '\n', warnings };
}
export const PROFILE_FINDING_CODES = [
    'UML050_PROFILE_NO_STEREOTYPES',
    'UML051_PROFILE_UNUSED_STEREOTYPE',
    'UML052_PROFILE_EXTENSION_MISSING',
    'UML053_PROFILE_GENERALIZATION_CYCLE',
    'UML054_PROFILE_UNDECLARED_REFERENCE',
    'UML055_PROFILE_APPLICATION_MISSING',
    'UML056_PROFILE_UNDOCUMENTED',
];
/**
 * What a reader would get wrong about a profile.
 *
 * The checks read the model alone. Whether a profile is *right* for the metamodel it
 * extends is a question about the specification being profiled, and this does not answer
 * it: the codes below are about the profile being internally complete and readable.
 */
export function reviewProfileModel(model, labels) {
    const findings = [];
    const name = (id) => labels[id] ?? id;
    if (model.stereotypes.length === 0) {
        findings.push({
            code: 'UML050_PROFILE_NO_STEREOTYPES',
            severity: 'error',
            message: 'the profile declares no stereotype, so it extends the metamodel with nothing.',
            evidence: { stereotypes: 0 },
        });
    }
    const extended = new Set(model.extensions.map((extension) => extension.stereotype));
    const specialized = new Set(model.generalizations.flatMap((generalization) => [generalization.general, generalization.specific]));
    for (const stereotype of model.stereotypes) {
        if (extended.has(stereotype.id) || specialized.has(stereotype.id))
            continue;
        findings.push({
            code: 'UML051_PROFILE_UNUSED_STEREOTYPE',
            severity: 'warning',
            message: 'stereotype ' + name(stereotype.id) + ' extends no metaclass and specialises no other stereotype: nothing in the profile uses it.',
            evidence: { id: stereotype.id },
        });
    }
    for (const metaclass of model.metaclasses) {
        if (model.extensions.some((extension) => extension.metaclass === metaclass.id))
            continue;
        findings.push({
            code: 'UML052_PROFILE_EXTENSION_MISSING',
            severity: 'warning',
            message: 'metaclass ' + name(metaclass.id) + ' is declared but no stereotype extends it, so the profile does not change it.',
            evidence: { id: metaclass.id },
        });
    }
    // A stereotype hierarchy must be acyclic: the specification requires it, and a cycle
    // means no reader can tell which stereotype is the general one.
    const adjacency = new Map();
    for (const generalization of model.generalizations) {
        const list = adjacency.get(generalization.specific);
        if (list === undefined)
            adjacency.set(generalization.specific, [generalization.general]);
        else
            list.push(generalization.general);
    }
    const state = new Map();
    const path = [];
    const walk = (node) => {
        const seen = state.get(node);
        if (seen === 'visiting')
            return [...path.slice(path.indexOf(node)), node];
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
        if (cycle === undefined)
            continue;
        findings.push({
            code: 'UML053_PROFILE_GENERALIZATION_CYCLE',
            severity: 'error',
            message: 'the stereotype hierarchy is cyclic, so which stereotype is the general one has no answer.',
            detail: cycle.map((id) => name(id)).join(' -> '),
            evidence: { path: cycle },
        });
        break;
    }
    const undeclared = model.undeclared ?? [];
    if (undeclared.length > 0) {
        findings.push({
            code: 'UML054_PROFILE_UNDECLARED_REFERENCE',
            severity: 'error',
            message: 'the profile refers to ' + String(undeclared.length) + ' element(s) it never declares, so the arrow points at nothing a reader can look up.',
            detail: undeclared.join(', '),
            evidence: { ids: undeclared },
        });
    }
    if (model.applications.length === 0) {
        findings.push({
            code: 'UML055_PROFILE_APPLICATION_MISSING',
            severity: 'info',
            message: 'the profile is not applied to any package: nothing says where it is meant to be used.',
            evidence: { applications: 0 },
        });
    }
    if (model.profile.label === undefined && labels[model.profile.id] === undefined) {
        findings.push({
            code: 'UML056_PROFILE_UNDOCUMENTED',
            severity: 'info',
            message: 'the profile itself carries no name a reader can map back to the specification it extends: give it a display label or a narrative entry.',
            evidence: { id: model.profile.id },
        });
    }
    for (const stereotype of model.stereotypes) {
        if (stereotype.label !== undefined || labels[stereotype.id] !== undefined)
            continue;
        findings.push({
            code: 'UML056_PROFILE_UNDOCUMENTED',
            severity: 'info',
            message: 'stereotype ' + stereotype.id + ' carries no name a reader can map back to the specification: give it a display label or a narrative entry.',
            evidence: { id: stereotype.id },
        });
    }
    return findings;
}
/**
 * The profile family, as the engine's registry expects it.
 *
 * `parse` refuses with the family table's own words. It has to exist because the module
 * contract requires it, and it must refuse rather than return something: a parse would
 * have to decide which `--|>` is an extension and which is a generalization, and the
 * notation does not say.
 */
export const profileModule = {
    id: 'profile',
    render: (input, notation, _options) => renderProfile(input, notation),
    parse: () => {
        throw new UmlError('a profile diagram cannot be read back out of plantuml: it has no profile element, and an extension and a stereotype generalization are both a --|> arrow, so a parse would have to guess which fact the arrow carries. Keep the profile as its own model and review that.', 'UML_VIEW_UNREPRESENTABLE');
    },
    review: (model, labels) => reviewProfileModel(model, labels),
};

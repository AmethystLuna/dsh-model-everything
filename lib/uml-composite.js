/**
 * The composite structure diagram module.
 *
 * A composite structure diagram is a structured classifier seen from the inside: the parts
 * it is made of, the ports on its boundary, and the connectors between them. That reads
 * back out of the text, which is what separates this family from the profile.
 *
 * PlantUML has no composite-structure page, so the view is an approximation built from the
 * deployment diagram's vocabulary: a nested element for the classifier, the nestable
 * elements for its parts, `port`/`portin`/`portout` for the boundary, and the arrows for
 * connectors. Nesting is spelled, port direction is spelled, and both connector ends are
 * spelled - so the model survives the round trip. What the notation cannot say (a part's
 * type, a port's required interface, a connector's name) stays out of the model rather
 * than being invented on the way back.
 *
 * @module model-everything-uml-composite
 */
import { UmlError, UML_PLAIN_ID, directiveLine, } from './uml-syntax.js';
/** Elements PlantUML can nest; a part is declared with one of these. */
const NESTABLE = [
    'component', 'node', 'artifact', 'database', 'file', 'folder', 'frame', 'cloud',
    'package', 'queue', 'rectangle', 'stack', 'storage', 'card', 'hexagon', 'action',
    'process', 'collections',
];
const PORT_KEYWORDS = { port: 'inout', portin: 'in', portout: 'out' };
/** The port keyword a direction is drawn with. */
function portKeyword(direction) {
    if (direction === 'in')
        return 'portin';
    if (direction === 'out')
        return 'portout';
    return 'port';
}
function quote(text) {
    return '"' + text.replace(/"/g, "'") + '"';
}
function isPlainId(id) {
    return UML_PLAIN_ID.test(id) && !NESTABLE.includes(id.toLowerCase()) && id !== 'port' && id !== 'portin' && id !== 'portout';
}
/**
 * Validate a candidate model and normalize it.
 *
 * A port id and a part id may not collide: a connector endpoint is a bare name, so two
 * declarations sharing one would make the drawing say two things at once.
 */
export function validateCompositeModel(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new UmlError('a composite structure model must be an object with schemaVersion 1, a self, parts, ports and connectors', 'UML_INPUT');
    }
    const model = input;
    if (model.schemaVersion !== 1)
        throw new UmlError('a composite structure model must declare schemaVersion 1', 'UML_INPUT');
    const self = model.self;
    if (self === null || typeof self !== 'object' || typeof self.id !== 'string' || self.id.trim() === '') {
        throw new UmlError('a composite structure model needs a `self` with a non-empty id', 'UML_INPUT');
    }
    const kind = self.kind ?? 'component';
    if (!NESTABLE.includes(kind)) {
        throw new UmlError('self.kind must be one of ' + NESTABLE.join(' | ') + ', got ' + quote(String(kind)), 'UML_INPUT');
    }
    for (const [name, value] of Object.entries({ parts: model.parts ?? [], ports: model.ports ?? [], connectors: model.connectors ?? [] })) {
        if (!Array.isArray(value))
            throw new UmlError(name + ' must be an array', 'UML_INPUT');
    }
    const declared = new Set([self.id]);
    const parts = [];
    for (const part of model.parts ?? []) {
        if (part === null || typeof part !== 'object' || typeof part.id !== 'string' || part.id.trim() === '') {
            throw new UmlError('every part needs a non-empty string id', 'UML_INPUT');
        }
        if (declared.has(part.id))
            throw new UmlError(quote(part.id) + ' is declared more than once as a part or a port', 'UML_INPUT');
        declared.add(part.id);
        parts.push({ id: part.id, ...(part.label === undefined ? {} : { label: part.label }) });
    }
    const ports = [];
    for (const port of model.ports ?? []) {
        if (port === null || typeof port !== 'object' || typeof port.id !== 'string' || port.id.trim() === '') {
            throw new UmlError('every port needs a non-empty string id', 'UML_INPUT');
        }
        if (declared.has(port.id))
            throw new UmlError(quote(port.id) + ' is declared more than once as a part or a port', 'UML_INPUT');
        declared.add(port.id);
        const direction = port.direction ?? 'inout';
        if (direction !== 'in' && direction !== 'out' && direction !== 'inout') {
            throw new UmlError('port direction must be in | out | inout, got ' + quote(String(direction)), 'UML_INPUT');
        }
        ports.push({ id: port.id, direction });
    }
    const undeclared = new Set();
    const connectors = [];
    for (const connector of model.connectors ?? []) {
        if (connector === null || typeof connector !== 'object')
            throw new UmlError('every connector must be an object', 'UML_INPUT');
        for (const side of ['from', 'to']) {
            const endpoint = connector[side];
            if (typeof endpoint !== 'string' || endpoint.trim() === '') {
                throw new UmlError('every connector needs a non-empty `' + side + '` end', 'UML_INPUT');
            }
            if (!declared.has(endpoint))
                undeclared.add(endpoint);
        }
        if (connector.from === connector.to) {
            throw new UmlError('a connector cannot join ' + quote(connector.from) + ' to itself', 'UML_INPUT');
        }
        connectors.push({
            from: connector.from,
            to: connector.to,
            ...(connector.label === undefined ? {} : { label: connector.label }),
        });
    }
    return {
        schemaVersion: 1,
        self: { id: self.id, kind, ...(self.label === undefined ? {} : { label: self.label }) },
        parts,
        ports,
        connectors,
        ...(undeclared.size === 0 ? {} : { undeclared: [...undeclared].sort() }),
        ...(model.narrative === undefined ? {} : { narrative: model.narrative }),
    };
}
// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
/**
 * Render a composite structure diagram as PlantUML.
 *
 * The classifier is drawn as a nested element, its parts inside it, its ports on its
 * boundary, and the connectors after the block. The `self` directive carries the
 * classifier's own id, because a nested element's closing brace is the only thing that
 * says where its inside ends.
 *
 * @param input - candidate `CompositeModelV1`.
 * @param notation - only `plantuml` draws this family; mermaid has no ports or connectors.
 */
export function renderComposite(input, notation) {
    if (notation !== 'plantuml') {
        throw new UmlError('a composite structure diagram can only be drawn in plantuml; mermaid has no port or connector element and no nested element to put parts in. Render it with notation "plantuml".', 'UML_VIEW_UNREPRESENTABLE');
    }
    const model = validateCompositeModel(input);
    const warnings = [
        'UML_RENDER_APPROXIMATE_VIEW: plantuml has no composite structure diagram; this is a deployment-diagram drawing of one. Nesting, part names, port direction and both connector ends are carried; a part\'s type, a port\'s interfaces and a connector\'s name are not expressible and are not drawn.',
    ];
    const lines = ['@startuml'];
    lines.push(directiveLine('plantuml', 'uml v1 notation=plantuml family=composite-structure'));
    lines.push(directiveLine('plantuml', 'compositeSelf ' + model.self.kind + ' ' + model.self.id));
    const label = model.self.label === undefined ? quote(model.self.id) : quote(model.self.label);
    lines.push(model.self.kind + ' ' + label + ' as ' + model.self.id + ' {');
    for (const port of model.ports) {
        // A port declaration takes no alias, so its id is what the reader sees; a port whose
        // id PlantUML cannot use is reported rather than silently renamed.
        lines.push('  ' + portKeyword(port.direction) + ' ' + port.id);
    }
    for (const part of model.parts) {
        if (part.label === undefined)
            lines.push('  component ' + part.id);
        else
            lines.push('  component ' + quote(part.label) + ' as ' + part.id);
    }
    lines.push('}');
    for (const connector of model.connectors) {
        lines.push(connector.from + ' --> ' + connector.to + (connector.label === undefined ? '' : ' : ' + connector.label));
    }
    lines.push('@enduml');
    return { primary: lines.join('\n') + '\n', warnings };
}
const SELF_DIRECTIVE = /^compositeSelf\s+([A-Za-z_][A-Za-z0-9_]*)\s+(\S+)\s*$/;
const DECLARATION = new RegExp('^(' + NESTABLE.join('|') + ')\\s+(?:"([^"]*)"|(\\S+))(?:\\s+as\\s+(\\S+))?\\s*(\\{)?\\s*$', 'i');
const PORT_DECLARATION = /^(port|portin|portout)\s+(\S+)\s*$/i;
const CONNECTOR = /^(\S+)\s+(-->|->|--|\.\.>|\.\.)\s+(\S+?)(?:\s*:\s*(.*))?$/;
/**
 * Read a composite structure diagram back into a model.
 *
 * Faithful to this module's renderer and tolerant of hand-written text: the classifier is
 * the outermost block (named by the `compositeSelf` directive when the renderer wrote it),
 * `port`/`portin`/`portout` lines are its ports, nestable declarations inside the block are
 * its parts, and every arrow between two names is a connector. A construct the notation
 * carries but this model does not - a nested block inside a part, a stereotype, a note - is
 * reported in `discardedConstructs`, never dropped in silence.
 */
export function parseComposite(text, notation) {
    if (notation !== 'plantuml') {
        throw new UmlError('a composite structure diagram can only be read from plantuml', 'UML_VIEW_UNREPRESENTABLE');
    }
    const all = text.split(/\r?\n/).map((raw, index) => ({ line: index + 1, text: raw.trim() }));
    const warnings = [];
    const discarded = [];
    const labels = {};
    let self;
    let fromDirective;
    const parts = [];
    const ports = [];
    const connectors = [];
    let depth = 0;
    let seenConnector = false;
    for (const entry of all) {
        const line = entry.text;
        if (line === '' || line.startsWith('@') || line.startsWith("'")) {
            // The renderer's own directives are read elsewhere; a comment is not a construct.
            if (line.startsWith("'dsh-model-everything:")) {
                const directive = line.slice("'dsh-model-everything:".length).trim();
                const selfMatch = SELF_DIRECTIVE.exec(directive);
                if (selfMatch !== null)
                    fromDirective = { kind: selfMatch[1].toLowerCase(), id: selfMatch[2] };
            }
            continue;
        }
        if (/^(left to right direction|top to bottom direction|skinparam|hide|show|title|scale|allowmixing|allow_mixing)\b/i.test(line)) {
            discarded.push({ line: entry.line, text: line, construct: line.split(/\s+/)[0].toLowerCase() });
            continue;
        }
        const port = PORT_DECLARATION.exec(line);
        if (port !== null) {
            if (depth === 0) {
                discarded.push({ line: entry.line, text: line, construct: 'port outside a classifier' });
                continue;
            }
            const id = port[2];
            if (ports.some((entry) => entry.id === id) || parts.some((entry) => entry.id === id)) {
                warnings.push('line ' + String(entry.line) + ': ' + id + ' is declared twice; the second declaration is ignored');
                continue;
            }
            ports.push({ id, direction: PORT_KEYWORDS[port[1].toLowerCase()] });
            continue;
        }
        const declaration = DECLARATION.exec(line);
        if (declaration !== null) {
            const kind = declaration[1].toLowerCase();
            const quoted = declaration[2];
            const bare = declaration[3];
            const alias = declaration[4];
            const opens = declaration[5] === '{';
            const id = alias ?? bare ?? quoted ?? '';
            // `component "App" as app` names the id in the alias and the label in the quotes.
            // `component App as app` puts the label in the bare position instead, and that is a
            // label rather than an id: the alias is what the rest of the diagram refers to.
            const labelText = quoted ?? (alias === undefined ? undefined : bare);
            if (labelText !== undefined)
                labels[id] = labelText;
            if (depth === 0) {
                if (self !== undefined) {
                    discarded.push({ line: entry.line, text: line, construct: 'second top-level block' });
                }
                else {
                    self = { id, kind, ...(labelText === undefined ? {} : { label: labelText }) };
                }
            }
            else if (depth === 1) {
                if (opens) {
                    // A block inside the classifier would be a part with its own inside. The model
                    // has no nesting, so the part is kept and the block it opens is reported.
                    discarded.push({ line: entry.line, text: line, construct: 'nested block inside a part' });
                }
                if (!parts.some((entry) => entry.id === id) && !ports.some((entry) => entry.id === id)) {
                    parts.push({ id, ...(labelText === undefined ? {} : { label: labelText }) });
                }
                else {
                    warnings.push('line ' + String(entry.line) + ': ' + id + ' is declared twice; the second declaration is ignored');
                }
            }
            else {
                // Whatever is declared inside a part is that part's inside, and this model has no
                // place for it. Reporting it is the only alternative to inventing a structure.
                discarded.push({ line: entry.line, text: line, construct: 'declaration inside a part' });
            }
            if (opens)
                depth += 1;
            continue;
        }
        if (line === '}') {
            depth = Math.max(0, depth - 1);
            seenConnector = false;
            continue;
        }
        const connector = CONNECTOR.exec(line);
        if (connector !== null) {
            const [, from, , to, label] = connector;
            connectors.push({ from, to, ...(label === undefined || label === '' ? {} : { label }) });
            seenConnector = true;
            continue;
        }
        if (seenConnector || depth > 0) {
            discarded.push({ line: entry.line, text: line, construct: 'line this model does not carry' });
        }
        else {
            discarded.push({ line: entry.line, text: line, construct: 'statement outside any classifier' });
        }
    }
    if (self === undefined) {
        if (fromDirective === undefined) {
            throw new UmlError('no structured classifier found: a composite structure diagram needs one block that holds its parts, such as `component Order as order { ... }`', 'UML_INPUT');
        }
        self = { id: fromDirective.id, kind: fromDirective.kind };
    }
    else if (fromDirective !== undefined) {
        // The directive is the renderer's own record; it wins, because the block's alias can
        // be a label PlantUML was given.
        self = { ...self, id: fromDirective.id, kind: fromDirective.kind };
    }
    const declared = new Set([self.id, ...parts.map((part) => part.id), ...ports.map((port) => port.id)]);
    const undeclared = [...new Set(connectors.flatMap((connector) => [connector.from, connector.to]))].filter((endpoint) => !declared.has(endpoint)).sort();
    // No narrative is invented here. The labels a reader gave the drawing come back in
    // `labels`, which is where a display name belongs; writing them into the model as well
    // would add a field the model never carried, and the round trip would stop being exact.
    const model = {
        schemaVersion: 1,
        self,
        parts,
        ports,
        connectors,
        ...(undeclared.length === 0 ? {} : { undeclared }),
    };
    return { model, labels, warnings, discardedConstructs: discarded, discardedEdges: 0 };
}
export const COMPOSITE_FINDING_CODES = [
    'UML057_COMPOSITE_NO_PARTS',
    'UML058_COMPOSITE_PORT_UNCONNECTED',
    'UML059_COMPOSITE_CONNECTOR_ENDPOINT_MISSING',
    'UML060_COMPOSITE_DUPLICATE_PART',
    'UML061_COMPOSITE_PORT_COLLISION',
    'UML062_COMPOSITE_UNDOCUMENTED',
];
/**
 * What a reader would get wrong about a composite structure.
 *
 * The questions are the ones the diagram exists to answer: is anything inside, does every
 * port lead somewhere, does every connector join two things that exist, and is each part
 * and port named after something in the system rather than after its drawing position.
 * Whether the decomposition is *right* is a question about the design, and this does not
 * answer it.
 */
export function reviewCompositeModel(model, labels) {
    const findings = [];
    const name = (id) => labels[id] ?? id;
    if (model.parts.length === 0) {
        findings.push({
            code: 'UML057_COMPOSITE_NO_PARTS',
            severity: 'error',
            message: 'the classifier is drawn as a composite structure but holds no part: a structure diagram with an empty inside says nothing about how it is built.',
            evidence: { parts: 0 },
        });
    }
    const connected = new Set(model.connectors.flatMap((connector) => [connector.from, connector.to]));
    for (const port of model.ports) {
        if (connected.has(port.id))
            continue;
        findings.push({
            code: 'UML058_COMPOSITE_PORT_UNCONNECTED',
            severity: 'warning',
            message: 'port ' + name(port.id) + ' (' + port.direction + ') has no connector, so nothing reaches the classifier through it.',
            evidence: { id: port.id, direction: port.direction },
        });
    }
    const undeclared = model.undeclared ?? [];
    if (undeclared.length > 0) {
        findings.push({
            code: 'UML059_COMPOSITE_CONNECTOR_ENDPOINT_MISSING',
            severity: 'error',
            message: 'a connector ends at ' + String(undeclared.length) + ' name(s) the classifier never declares, so the line points at nothing a reader can look up.',
            detail: undeclared.join(', '),
            evidence: { ids: undeclared },
        });
    }
    const seen = new Set();
    for (const part of model.parts) {
        if (seen.has(part.id)) {
            findings.push({
                code: 'UML060_COMPOSITE_DUPLICATE_PART',
                severity: 'error',
                message: 'part ' + part.id + ' is declared more than once, so a connector that names it is ambiguous.',
                evidence: { id: part.id },
            });
        }
        seen.add(part.id);
    }
    if (seen.has(model.self.id)) {
        findings.push({
            code: 'UML061_COMPOSITE_PORT_COLLISION',
            severity: 'error',
            message: 'the classifier itself is also declared as a part (' + model.self.id + '): a nested element inside itself has no reading.',
            evidence: { id: model.self.id },
        });
    }
    for (const port of model.ports) {
        if (seen.has(port.id)) {
            findings.push({
                code: 'UML061_COMPOSITE_PORT_COLLISION',
                severity: 'error',
                message: 'port ' + port.id + ' shares its name with a part: a connector that names it cannot be read.',
                evidence: { id: port.id },
            });
        }
    }
    if (model.self.label === undefined && labels[model.self.id] === undefined) {
        findings.push({
            code: 'UML062_COMPOSITE_UNDOCUMENTED',
            severity: 'info',
            message: 'the classifier carries no name a reader can map back to the design: give it a display label or a narrative entry.',
            evidence: { id: model.self.id },
        });
    }
    for (const part of model.parts) {
        if (part.label !== undefined || labels[part.id] !== undefined)
            continue;
        findings.push({
            code: 'UML062_COMPOSITE_UNDOCUMENTED',
            severity: 'info',
            message: 'part ' + part.id + ' carries no name a reader can map back to the design: give it a display label or a narrative entry.',
            evidence: { id: part.id },
        });
    }
    return findings;
}
/** The composite structure family, as the engine's registry expects it. */
export const compositeModule = {
    id: 'composite-structure',
    render: (input, notation, _options) => renderComposite(input, notation),
    parse: (text, notation) => parseComposite(text, notation),
    review: (model, labels) => reviewCompositeModel(model, labels),
};

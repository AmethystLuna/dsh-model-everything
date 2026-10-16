/**
 * The timing diagram module.
 *
 * A timing diagram is an interaction seen against a clock: which participants exist,
 * what state each one is in over time, and what they send each other. It is not a
 * machine and not a trace, so it has its own model — lifelines, the time points they
 * change state at, the messages between them, and the duration constraints — its own
 * renderer, and its own review.
 *
 * PlantUML is the only notation that draws one. Mermaid has no timing diagram, and the
 * engine's capability table says so with a reason instead of drawing something else
 * under the name.
 *
 * @module model-everything-uml-timing
 */
import { UmlError, directiveLine, readUmlDirectives, declaredFamily, umlSourceLines, } from './uml-syntax.js';
const LIFELINE_KINDS = ['robust', 'concise', 'binary', 'clock', 'analog', 'rectangle'];
/** Keywords that mark a lifeline declaration, and its drawing style. */
const LIFELINE_DECLARATION = /^(robust|concise|binary|clock|analog|rectangle)\b/i;
/**
 * A moment on the axis: `50`, `@50`, `at 50`, `@+150`, `@-200`.
 *
 * The sign is matched with the token, because the two mean different things:
 * `@100 <-> @+150` is "150 from here", while `@-200` is the absolute run-up before the
 * moment the reader cares about. Reading either off the line instead of off the token is
 * how one of them silently becomes the other.
 */
const TIME_TOKEN = /(?:@|at\s+)?\s*([+-]?)(\d+(?:\.\d+)?)/i;
/**
 * The time a line carries, read from the marker rather than from the line.
 *
 * `TIME_TOKEN.exec` is anchored nowhere useful on a line like `S1 @300`: its first match
 * is the `1` inside the lifeline id, so the state change would land at time 1. Only the
 * digits that follow the `@` (or the `at` keyword) are a time.
 */
function timeAfterMarker(text) {
    const marker = /(?:@|at\s+)\s*([+-]?)(\d+(?:\.\d+)?)/i.exec(text);
    if (marker !== null)
        return { sign: marker[1], digits: marker[2] };
    // No marker: a bare number is the time (`@WB` blocks write `0 is idle`).
    const bare = /^\s*([+-]?)(\d+(?:\.\d+)?)\s*$/.exec(text);
    return bare === null ? undefined : { sign: bare[1], digits: bare[2] };
}
const TIME_POINT = /^(?:@|at\s+)\s*[+-]?\d+(?:\.\d+)?\s*$/i;
/** `WU @100`: the same marker, addressed to one lifeline. */
const LIFELINE_TIME = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:@|at\s+)\s*[+-]?\d+(?:\.\d+)?\s*$/i;
/**
 * `S1 has 0,1,2,hello`: the order the states are drawn in, and their display names.
 *
 * It is a drawing instruction for one lifeline, not a state change, so it is named and
 * discarded rather than read as a change to a state nobody declared.
 */
const STATE_ORDER = /^([A-Za-z_][A-Za-z0-9_]*)\s+has\s+(.+)$/i;
/**
 * `WU is Waiting`, `WU@50 is Waiting`, `WU at 50 is Waiting`.
 *
 * The marker is captured off the id: reading it off the start of the line instead is how
 * `WU at 0 is Idle` loses its time and lands at zero by accident rather than by saying so.
 */
const STATE_LINE = /^([A-Za-z_][A-Za-z0-9_]*)\s*((?:@|at\s+)\s*[+-]?\d+(?:\.\d+)?)?\s*(?:is|=|:)\s*(.+)$/i;
/** A right-hand state label: `Waiting is "waiting for a URL"`. */
const STATE_LABEL = /^(.+?)\s+is\s+(?:"([^"]*)"|'([^']*)')\s*$/;
/**
 * `is Waiting : some note` and `is Waiting #LightCyan;line:Aqua`.
 *
 * Neither is part of the state: one is a comment printed beside the change, the other is
 * a colour. They are stripped from the name, and a model that wants the colour back has
 * to say so in its own terms rather than in the diagram's.
 *
 * The scan runs outside quotes only. `is "{1}#Gold"` is a state whose name contains a
 * hash - an indeterminate value with a colour, which is how a timing diagram draws one -
 * and stripping at that hash would silently rename the state.
 */
function stripStateAnnotations(text) {
    let out = '';
    let quote;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quote !== undefined) {
            out += char;
            if (char === quote)
                quote = undefined;
            continue;
        }
        if (char === '"' || char === "'") {
            quote = char;
            out += char;
            continue;
        }
        if (char === '#')
            break;
        if (char === ':')
            break;
        out += char;
    }
    return out.trim();
}
/** `WU -> WB : URL`, optionally with its own time: `WU -> WB @50 : URL`. */
const MESSAGE_LINE = /^([A-Za-z_][A-Za-z0-9_]*)\s*->\s*([A-Za-z_][A-Za-z0-9_]*)\s*((?:@|at\s+)\s*[+-]?\d+(?:\.\d+)?)?\s*(?::\s*(.*))?$/;
/** `@100 <-> @+150 : {150 ms}`, and the `@100 <-> @200 : text` spelling. */
const CONSTRAINT_LINE = /^(?:@|at\s+)\s*[+-]?\d+(?:\.\d+)?\s*<->\s*((?:@|at\s+)\s*[+-]?\d+(?:\.\d+)?)\s*(?::\s*(.*))?$/i;
/** `scale 100 as 100 ms` and `scale 1 as 1 s`: the axis unit, written on the scale. */
const SCALE_UNIT = /^scale\s+\S+\s+as\s+(.+)$/i;
/** `scale 100` alone: a drawing width, not a unit. */
const SCALE_WIDTH = /^scale\b/i;
/** PlantUML timing constructs this model does not carry. They are named, never dropped. */
const FOREIGN_TIMING_CONSTRUCT = /^(analog|highlight|note|constraint|time-axis|date|now|show|hide|title|header|footer|legend|caption|skinparam|scale)\b/i;
const RESERVED_IDS = new Set(['is', 'at', 'as', 'and', 'robust', 'concise', 'binary', 'clock', 'analog', 'rectangle', 'note', 'highlight', 'scale', 'title', 'hide', 'show']);
function isLifelineKind(value) {
    return typeof value === 'string' && LIFELINE_KINDS.includes(value);
}
function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function quote(text) {
    return '"' + text.replace(/"/g, "'") + '"';
}
/** Strip one layer of quoting, and the trailing state-label quotation PlantUML allows. */
function unquote(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)
        return trimmed.slice(1, -1);
    if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
        return trimmed.slice(1, -1);
    return trimmed;
}
/**
 * Validate a candidate model and normalize it.
 *
 * The contract other families keep: an undeclared key or a wrong type is a refusal with
 * `UML_INPUT`, never a silently dropped field. A model that renders into a diagram that
 * is not the model is worse than no diagram.
 */
export function validateTimingModel(input) {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
        throw new UmlError('a timing model must be an object with schemaVersion 1, lifelines, states, segments and messages', 'UML_INPUT');
    }
    const model = input;
    if (model.schemaVersion !== 1)
        throw new UmlError('a timing model must declare schemaVersion 1', 'UML_INPUT');
    if (model.unit !== undefined && (typeof model.unit !== 'string' || model.unit.trim() === '')) {
        throw new UmlError('`unit` must be a non-empty string when it is present', 'UML_INPUT');
    }
    const lifelines = model.lifelines ?? [];
    const states = model.states ?? [];
    const segments = model.segments ?? [];
    const messages = model.messages ?? [];
    const constraints = model.constraints ?? [];
    for (const [name, value] of [['lifelines', lifelines], ['states', states], ['segments', segments], ['messages', messages], ['constraints', constraints]]) {
        if (!Array.isArray(value))
            throw new UmlError(name + ' must be an array', 'UML_INPUT');
    }
    const lifelineIds = new Set();
    for (const lifeline of lifelines) {
        if (lifeline === null || typeof lifeline !== 'object' || typeof lifeline.id !== 'string' || lifeline.id.trim() === '') {
            throw new UmlError('every lifeline needs a non-empty string id', 'UML_INPUT');
        }
        if (lifelineIds.has(lifeline.id))
            throw new UmlError('duplicate lifeline id ' + quote(lifeline.id), 'UML_INPUT');
        lifelineIds.add(lifeline.id);
        if (lifeline.kind !== undefined && !isLifelineKind(lifeline.kind)) {
            throw new UmlError('unknown lifeline kind ' + quote(String(lifeline.kind)) + '; expected ' + LIFELINE_KINDS.join(' | '), 'UML_INPUT');
        }
        if (lifeline.period !== undefined && (!finiteNumber(lifeline.period) || lifeline.period <= 0)) {
            throw new UmlError('lifeline ' + quote(lifeline.id) + ': period must be a positive number', 'UML_INPUT');
        }
    }
    const stateIds = new Set();
    for (const state of states) {
        if (state === null || typeof state !== 'object' || typeof state.id !== 'string' || state.id.trim() === '') {
            throw new UmlError('every state needs a non-empty string id', 'UML_INPUT');
        }
        if (stateIds.has(state.id))
            throw new UmlError('duplicate state id ' + quote(state.id), 'UML_INPUT');
        stateIds.add(state.id);
    }
    const undeclared = new Set();
    const segmentsOut = [];
    for (const segment of segments) {
        if (segment === null || typeof segment !== 'object')
            throw new UmlError('every segment must be an object', 'UML_INPUT');
        if (typeof segment.lifeline !== 'string' || segment.lifeline.trim() === '')
            throw new UmlError('every segment needs the lifeline it belongs to', 'UML_INPUT');
        if (typeof segment.state !== 'string' || segment.state.trim() === '')
            throw new UmlError('every segment needs the state it shows', 'UML_INPUT');
        if (!finiteNumber(segment.from))
            throw new UmlError('segment on ' + quote(segment.lifeline) + ': `from` must be a number', 'UML_INPUT');
        if (!lifelineIds.has(segment.lifeline))
            throw new UmlError('segment on ' + quote(segment.lifeline) + ' names a lifeline the model does not declare', 'UML_INPUT');
        if (!stateIds.has(segment.state))
            throw new UmlError('segment from ' + String(segment.from) + ' names the state ' + quote(segment.state) + ', which the model does not declare', 'UML_INPUT');
        segmentsOut.push({
            lifeline: segment.lifeline,
            state: segment.state,
            from: segment.from,
            ...(segment.atStart === undefined ? {} : { atStart: segment.atStart }),
        });
    }
    const messagesOut = [];
    for (const message of messages) {
        if (message === null || typeof message !== 'object')
            throw new UmlError('every message must be an object', 'UML_INPUT');
        for (const side of ['from', 'to']) {
            const id = message[side];
            if (typeof id !== 'string' || id.trim() === '')
                throw new UmlError('every message needs a non-empty `' + side + '` lifeline id', 'UML_INPUT');
            if (!lifelineIds.has(id))
                undeclared.add(id);
        }
        if (!finiteNumber(message.time))
            throw new UmlError('message ' + quote(message.from + ' -> ' + message.to) + ': `time` must be a number', 'UML_INPUT');
        messagesOut.push({
            from: message.from,
            to: message.to,
            time: message.time,
            ...(message.label === undefined ? {} : { label: message.label }),
        });
    }
    const constraintsOut = [];
    for (const constraint of constraints) {
        if (constraint === null || typeof constraint !== 'object')
            throw new UmlError('every constraint must be an object', 'UML_INPUT');
        if (!finiteNumber(constraint.fromTime) || !finiteNumber(constraint.toTime)) {
            throw new UmlError('every constraint needs numeric `fromTime` and `toTime`', 'UML_INPUT');
        }
        constraintsOut.push({
            fromTime: constraint.fromTime,
            toTime: constraint.toTime,
            ...(constraint.label === undefined ? {} : { label: constraint.label }),
        });
    }
    return {
        schemaVersion: 1,
        ...(model.unit === undefined ? {} : { unit: model.unit }),
        lifelines: lifelines.map((lifeline) => ({
            id: lifeline.id,
            ...(lifeline.label === undefined ? {} : { label: lifeline.label }),
            ...(lifeline.kind === undefined ? {} : { kind: lifeline.kind }),
            ...(lifeline.period === undefined ? {} : { period: lifeline.period }),
        })),
        states: states.map((state) => ({ id: state.id, ...(state.label === undefined ? {} : { label: state.label }) })),
        segments: segmentsOut,
        messages: messagesOut,
        constraints: constraintsOut,
        ...(undeclared.size === 0 ? {} : { undeclared: [...undeclared].sort() }),
        ...(model.narrative === undefined ? {} : { narrative: model.narrative }),
    };
}
/**
 * The state a change names, in model terms.
 *
 * A diagram draws the reader's label, so `timingState Waiting = "waiting for a URL"`
 * says which id that label belongs to. Without the directive the drawn name *is* the id,
 * which is what a hand-written diagram means.
 */
function resolveState(states, name) {
    for (const state of states) {
        if (state.id === name)
            return { id: state.id, ...(state.label === undefined ? {} : { label: state.label }) };
    }
    for (const state of states) {
        if (state.label === name)
            return { id: state.id, ...(state.label === undefined ? {} : { label: state.label }) };
    }
    return { id: name };
}
/**
 * Where the axis starts: the earliest moment any element is dated at.
 *
 * A lifeline's first state change at that moment begins the bar, which is why a diagram
 * cannot show a lifeline whose earliest change is later without drawing its earlier
 * stretch as something.
 */
function axisOrigin(model) {
    const times = [
        ...model.segments.map((segment) => segment.from),
        ...model.messages.map((message) => message.time),
        ...model.constraints.flatMap((constraint) => [constraint.fromTime, constraint.toTime]),
    ];
    return times.length === 0 ? 0 : Math.min(...times);
}
function labelOfLifeline(lifeline) {
    return lifeline.label ?? lifeline.id;
}
function stateById(model, id) {
    return model.states.find((state) => state.id === id);
}
/** The state name PlantUML draws: the reader's label when there is one, the id otherwise. */
function stateName(model, id) {
    const state = stateById(model, id);
    const label = state?.label ?? id;
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(label) ? label : quote(label);
}
// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
/** The header, then every fact the PlantUML timing syntax cannot spell, as directives. */
function renderDirectives(model, lines, declaredStart) {
    lines.push(directiveLine('plantuml', 'uml v1 notation=plantuml family=timing'));
    if (model.unit !== undefined)
        lines.push(directiveLine('plantuml', 'timingUnit ' + phrase(model.unit)));
    for (const lifeline of model.lifelines) {
        lines.push(directiveLine('plantuml', 'timingLifeline ' + lifeline.id + (lifeline.period === undefined ? '' : ' period=' + String(lifeline.period))));
    }
    for (const state of model.states) {
        if (state.label === undefined)
            continue;
        lines.push(directiveLine('plantuml', 'timingState ' + state.id + ' = ' + phrase(state.label)));
    }
    const written = new Set();
    for (const segment of model.segments) {
        const key = segment.lifeline + ' ' + String(segment.from);
        const explicit = segment.atStart === true || declaredStart.has(key);
        if (!explicit || written.has(key))
            continue;
        written.add(key);
        lines.push(directiveLine('plantuml', 'timingAtStart ' + key));
    }
}
/** A directive value that may contain spaces, written back as one quoted field. */
function phrase(text) {
    return '"' + text.replace(/"/g, "'") + '"';
}
function readPhrase(text) {
    const trimmed = text.trim();
    const quoted = /^"(.*)"$/.exec(trimmed);
    return quoted === null ? trimmed : quoted[1];
}
/**
 * Every dated element, in non-decreasing time order.
 *
 * PlantUML reads `is`/`at`/message lines in the order they appear and takes a decreasing
 * time as an error, so the renderer sorts rather than trusting the model's array order.
 * The index keeps a stable order between elements that share a time.
 */
function datedItems(model) {
    const items = [];
    /** Times already marked, so two elements at one moment share a single `@t` line. */
    const marked = new Set();
    let index = 0;
    const next = () => { index += 1; return index; };
    const markLine = (lifeline, time) => {
        const key = lifeline + '@' + String(time);
        if (marked.has(key))
            return;
        marked.add(key);
        items.push({ time, index: next(), line: lifeline + ' @' + String(time) });
    };
    for (const segment of model.segments) {
        const name = stateName(model, segment.state);
        if (segment.atStart === true) {
            items.push({ time: segment.from, index: next(), line: segment.lifeline + ' at ' + String(segment.from) + ' is ' + name });
        }
        else {
            markLine(segment.lifeline, segment.from);
            items.push({ time: segment.from, index: next(), line: segment.lifeline + ' is ' + name });
        }
    }
    for (const message of model.messages) {
        items.push({ time: message.time, index: next(), line: message.from + ' -> ' + message.to + ' @' + String(message.time) + (message.label === undefined ? '' : ' : ' + message.label) });
    }
    for (const constraint of model.constraints) {
        items.push({ time: constraint.fromTime, index: next(), line: '@' + String(constraint.fromTime) + ' <-> @' + String(constraint.toTime) + (constraint.label === undefined ? '' : ' : ' + constraint.label) });
    }
    return items.sort((left, right) => left.time - right.time || left.index - right.index);
}
/**
 * Render a timing model as PlantUML.
 *
 * @param input - candidate `TimingModelV1`.
 * @param notation - only `plantuml` draws a timing diagram; another notation is refused
 *   by the capability table before reaching here.
 */
export function renderTiming(input, notation) {
    const model = validateTimingModel(input);
    const warnings = [...(model.undeclared ?? []).map((id) => 'UML_RENDER_UNDECLARED_REFERENCE: the model refers to ' + quote(id) + ', which no lifeline declares; PlantUML will draw a bare timeline for it.')];
    if (notation !== 'plantuml') {
        throw new UmlError('a timing diagram can only be drawn in plantuml: mermaid has no timing diagram. Render it with notation "plantuml".', 'UML_VIEW_UNREPRESENTABLE');
    }
    const origin = axisOrigin(model);
    // A lifeline's first change is what the notation draws its bar from. When that is not
    // the axis origin, the drawn diagram carries a stretch the model never declared — and
    // `atStart` is exactly how a model says "that stretch is real, I meant it".
    const firstChange = new Map();
    for (const segment of model.segments) {
        const seen = firstChange.get(segment.lifeline);
        if (seen === undefined || segment.from < seen)
            firstChange.set(segment.lifeline, segment.from);
    }
    const declaredStart = new Set();
    for (const segment of model.segments) {
        if (segment.from !== firstChange.get(segment.lifeline))
            continue;
        if (segment.atStart !== true) {
            if (segment.from !== origin) {
                warnings.push('UML_RENDER_IMPLICIT_START: ' + quote(segment.lifeline) + ' first changes state at ' + String(segment.from) + ', after the axis starts at ' + String(origin) + ', so the notation draws ' + quote(segment.state) + ' from the start of the axis. Set atStart to say the lifeline begins there.');
            }
            // The drawn diagram still has to read back as this model, so the start the notation
            // implies is written down rather than left to be guessed by the next parse.
            declaredStart.add(segment.lifeline + ' ' + String(segment.from));
        }
    }
    const lines = ['@startuml'];
    renderDirectives(model, lines, declaredStart);
    for (const lifeline of model.lifelines) {
        const kind = lifeline.kind ?? 'robust';
        const label = labelOfLifeline(lifeline);
        const period = lifeline.kind === 'clock' && lifeline.period !== undefined ? ' with period ' + String(lifeline.period) : '';
        lines.push(kind + ' ' + quote(label) + ' as ' + lifeline.id + period);
    }
    const ordered = datedItems(model);
    if (wasReordered(ordered)) {
        warnings.push('UML_RENDER_TIME_ORDER: the model lists dated elements out of chronological order; the diagram is written in time order, because that is the only order the notation reads.');
    }
    for (const item of ordered)
        lines.push(item.line);
    lines.push('@enduml');
    return { primary: lines.join('\n') + '\n', warnings };
}
/**
 * Whether sorting changed the model's own order of dated elements.
 *
 * The renderer sorts because the notation only reads a non-decreasing axis. That is a
 * silent rewrite of what the caller wrote down, so it is reported. The item index is the
 * model's order, so "already ordered" is exactly "indices still ascend".
 */
function wasReordered(ordered) {
    if (ordered.length < 2)
        return false;
    for (let index = 1; index < ordered.length; index += 1) {
        if (ordered[index].index < ordered[index - 1].index)
            return true;
    }
    return false;
}
/**
 * `robust "Browser" as WB`, `clock "CLK" as CLK with period 10`, `robust WB`.
 *
 * The documented clock form is `with period`, and the bare `period` is accepted too
 * because PlantUML accepts it. `pulse` and `offset` are named in `discarded` rather than
 * dropped: they shape the wave a clock is drawn as, and a reader who wrote them down
 * deserves to be told the model does not carry them.
 */
function readLifeline(line) {
    const match = /^(robust|concise|binary|clock|analog|rectangle)\b\s*(.*)$/i.exec(line);
    if (match === null)
        return undefined;
    const kind = match[1].toLowerCase();
    const rest = match[2].trim().replace(/[;{]\s*$/, '').trim();
    if (rest === '')
        return undefined;
    const discarded = [];
    const periodMatch = /\s+(?:with\s+)?period\s+(\d+(?:\.\d+)?)/i.exec(rest);
    const period = periodMatch === null ? undefined : Number(periodMatch[1]);
    const withoutPeriod = periodMatch === null ? rest : rest.slice(0, periodMatch.index).trim();
    const tail = periodMatch === null ? '' : rest.slice(periodMatch.index + periodMatch[0].length).trim();
    if (tail !== '') {
        const pulse = /\bpulse\s+(\d+(?:\.\d+)?)/i.exec(tail);
        const offset = /\boffset\s+(\d+(?:\.\d+)?)/i.exec(tail);
        if (pulse !== null)
            discarded.push('pulse ' + pulse[1]);
        if (offset !== null)
            discarded.push('offset ' + offset[1]);
        const leftover = tail.replace(/\b(?:pulse|offset)\s+\d+(?:\.\d+)?/gi, '').trim();
        if (leftover !== '')
            discarded.push(leftover);
    }
    const aliased = /^(?:"([^"]*)"|'([^']*)'|(\S+))\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(withoutPeriod);
    if (aliased !== null) {
        const label = aliased[1] ?? aliased[2] ?? aliased[3];
        return { id: aliased[4], label, kind, ...(period === undefined ? {} : { period }), ...(discarded.length === 0 ? {} : { discarded }) };
    }
    const quoted = /^"([^"]*)"$/.exec(withoutPeriod);
    if (quoted !== null)
        return { id: quoted[1].trim(), kind, ...(period === undefined ? {} : { period }), ...(discarded.length === 0 ? {} : { discarded }) };
    return { id: withoutPeriod, kind, ...(period === undefined ? {} : { period }), ...(discarded.length === 0 ? {} : { discarded }) };
}
/** `clock clk with period 1`: a lifeline declared without the kind keyword. */
const BARE_CLOCK = /^(?:clock\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+with\s+period\s+(\d+(?:\.\d+)?)\s*$/i;
function readTimingDirectives(values) {
    const unit = values.get('timingUnit')?.[0];
    const periods = new Map();
    for (const entry of values.get('timingLifeline') ?? []) {
        const match = /^(\S+)\s+period=(\d+(?:\.\d+)?)$/.exec(entry.trim());
        if (match !== null)
            periods.set(match[1], Number(match[2]));
    }
    const stateLabels = new Map();
    const drawnToId = new Map();
    for (const entry of values.get('timingState') ?? []) {
        const separator = entry.indexOf(' = ');
        if (separator <= 0)
            continue;
        const id = entry.slice(0, separator).trim();
        const label = readPhrase(entry.slice(separator + 3));
        stateLabels.set(id, label);
        if (label !== '' && !drawnToId.has(label))
            drawnToId.set(label, id);
    }
    const atStart = new Set();
    for (const entry of values.get('timingAtStart') ?? []) {
        const match = /^(\S+)\s+(-?\d+(?:\.\d+)?)$/.exec(entry.trim());
        if (match !== null)
            atStart.add(match[1] + '@' + match[2]);
    }
    return { ...(unit === undefined ? {} : { unit: readPhrase(unit) }), periods, stateLabels, drawnToId, atStart };
}
/**
 * Read PlantUML timing text back into a model.
 *
 * Two sources are read together, and the diagram wins where they disagree: the diagram
 * is what a reader sees. The directives carry only what the syntax cannot spell — the
 * exact state ids, the explicit end of a segment, the unit — so a hand-written diagram
 * with no directives still parses into a complete model.
 */
export function parseTiming(text, notation) {
    if (notation !== 'plantuml') {
        throw new UmlError('a timing diagram can only be read out of plantuml: mermaid has no timing diagram to parse.', 'UML_VIEW_UNREPRESENTABLE');
    }
    const directives = readUmlDirectives(text.split(/\r?\n/), 'plantuml');
    const hints = readTimingDirectives(directives.values);
    const warnings = [];
    const discardedConstructs = [];
    const labels = {};
    const lifelines = [];
    const lifelineIds = new Set();
    // States come from the diagram, in the order the lifelines enter them: a state the
    // diagram never shows has nothing to order against. `timingState` directives are read
    // as the id a drawn label belongs to (`resolveState`), not as declarations of their
    // own, so a state that exists only in a directive stays out of the model.
    const states = [];
    const stateIds = new Set();
    const segments = [];
    const pending = [];
    const messages = [];
    const constraints = [];
    const undeclared = new Set();
    let currentTime;
    let lastTime;
    let diagramUnit;
    const declaredLifeline = (id) => lifelineIds.has(id);
    /** Resolve a time token: the `+` says "relative to the last marker" (`@+100`). */
    const resolveToken = (token, base) => {
        if (token === undefined)
            return undefined;
        const value = Number(token.sign + token.digits);
        if (!Number.isFinite(value))
            return undefined;
        return token.sign === '+' && base !== undefined ? base + value : value;
    };
    const mark = (value, lineNumber) => {
        if (lastTime !== undefined && value < lastTime) {
            warnings.push('UML_PARSE_TIME_ORDER at line ' + String(lineNumber) + ': time ' + String(value) + ' comes after ' + String(lastTime) + '; PlantUML draws a non-decreasing axis.');
        }
        lastTime = value;
        currentTime = value;
    };
    for (const source of umlSourceLines(text, 'plantuml')) {
        const line = source.text;
        const lifeline = readLifeline(line);
        if (lifeline !== undefined) {
            if (lifelineIds.has(lifeline.id)) {
                warnings.push('UML_PARSE_DUPLICATE_LIFELINE at line ' + String(source.number) + ': ' + quote(lifeline.id) + ' is declared twice; the first declaration wins.');
                continue;
            }
            lifelineIds.add(lifeline.id);
            const period = lifeline.period ?? hints.periods.get(lifeline.id);
            lifelines.push({
                id: lifeline.id,
                ...(lifeline.label === undefined || lifeline.label === lifeline.id ? {} : { label: lifeline.label }),
                ...(lifeline.kind === undefined ? {} : { kind: lifeline.kind }),
                ...(period === undefined ? {} : { period }),
            });
            if (lifeline.label !== undefined)
                labels[lifeline.id] = lifeline.label;
            // What the declaration carried and the model does not: named, with its line.
            for (const detail of lifeline.discarded ?? []) {
                discardedConstructs.push({ construct: detail.split(' ')[0].toLowerCase(), line: source.number, text: line });
            }
            continue;
        }
        const bareClock = BARE_CLOCK.exec(line);
        if (bareClock !== null && readLifeline(line) === undefined) {
            const id = bareClock[1];
            if (!lifelineIds.has(id)) {
                lifelineIds.add(id);
                const period = Number(bareClock[2]);
                lifelines.push({ id, kind: 'clock', ...(Number.isFinite(period) ? { period } : {}) });
            }
            continue;
        }
        const scaleUnit = SCALE_UNIT.exec(line);
        if (scaleUnit !== null) {
            diagramUnit = scaleUnit[1].trim();
            continue;
        }
        if (SCALE_WIDTH.test(line))
            continue;
        const point = TIME_POINT.exec(line);
        if (point !== null) {
            const value = resolveToken(timeAfterMarker(line), currentTime);
            if (value !== undefined)
                mark(value, source.number);
            continue;
        }
        const constraint = CONSTRAINT_LINE.exec(line);
        if (constraint !== null) {
            const fromTime = resolveToken(timeAfterMarker(line), currentTime);
            if (fromTime === undefined)
                continue;
            // The second endpoint is relative to the first, not to the last marker:
            // `@100 <-> @+150` is 150 after 100.
            const toTime = resolveToken(timeAfterMarker(constraint[1]), fromTime);
            if (toTime === undefined)
                continue;
            constraints.push({
                fromTime,
                toTime,
                ...(constraint[2] === undefined || constraint[2].trim() === '' ? {} : { label: constraint[2].trim() }),
            });
            continue;
        }
        const message = MESSAGE_LINE.exec(line);
        if (message !== null) {
            const inline = message[3] === undefined ? undefined : resolveToken(timeAfterMarker(message[3]), currentTime);
            if (inline === undefined && currentTime === undefined) {
                warnings.push('UML_PARSE_MESSAGE_WITHOUT_TIME at line ' + String(source.number) + ': ' + quote(line) + ' carries no time and no preceding @ marker was read; the message is drawn at time 0.');
            }
            const at = inline ?? currentTime ?? 0;
            if (!declaredLifeline(message[1]))
                undeclared.add(message[1]);
            if (!declaredLifeline(message[2]))
                undeclared.add(message[2]);
            messages.push({ from: message[1], to: message[2], time: at, ...(message[4] === undefined || message[4].trim() === '' ? {} : { label: message[4].trim() }) });
            if (inline !== undefined)
                mark(inline, source.number);
            else
                currentTime = at;
            continue;
        }
        // `S1 has 0,1,2,hello` would also match the state form below (with `has` as the
        // separator), so it is ruled out first: it is a drawing order, not a state change.
        const stateOrder = STATE_ORDER.exec(line);
        if (stateOrder !== null) {
            discardedConstructs.push({ construct: 'has', line: source.number, text: line });
            continue;
        }
        const stateLine = STATE_LINE.exec(line);
        if (stateLine !== null) {
            const lifelineId = stateLine[1];
            if (RESERVED_IDS.has(lifelineId.toLowerCase())) {
                discardedConstructs.push({ construct: lifelineId.toLowerCase(), line: source.number, text: line });
                continue;
            }
            const marker = stateLine[2];
            const inline = marker === undefined ? undefined : resolveToken(timeAfterMarker(marker), currentTime);
            if (inline === undefined && currentTime === undefined) {
                warnings.push('UML_PARSE_STATE_WITHOUT_TIME at line ' + String(source.number) + ': ' + quote(line) + ' carries no time; it is read as time 0.');
            }
            const time = inline ?? currentTime ?? 0;
            if (!declaredLifeline(lifelineId))
                undeclared.add(lifelineId);
            const name = unquote(stripStateAnnotations(stateLine[3]));
            if (name === '')
                continue;
            // The directive comes first: it says which id the drawn name belongs to, and the
            // drawn name is often the label rather than the id (`WU is "waiting for a URL"`).
            const directedId = hints.drawnToId.get(name);
            const labelMatch = STATE_LABEL.exec(name);
            const drawn = directedId ?? (labelMatch === null ? name : labelMatch[1].trim());
            const stateLabel = directedId === undefined
                ? (labelMatch === null ? undefined : (labelMatch[2] ?? labelMatch[3]))
                : hints.stateLabels.get(directedId);
            const resolved = resolveState(states, drawn);
            const stateId = resolved.id;
            if (!stateIds.has(stateId)) {
                stateIds.add(stateId);
                const label = resolved.label ?? stateLabel;
                states.push({ id: stateId, ...(label === undefined || label === stateId ? {} : { label }) });
            }
            pending.push({ lifeline: lifelineId, time, name: stateId, line: source.number, atStart: marker !== undefined });
            continue;
        }
        // `WU @100` last: with no state name it is only a marker, and only after the state
        // form has been ruled out can it be read as one.
        const lifelineTime = LIFELINE_TIME.exec(line);
        if (lifelineTime !== null) {
            const value = resolveToken(timeAfterMarker(line), currentTime);
            if (value !== undefined)
                mark(value, source.number);
            if (!declaredLifeline(lifelineTime[1]))
                undeclared.add(lifelineTime[1]);
            continue;
        }
        if (FOREIGN_TIMING_CONSTRUCT.test(line)) {
            const keyword = /^[A-Za-z-]+/.exec(line)?.[0] ?? line;
            discardedConstructs.push({ construct: keyword.toLowerCase(), line: source.number, text: line });
            continue;
        }
        discardedConstructs.push({ construct: 'unread line', line: source.number, text: line });
    }
    // A state runs until the next state change on the same lifeline. The diagram says
    // nothing about where the last one ends, so neither does the model: the field that
    // used to carry it was dropped when the round trip kept losing it.
    //
    // The change at the axis origin begins its lifeline, so it is `atStart` — that is what
    // a renderer draws and what a parser reads back, and marking it here is what keeps the
    // two agreeing instead of each guessing.
    const origin = Math.min(...pending.map((entry) => entry.time ?? 0), ...messages.map((message) => message.time), ...constraints.flatMap((constraint) => [constraint.fromTime, constraint.toTime]));
    const byLifeline = new Map();
    for (const entry of pending) {
        const list = byLifeline.get(entry.lifeline);
        if (list === undefined)
            byLifeline.set(entry.lifeline, [entry]);
        else
            list.push(entry);
    }
    for (const [lifelineId, entries] of byLifeline) {
        // Two changes at one moment on one lifeline are one change: the later line wins,
        // which is how PlantUML reads them too.
        const collapsed = [];
        for (const entry of [...entries].sort((left, right) => (left.time ?? 0) - (right.time ?? 0) || left.line - right.line)) {
            const previous = collapsed[collapsed.length - 1];
            if (previous !== undefined && (previous.time ?? 0) === (entry.time ?? 0))
                collapsed[collapsed.length - 1] = entry;
            else
                collapsed.push(entry);
        }
        for (const entry of collapsed) {
            const from = entry.time ?? 0;
            // The change at the axis origin begins its lifeline's bar: that is what a renderer
            // draws, so it is what a parse reads back. A later first change is not a start.
            const atStart = entry.atStart || from === origin || hints.atStart.has(lifelineId + '@' + String(from));
            segments.push({ lifeline: lifelineId, state: entry.name, from, ...(atStart ? { atStart: true } : {}) });
        }
    }
    // Stable by `from`: two lifelines changing state at the same moment keep the model's
    // own order between them, so a round trip does not reshuffle them.
    segments.sort((left, right) => left.from - right.from);
    // A state earns its place in the model by being drawn, and in the order the lifelines
    // enter it. The renderer walks `segments`, so a state listed anywhere else would not
    // round-trip.
    const orderedStates = [];
    const seenStates = new Set();
    for (const segment of segments) {
        if (seenStates.has(segment.state))
            continue;
        seenStates.add(segment.state);
        const known = states.find((state) => state.id === segment.state);
        orderedStates.push(known ?? { id: segment.state });
    }
    const unit = hints.unit ?? diagramUnit;
    const model = {
        schemaVersion: 1,
        ...(unit === undefined ? {} : { unit }),
        lifelines,
        states: orderedStates,
        segments,
        messages,
        constraints,
        ...(undeclared.size === 0 ? {} : { undeclared: [...undeclared].sort() }),
    };
    return { model, labels, warnings, discardedConstructs, discardedEdges: 0 };
}
export const TIMING_FINDING_CODES = [
    'UML042_TIMING_NO_LIFELINES',
    'UML043_TIMING_EMPTY_LIFELINE',
    'UML044_TIMING_TIME_ORDER',
    'UML045_TIMING_SIMULTANEOUS_STATES',
    'UML046_TIMING_UNDECLARED_REFERENCE',
    'UML047_TIMING_CONSTRAINT_RANGE',
    'UML048_TIMING_STATE_UNUSED',
    'UML049_TIMING_UNDOCUMENTED',
];
/**
 * What a reader would get wrong about a timing diagram.
 *
 * The checks read the model alone: whether a duration is achievable is a question about
 * the system, not about the diagram, and it is not answered here.
 */
export function reviewTimingModel(model, labels) {
    const findings = [];
    const name = (id) => labels[id] ?? id;
    if (model.lifelines.length === 0) {
        findings.push({
            code: 'UML042_TIMING_NO_LIFELINES',
            severity: 'error',
            message: 'the diagram declares no lifeline, so there is no participant whose state over time it could show.',
            evidence: { lifelines: 0 },
        });
    }
    const touched = new Set();
    for (const segment of model.segments)
        touched.add(segment.lifeline);
    for (const message of model.messages) {
        touched.add(message.from);
        touched.add(message.to);
    }
    for (const lifeline of model.lifelines) {
        if (!touched.has(lifeline.id)) {
            findings.push({
                code: 'UML043_TIMING_EMPTY_LIFELINE',
                severity: 'warning',
                message: 'lifeline ' + name(lifeline.id) + ' carries no state change and no message: it is drawn but says nothing.',
                evidence: { id: lifeline.id },
            });
        }
    }
    // Negative times are legal in a timing diagram: they are the run-up before the moment
    // the reader cares about (`@-200`, then `@100`). So nothing here rejects a sign.
    //
    // The line order of a diagram is chronological, and so is the model's array order when
    // it is written down. Segment i after segment j on one lifeline at a time before j is
    // therefore an impossible diagram — a state that ends before the one it follows.
    const byLifeline = new Map();
    for (const segment of model.segments) {
        const list = byLifeline.get(segment.lifeline);
        if (list === undefined)
            byLifeline.set(segment.lifeline, [segment]);
        else
            list.push(segment);
    }
    for (const [lifelineId, list] of byLifeline) {
        for (let index = 1; index < list.length; index += 1) {
            if (list[index].from >= list[index - 1].from)
                continue;
            findings.push({
                code: 'UML044_TIMING_TIME_ORDER',
                severity: 'error',
                message: name(lifelineId) + ' changes state at ' + String(list[index].from) + ' after a change at ' + String(list[index - 1].from) + ': the earlier state would end before it begins.',
                evidence: { lifeline: lifelineId, previous: list[index - 1].from, time: list[index].from },
            });
        }
    }
    // One lifeline is in one state at a time. Two changes at the same moment are read as
    // one by every renderer, so the model saying otherwise is a model the diagram cannot
    // carry — PlantUML keeps the later line and drops the earlier one without a word.
    const moments = new Map();
    for (const segment of model.segments) {
        const key = segment.lifeline + '@' + String(segment.from);
        const list = moments.get(key);
        if (list === undefined)
            moments.set(key, [segment.state]);
        else
            list.push(segment.state);
    }
    for (const [key, states] of moments) {
        if (states.length < 2)
            continue;
        const [lifelineId, time] = key.split('@');
        findings.push({
            code: 'UML045_TIMING_SIMULTANEOUS_STATES',
            severity: 'error',
            message: name(lifelineId) + ' is put into ' + String(states.length) + ' states at time ' + time + ' (' + states.join(', ') + '): one lifeline is in one state at a time, and a renderer keeps only the last.',
            evidence: { lifeline: lifelineId, time: Number(time), states },
        });
    }
    // The array is the diagram's line order, so it is chronological by definition. One that
    // is not cannot be written down as it stands, and the renderer would have to reorder a
    // model the author declared — which it reports but a review should not let pass.
    for (let index = 1; index < model.segments.length; index += 1) {
        const previous = model.segments[index - 1];
        const current = model.segments[index];
        if (current.from >= previous.from)
            continue;
        findings.push({
            code: 'UML044_TIMING_TIME_ORDER',
            severity: 'error',
            message: 'segment ' + String(index) + ' (' + name(current.lifeline) + ' at ' + String(current.from) + ') is written before a later change (' + name(previous.lifeline) + ' at ' + String(previous.from) + '): a diagram is written in time order.',
            detail: 'Sort the segments by `from` (the lifeline order within one moment is yours), or render with uml_render, which warns and sorts.',
            evidence: { index, from: current.from, previousFrom: previous.from },
        });
    }
    const undeclared = model.undeclared ?? [];
    if (undeclared.length > 0) {
        findings.push({
            code: 'UML046_TIMING_UNDECLARED_REFERENCE',
            severity: 'error',
            message: 'the diagram refers to ' + String(undeclared.length) + ' element(s) it never declares, so the line points at nothing a reader can look up.',
            detail: undeclared.join(', '),
            evidence: { ids: undeclared },
        });
    }
    for (const constraint of model.constraints) {
        if (constraint.toTime < constraint.fromTime) {
            findings.push({
                code: 'UML047_TIMING_CONSTRAINT_RANGE',
                severity: 'error',
                message: 'a duration constraint runs from ' + String(constraint.fromTime) + ' to ' + String(constraint.toTime) + ': the interval ends before it starts.',
                evidence: { fromTime: constraint.fromTime, toTime: constraint.toTime },
            });
        }
    }
    const usedStates = new Set(model.segments.map((segment) => segment.state));
    for (const state of model.states) {
        if (!usedStates.has(state.id)) {
            findings.push({
                code: 'UML048_TIMING_STATE_UNUSED',
                severity: 'warning',
                message: 'state ' + name(state.id) + ' is declared but no lifeline is ever monitored in it.',
                evidence: { id: state.id },
            });
        }
    }
    for (const lifeline of model.lifelines) {
        if (lifeline.label === undefined && labels[lifeline.id] === undefined) {
            findings.push({
                code: 'UML049_TIMING_UNDOCUMENTED',
                severity: 'info',
                message: 'lifeline ' + lifeline.id + ' carries no name a reader can map back to the system: give it a display label.',
                evidence: { id: lifeline.id },
            });
        }
    }
    for (const state of model.states) {
        if (state.label === undefined) {
            findings.push({
                code: 'UML049_TIMING_UNDOCUMENTED',
                severity: 'info',
                message: 'state ' + state.id + ' carries no name a reader can map back to the system: give it a display label or a narrative entry.',
                evidence: { id: state.id },
            });
        }
    }
    return findings;
}
/** The timing family, as the engine's registry expects it. */
export const timingModule = {
    id: 'timing',
    render: (input, notation, _options) => renderTiming(input, notation),
    parse: (text, notation) => parseTiming(text, notation),
    review: (model, labels) => reviewTimingModel(model, labels),
};

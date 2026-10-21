/**
 * Applying edits to a model file: the delta side of the verification loop.
 *
 * A model is the largest thing any of these tools takes. Handing it back whole on every
 * iteration is what makes a four-round fix cost four models. Here an edit names one change,
 * the file carries the rest, and the caller gets the structural diff plus - when asked - the
 * difference in what the engine decided, in the same call.
 *
 * Every operation works on a copy and the result is validated before anything is written. A
 * refused edit leaves the file exactly as it was: an invalid model on disk would make the next
 * verification spend a round reporting that, which is the cost this tool exists to remove.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateModel } from './engine.js';
import { OptionShapeError } from './option-shape.js';
const CLONE = (value) => JSON.parse(JSON.stringify(value));
/** Read the model at `path`; a missing file is a refusal, not an empty model. */
export function readModelFile(path) {
    if (typeof path !== 'string' || path.trim() === '') {
        throw new OptionShapeError('EDIT_OPTION_INVALID', 'modelPath must be a non-empty path to a JSON file.');
    }
    const full = resolve(path);
    let text;
    try {
        text = readFileSync(full, 'utf8');
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new OptionShapeError('EDIT_OPTION_INVALID', `modelPath could not be read: ${reason}. Edits apply to a file that already exists; model_verify can create the model inline first, or write it yourself.`);
    }
    let parsed;
    try {
        parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new OptionShapeError('EDIT_OPTION_INVALID', `modelPath is not valid JSON: ${reason}.`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new OptionShapeError('EDIT_OPTION_INVALID', 'modelPath must hold a model object, not a list or a scalar.');
    }
    return { model: parsed, full };
}
function statesOf(model) {
    return Array.isArray(model.states) ? model.states : [];
}
function transitionsOf(model) {
    return Array.isArray(model.transitions) ? model.transitions : [];
}
function requireString(value, name) {
    if (typeof value !== 'string' || value === '')
        throw new OptionShapeError('EDIT_OPTION_INVALID', `${name} must be a non-empty string.`);
    return value;
}
/** JSON pointer, so anything without a named operation still has a way to be edited. */
function pointerParts(path) {
    const text = requireString(path, 'path');
    if (!text.startsWith('/'))
        throw new OptionShapeError('EDIT_OPTION_INVALID', `path must be a JSON pointer starting with "/", got ${JSON.stringify(text)}.`);
    return text.split('/').slice(1).map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
}
function atPointer(model, parts, create) {
    let node = model;
    for (const part of parts.slice(0, -1)) {
        const next = node[part];
        if (next === undefined) {
            if (!create)
                throw new OptionShapeError('EDIT_OPTION_INVALID', `path does not exist at "${part}".`);
            const created = {};
            node[part] = created;
            node = created;
        }
        else if (next !== null && typeof next === 'object') {
            node = next;
        }
        else {
            throw new OptionShapeError('EDIT_OPTION_INVALID', `path runs through "${part}", which is not an object.`);
        }
    }
    return { parent: node, key: parts[parts.length - 1] ?? '' };
}
/**
 * Accept the compact spelling of an operation as well as the long one.
 *
 * An operation is a small thing - add a state, wire a transition - and the long form spends more
 * tokens on key names than on the change. Five operations cost 76 tokens spelled out and 39 in the
 * compact form, and a batch of twenty is where that difference starts to matter.
 *
 *   {addState: "c"}                    {addState: {id: "c", terminal: true}}
 *   {removeState: "c"}
 *   {addTransition: ["a", "reset", "c"]}     {addTransition: {from, event, to, guard?, ...}}
 *   {removeTransition: ["a", "go"]}          {updateTransition: ["a", "go", {guard: ...}]}
 *   {set: ["/init", "a"]}                    {remove: "/init"}
 *
 * The long form is unchanged and is what the errors talk about.
 */
export function normalizeOperation(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new OptionShapeError('EDIT_OPTION_INVALID', 'every op must be an object.');
    }
    const value = raw;
    if (typeof value.op === 'string')
        return value;
    const keys = Object.keys(value);
    if (keys.length !== 1) {
        throw new OptionShapeError('EDIT_OPTION_INVALID', `an operation names exactly one op, got ${JSON.stringify(keys)}.`);
    }
    const name = keys[0];
    const argument = value[name];
    if (name === 'addState' || name === 'removeState') {
        if (typeof argument === 'string') {
            return name === 'addState' ? { op: name, state: { id: argument } } : { op: name, id: argument };
        }
        if (name === 'addState' && argument !== null && typeof argument === 'object')
            return { op: name, state: argument };
        throw new OptionShapeError('EDIT_OPTION_INVALID', `${name} takes a state id, or a state object for addState.`);
    }
    if (name === 'addTransition' || name === 'removeTransition' || name === 'updateTransition') {
        if (Array.isArray(argument)) {
            if (name === 'addTransition' && argument.length === 3) {
                const [from, event, to] = argument;
                return { op: name, transition: { from, event, to } };
            }
            if (name === 'removeTransition' && argument.length === 2) {
                const [from, event] = argument;
                return { op: name, from, event };
            }
            if (name === 'updateTransition' && argument.length === 3) {
                const [from, event, patch] = argument;
                return { op: name, from, event, patch };
            }
            throw new OptionShapeError('EDIT_OPTION_INVALID', `${name} takes ${name === 'updateTransition' ? '["from", "event", {patch}]' : name === 'addTransition' ? '["from", "event", "to"]' : '["from", "event"]'}.`);
        }
        if (name === 'addTransition' && argument !== null && typeof argument === 'object')
            return { op: name, transition: argument };
        throw new OptionShapeError('EDIT_OPTION_INVALID', `${name} takes a list, or a transition object for addTransition.`);
    }
    if (name === 'set') {
        if (Array.isArray(argument) && argument.length === 2)
            return { op: 'set', path: argument[0], value: argument[1] };
        if (argument !== null && typeof argument === 'object' && 'path' in argument) {
            const { path, value } = argument;
            return { op: 'set', path, value };
        }
        throw new OptionShapeError('EDIT_OPTION_INVALID', 'set takes ["/path", value] or {path, value}.');
    }
    if (name === 'remove') {
        if (typeof argument === 'string')
            return { op: 'remove', path: argument };
        throw new OptionShapeError('EDIT_OPTION_INVALID', 'remove takes a JSON pointer string.');
    }
    throw new OptionShapeError('EDIT_OPTION_INVALID', `unknown op ${JSON.stringify(name)}. Known ops: addState, removeState, addTransition, removeTransition, updateTransition, set, remove.`);
}
/** Apply one operation to a model copy, returning the changes it made. */
export function applyOperation(model, operation) {
    const op = requireString(operation.op, 'op');
    const changes = [];
    if (op === 'addState') {
        const state = operation.state;
        const id = requireString(state?.id, 'state.id');
        if (statesOf(model).some((entry) => entry.id === id)) {
            throw new OptionShapeError('EDIT_OPTION_INVALID', `state "${id}" already exists; use update on it instead of adding it twice.`);
        }
        model.states = [...statesOf(model), state];
        changes.push({ kind: 'added', what: 'state ' + id, detail: state?.terminal === true ? 'terminal' : '' });
        return changes;
    }
    if (op === 'removeState') {
        const id = requireString(operation.id, 'id');
        const before = statesOf(model);
        if (!before.some((entry) => entry.id === id))
            throw new OptionShapeError('EDIT_OPTION_INVALID', `no state "${id}" to remove.`);
        model.states = before.filter((entry) => entry.id !== id);
        const dropped = transitionsOf(model).filter((entry) => entry.from === id || entry.to === id);
        model.transitions = transitionsOf(model).filter((entry) => entry.from !== id && entry.to !== id);
        changes.push({ kind: 'removed', what: 'state ' + id, detail: dropped.length > 0 ? `and ${String(dropped.length)} transition(s) that used it` : '' });
        return changes;
    }
    if (op === 'addTransition') {
        const transition = operation.transition;
        const from = requireString(transition?.from, 'transition.from');
        const event = requireString(transition?.event, 'transition.event');
        const to = requireString(transition?.to, 'transition.to');
        if (transitionsOf(model).some((entry) => entry.from === from && entry.event === event)) {
            throw new OptionShapeError('EDIT_OPTION_INVALID', `a transition for ${from} + ${event} already exists; update it instead of adding another.`);
        }
        model.transitions = [...transitionsOf(model), transition];
        changes.push({ kind: 'added', what: `transition ${from} + ${event}`, detail: 'to ' + to });
        return changes;
    }
    if (op === 'removeTransition') {
        const from = requireString(operation.from, 'from');
        const event = requireString(operation.event, 'event');
        const before = transitionsOf(model);
        const kept = before.filter((entry) => !(entry.from === from && entry.event === event));
        if (kept.length === before.length)
            throw new OptionShapeError('EDIT_OPTION_INVALID', `no transition for ${from} + ${event} to remove.`);
        model.transitions = kept;
        changes.push({ kind: 'removed', what: `transition ${from} + ${event}`, detail: '' });
        return changes;
    }
    if (op === 'updateTransition') {
        const from = requireString(operation.from, 'from');
        const event = requireString(operation.event, 'event');
        const patch = operation.patch;
        if (patch === undefined || typeof patch !== 'object' || Array.isArray(patch)) {
            throw new OptionShapeError('EDIT_OPTION_INVALID', 'patch must be an object of the fields to replace.');
        }
        const list = transitionsOf(model);
        const index = list.findIndex((entry) => entry.from === from && entry.event === event);
        if (index < 0)
            throw new OptionShapeError('EDIT_OPTION_INVALID', `no transition for ${from} + ${event} to update.`);
        list[index] = { ...list[index], ...patch };
        model.transitions = list;
        changes.push({ kind: 'updated', what: `transition ${from} + ${event}`, detail: Object.keys(patch).join(', ') });
        return changes;
    }
    if (op === 'set') {
        const parts = pointerParts(operation.path);
        if (parts.length === 0)
            throw new OptionShapeError('EDIT_OPTION_INVALID', 'path must name something inside the model.');
        const { parent, key } = atPointer(model, parts, true);
        parent[key] = CLONE(operation.value);
        changes.push({ kind: 'updated', what: 'set ' + String(operation.path), detail: '' });
        return changes;
    }
    if (op === 'remove') {
        const parts = pointerParts(operation.path);
        if (parts.length === 0)
            throw new OptionShapeError('EDIT_OPTION_INVALID', 'path must name something inside the model.');
        const { parent, key } = atPointer(model, parts, false);
        if (!(key in parent))
            throw new OptionShapeError('EDIT_OPTION_INVALID', `nothing at ${String(operation.path)} to remove.`);
        delete parent[key];
        changes.push({ kind: 'removed', what: 'remove ' + String(operation.path), detail: '' });
        return changes;
    }
    throw new OptionShapeError('EDIT_OPTION_INVALID', `unknown op ${JSON.stringify(op)}. Known ops: addState, removeState, addTransition, removeTransition, updateTransition, set, remove.`);
}
export function applyEdits(path, operations, options = {}) {
    if (!Array.isArray(operations) || operations.length === 0) {
        throw new OptionShapeError('EDIT_OPTION_INVALID', 'ops must be a non-empty array of operations.');
    }
    const { model: original, full } = readModelFile(path);
    const next = CLONE(original);
    const changes = [];
    const normalized = operations.map((raw, index) => {
        try {
            return normalizeOperation(raw);
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new OptionShapeError('EDIT_OPTION_INVALID', `operation ${String(index + 1)} was refused: ${reason}`);
        }
    });
    for (const [index, raw] of normalized.entries()) {
        try {
            changes.push(...applyOperation(next, raw));
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new OptionShapeError('EDIT_OPTION_INVALID', `operation ${String(index + 1)} (${String(raw.op)}) was refused: ${reason}`);
        }
    }
    const validation = validateModel(next);
    if (!validation.ok && options.allowInvalid !== true) {
        // Name the operation the batch first stops validating at, not just the symptom: a caller that
        // reads "a transition to an unknown state" still has to find which entry introduced it.
        let firstBad = -1;
        const partial = CLONE(original);
        for (const [index, raw] of operations.entries()) {
            try {
                applyOperation(partial, raw);
            }
            catch {
                firstBad = index;
                break;
            }
            if (!validateModel(partial).ok) {
                firstBad = index;
                break;
            }
        }
        const where = firstBad < 0 ? '' : ` Operation ${String(firstBad + 1)} (${String(operations[firstBad]?.op)}) is where it first stops validating.`;
        throw new OptionShapeError('EDIT_RESULT_INVALID', 'the batch would leave an invalid model, so nothing was written: ' + validation.errors.join('; ') + '.' + where + ' Fix the list, or pass allowInvalid to write it anyway and continue in a second call.');
    }
    const text = JSON.stringify(validation.ok ? validation.model : next, null, 2) + '\n';
    const temporary = full + '.tmp';
    writeFileSync(temporary, text, 'utf8');
    renameSync(temporary, full);
    return { model: next, changes, full, valid: validation.ok, errors: validation.ok ? [] : validation.errors };
}

/**
 * Read a JSON model from a file instead of requiring it inline.
 *
 * A model is the largest argument any of these tools takes, and it is the one that arrives as
 * streamed tool-call JSON: the provider rejected one session with `tool input is invalid JSON`
 * after the model spent sixteen steps hand-editing a nested model argument. Reading it from the
 * workspace removes that failure mode and the tokens.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OptionShapeError } from './option-shape.js';
/** Read and parse one JSON file. Formatting is irrelevant: whitespace, BOM and pretty printing all parse. */
export function readJsonFile(path, option, code) {
    if (typeof path !== 'string' || path.trim() === '') {
        throw new OptionShapeError(code, `${option} must be a non-empty path to a JSON file.`);
    }
    const full = resolve(path);
    let text;
    try {
        text = readFileSync(full, 'utf8');
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new OptionShapeError(code, `${option} could not be read: ${reason}. The path resolves against the process working directory; relative paths in a session resolve against the session's workspace.`);
    }
    try {
        return JSON.parse(text.replace(/^\uFEFF/, ''));
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new OptionShapeError(code, `${option} is not valid JSON: ${reason}.`);
    }
}
/**
 * Exactly one of the inline value and the file path. Both is ambiguous, neither is a missing
 * argument, and each gets its own sentence so the caller knows which one to drop.
 */
export function oneOf(value, path, inlineName, pathName, code) {
    const hasValue = value !== undefined;
    const hasPath = path !== undefined;
    if (hasValue && hasPath) {
        throw new OptionShapeError(code, `Pass either ${inlineName} or ${pathName}, not both: the file would be read and then ignored, or the other way round.`);
    }
    if (!hasValue && !hasPath) {
        throw new OptionShapeError(code, `Pass ${inlineName} or ${pathName}: the model has to come from somewhere.`);
    }
    return hasPath ? readJsonFile(path, pathName, code) : value;
}

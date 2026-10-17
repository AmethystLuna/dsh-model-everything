/**
 * Option shapes at the tool boundary.
 *
 * A tool declares `type: 'json'` for an option, which accepts any JSON value, and the engine then reads
 * it as the type it needs. A string where an array was expected threw `machinesInput.forEach is not a
 * function` and `(options.migrationMappings ?? []).map is not a function` - raw TypeErrors with no code,
 * which a caller cannot route on and which say nothing about which option was wrong.
 *
 * The suite pinned those as known gaps. This closes them the way the rest of the plugin reports a
 * refusal: a code naming the family, and a message naming the option.
 */
/** A refusal the caller can route on: the domain's code, and what arrived. */
export declare class OptionShapeError extends Error {
    readonly errorCode: string;
    constructor(errorCode: string, message: string);
}
/** An option the engine reads with `.map`: a string or a number is not one. */
export declare function requireArrayOption(value: unknown, option: string, errorCode: string): void;
/** An option the engine reads with `Object.entries`: a string has entries, and they are not the ones meant. */
export declare function requireObjectOption(value: unknown, option: string, errorCode: string): void;
/** The refusal a tool returns for a shape it could not read. */
export declare function optionRefusal(error: unknown, errorCode: string): Record<string, unknown>;

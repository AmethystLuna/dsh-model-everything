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
export class OptionShapeError extends Error {
  constructor(
    readonly errorCode: string,
    message: string,
  ) {
    super(message)
    this.name = 'OptionShapeError'
  }
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  return 'a ' + typeof value
}

/** An option the engine reads with `.map`: a string or a number is not one. */
export function requireArrayOption(value: unknown, option: string, errorCode: string): void {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    throw new OptionShapeError(errorCode, option + ' is ' + describe(value) + ', not an array. This option is read as a list; omit it, or pass the list the engine documents.')
  }
  // A null ENTRY fails later, deeper, with a message about a property of null. Naming the index here is the
  // difference between "something is wrong" and "entry 2 is wrong".
  const bad = value.findIndex((entry) => entry === null || typeof entry !== 'object' || Array.isArray(entry))
  if (bad >= 0) {
    throw new OptionShapeError(errorCode, option + '[' + String(bad) + '] is ' + describe(value[bad]) + ', not an object. Each entry is read as a mapping or a pair; a position cannot be omitted.')
  }
}

/** An option the engine reads with `Object.entries`: a string has entries, and they are not the ones meant. */
export function requireObjectOption(value: unknown, option: string, errorCode: string): void {
  if (value === undefined) return
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new OptionShapeError(errorCode, option + ' is ' + describe(value) + ', not an object. This option is read as a map from one name to another.')
  }
}

/** The refusal a tool returns for a shape it could not read. */
export function optionRefusal(error: unknown, errorCode: string): Record<string, unknown> {
  const message = error instanceof Error ? error.message : String(error)
  const code = error instanceof OptionShapeError ? error.errorCode : errorCode
  return {
    ok: false,
    ran: false,
    verdict: 'fail',
    verdictReason: 'the tool did not run: ' + message,
    errorCode: code,
    error: message,
  }
}

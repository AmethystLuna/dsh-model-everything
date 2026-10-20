/** Read and parse one JSON file. Formatting is irrelevant: whitespace, BOM and pretty printing all parse. */
export declare function readJsonFile(path: unknown, option: string, code: string): unknown;
/**
 * Exactly one of the inline value and the file path. Both is ambiguous, neither is a missing
 * argument, and each gets its own sentence so the caller knows which one to drop.
 */
export declare function oneOf(value: unknown, path: unknown, inlineName: string, pathName: string, code: string): unknown;

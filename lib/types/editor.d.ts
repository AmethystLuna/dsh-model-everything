type Json = Record<string, unknown>;
export interface EditOperation {
    op: string;
    [key: string]: unknown;
}
export interface ModelChange {
    kind: 'added' | 'removed' | 'updated';
    what: string;
    detail: string;
}
/** Read the model at `path`; a missing file is a refusal, not an empty model. */
export declare function readModelFile(path: unknown): {
    model: Json;
    full: string;
};
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
export declare function normalizeOperation(raw: unknown): EditOperation;
/** Apply one operation to a model copy, returning the changes it made. */
export declare function applyOperation(model: Json, operation: EditOperation): ModelChange[];
/** Validate the edited model and write it atomically. A refused edit leaves the file untouched. */
export interface EditOutcome {
    model: Json;
    changes: ModelChange[];
    full: string;
    /** Whether the model as written validates. False only when the caller allowed it. */
    valid: boolean;
    errors: string[];
}
export declare function applyEdits(path: unknown, operations: unknown, options?: {
    allowInvalid?: boolean;
}): EditOutcome;
export {};

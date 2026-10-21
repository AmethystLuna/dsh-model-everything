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
/** Apply one operation to a model copy, returning the changes it made. */
export declare function applyOperation(model: Json, operation: EditOperation): ModelChange[];
/** Validate the edited model and write it atomically. A refused edit leaves the file untouched. */
export declare function applyEdits(path: unknown, operations: unknown): {
    model: Json;
    changes: ModelChange[];
    full: string;
};
export {};

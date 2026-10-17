import { type LogicModelV1 } from './engine.js';
export type ExportFormat = 'uppaal' | 'tla' | 'prism' | 'spin';
export interface ExportResult {
    format: ExportFormat;
    primary: string;
    extras?: Record<string, string>;
    warnings: string[];
}
export interface ExportedModel {
    model: LogicModelV1;
    stateIds: string[];
    indexOf: Map<string, number>;
    initId: string;
    stateIdOf: Map<string, string>;
}
export declare function prepareModel(input: unknown): ExportedModel;
/**
 * Every format this exporter can produce, in one place.
 *
 * The absence of this list is what made an unknown format dangerous: the function ended with
 * `return exportSpin(ex)`, so `'mermaid'`, `42`, `''` and `undefined` all produced Promela and
 * reported `format: 'spin'`. A caller who named a notation this exporter cannot write received a
 * different notation's output and a report naming a format they had not asked for.
 */
export declare const EXPORT_FORMATS: readonly ExportFormat[];
export declare function isExportFormat(value: unknown): value is ExportFormat;
/**
 * A refusal an exporter knows by name.
 *
 * The tool mapped every throw onto `MODEL_INVALID`, so "this valid model is too large for the PRISM encoding" came
 * back as "your model is invalid" - a claim about the caller's work made by a limit of the exporter.
 */
export declare class ExportError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function exportModel(input: unknown, format: unknown): ExportResult;

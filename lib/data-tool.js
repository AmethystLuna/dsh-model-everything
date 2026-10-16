import { defineTool } from '@deepseek-ai/dsh-tools';
import { runDataVerification, DATA_ENGINE_SCHEMA_VERSION } from './data-engine.js';
import { renderReportText } from './report-view.js';
export const DATAMODEL_VERIFY_TOOL_NAME = 'model_datamodel_verify';
/**
 * Model-visible DSH tool wrapping the bundled data-model verification engine.
 * The model passes a DataModelV1 object; the engine validates it and returns
 * DS/DA/DD checks. Optional beforeModel/fieldMapping/copyPairs/migrationMappings
 * enable before/after data-model regression and migration coverage checks.
 */
export const modelDataModelVerifyTool = defineTool({
    name: DATAMODEL_VERIFY_TOOL_NAME,
    description: 'Verify a data model and its migrations: keys, domains, referential integrity, migration completeness and the before/after regression. Takes a DataModelV1 object with schemaVersion=1, entities ({name, fields, primaryKey?, uniqueKeys?, indexes?}), relationships?, invariants?, boundaryChecks?. Optional beforeModel/fieldMapping/copyPairs/migrationMappings/backupPairs enable migration coverage, copy consistency, rollback symmetry, and before/after data regression. Returns a report of finding codes with `verdict` and `verdictReason`. For a state machine or protocol use `model_verify`; for module or package dependencies use `uml_structure_verify`. See skills/model-everything-datamodel/references/data-model-schema.md.',
    parameters: {
        model: {
            type: 'json',
            required: true,
            description: 'DataModelV1 data model to verify.',
        },
        beforeModel: {
            type: 'json',
            description: 'Optional BEFORE DataModelV1 data model for regression comparison.',
        },
        fieldMapping: {
            type: 'json',
            description: 'Optional object mapping BEFORE "Entity.field" paths to AFTER "Entity.field" paths.',
        },
        copyPairs: {
            type: 'json',
            description: 'Optional copy pairs: { id, sourceEntity, targetEntity, mapping: {sourceField: targetField} }.',
        },
        migrationMappings: {
            type: 'json',
            description: 'Optional migration mappings: { from: "Entity.field", to: "Entity.field", transform?, note? }.',
        },
        backupPairs: {
            type: 'json',
            description: 'Optional backup/restore pairs for DA7 rollback symmetry.',
        },
        reportView: {
            type: 'string',
            enum: ['digest', 'full'],
            description: 'digest (default) prints the readable body; full prints the structured report, which report_diff needs.',
        },
    },
    output: {
        schema: {
            type: 'json',
            description: 'model-everything-datamodel verification report with summary and per-check findings.',
        },
        render(args, value) {
            return [{ type: 'text', text: renderReportText(value, { full: args.reportView === 'full' }) }];
        },
    },
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
        return runDataVerification(args.model, {
            beforeModel: args.beforeModel,
            fieldMapping: args.fieldMapping,
            copyPairs: args.copyPairs,
            migrationMappings: args.migrationMappings,
            backupPairs: args.backupPairs,
        });
    },
});
export { DATA_ENGINE_SCHEMA_VERSION };

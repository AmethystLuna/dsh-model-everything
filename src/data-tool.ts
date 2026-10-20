import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from './json-value.js'
import { runDataVerification, DATA_ENGINE_SCHEMA_VERSION } from './data-engine.js'
import { oneOf } from './model-file.js'
import { optionRefusal, requireArrayOption, requireObjectOption } from './option-shape.js'
import { renderReportText } from './report-view.js'

export const DATAMODEL_VERIFY_TOOL_NAME = 'model_datamodel_verify'

/**
 * Model-visible DSH tool wrapping the bundled data-model verification engine.
 * The model passes a DataModelV1 object; the engine validates it and returns
 * DS/DA/DD checks. Optional beforeModel/fieldMapping/copyPairs/migrationMappings
 * enable before/after data-model regression and migration coverage checks.
 */
export const modelDataModelVerifyTool = defineTool({
  name: DATAMODEL_VERIFY_TOOL_NAME,
  description:
    'Verify a data model and its migrations: keys, domains, referential integrity, migration completeness and the before/after regression. Takes a DataModelV1 object with schemaVersion=1, entities ({name, fields, primaryKey?, uniqueKeys?, indexes?}), relationships?, invariants?, boundaryChecks?. Optional beforeModel/fieldMapping/copyPairs/migrationMappings/backupPairs enable migration coverage, copy consistency, rollback symmetry, and before/after data regression. Returns a report of finding codes with `verdict` and `verdictReason`. For a state machine or protocol use `model_verify`; for module or package dependencies use `uml_structure_verify`. See skills/model-everything-datamodel/references/data-model-schema.md.',
  parameters: {
    model: {
      type: 'json',
      description: 'DataModelV1 data model to verify. Pass this, or modelPath, not both.',
    },
    modelPath: {
      type: 'string',
      description: 'Path to a JSON file holding the model, instead of inlining it. Formatting does not matter: whitespace, a BOM and pretty printing all parse. Relative paths resolve against the process working directory, which is the session workspace.',
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
    check: {
      type: 'string',
      description: 'Print one check in full when the digest truncated it. Pass the check id the CHECKS line lists (for example A9); the per-check budget no longer applies, and an id this report does not carry is answered with the ids that it does.',
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
      return [{ type: 'text' as const, text: renderReportText(value, { full: args.reportView === 'full', check: args.check }) }]
    },
  },
  timeoutMs: 10_000,
  isConcurrencySafe: () => true,
  async execute(args) {
    try {
      // The options are declared `json`, so the shape has to be checked here: the engine reads each one as
      // the list or map it needs, and a string arrived as a raw TypeError with no code and no option name.
      requireObjectOption(args.fieldMapping, 'fieldMapping', 'DATA_OPTION_INVALID')
      requireArrayOption(args.copyPairs, 'copyPairs', 'DATA_OPTION_INVALID')
      requireArrayOption(args.migrationMappings, 'migrationMappings', 'DATA_OPTION_INVALID')
      requireArrayOption(args.backupPairs, 'backupPairs', 'DATA_OPTION_INVALID')
      return runDataVerification(oneOf(args.model, args.modelPath, 'model', 'modelPath', 'DATA_OPTION_INVALID'), {
        beforeModel: args.beforeModel,
        fieldMapping: args.fieldMapping as Record<string, string> | undefined,
        copyPairs: args.copyPairs as Array<{ id: string; sourceEntity: string; targetEntity: string; mapping: Record<string, string> }> | undefined,
        migrationMappings: args.migrationMappings as Array<{ from: string; to: string; transform?: 'copy' | 'rename' | 'split' | 'merge' | 'drop' | 'manual'; note?: string }> | undefined,
        backupPairs: args.backupPairs as Array<{ id: string; sourceEntity: string; targetEntity: string; mapping: Record<string, string> }> | undefined,
      }) as unknown as JsonValue
    } catch (error) {
      return optionRefusal(error, 'DATA_OPTION_INVALID') as unknown as JsonValue
    }
  },
})

export { DATA_ENGINE_SCHEMA_VERSION }

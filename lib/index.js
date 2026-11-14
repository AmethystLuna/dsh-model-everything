/**
 * dsh-model-everything — DeepSeek Harness native plugin for models and diagrams.
 *
 * It ships a skill set (one entry skill plus a skill per domain) and the tools that do
 * the work: UML diagrams render, parse and review; state machines, protocols and composed
 * machines are checked by running them; data models and migrations are checked by the same
 * doctrine; concurrency claims are mined and routed; a verified model is exported to an
 * external checker; a structure diagram is audited as a dependency graph; two reports are
 * diffed against each other.
 *
 * Every tool carries its own description and every report says what it proves, so a model
 * reaches for one the way it reaches for any other tool: by reading what it says it does.
 * The plugin writes nothing into a session.
 *
 * The skills ship in this package's `skills/` directory and are registered at apply time
 * into dsh's `ctx.skills` registry through the standard filesystem provider, so they appear
 * in every session catalog without a manual copy step.
 *
 * Method, doctrine and per-domain detail live in the skills and their references, not here.
 *
 * @module dsh-model-everything
 */
import { fileURLToPath } from 'node:url';
import z from '@deepseek-ai/schemastery';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem';
import { modelVerifyTool } from './tool.js';
import { modelDataModelVerifyTool, DATA_ENGINE_SCHEMA_VERSION } from './data-tool.js';
import { modelConcurrencyScanTool } from './concurrency-tool.js';
import { modelComposeTool } from './compose-tool.js';
import { modelExportTool } from './export-tool.js';
import { umlRenderTool, umlParseTool, umlReviewTool, umlExplainLabelsTool } from './uml-tool.js';
import { umlStructureTool } from './structure-tool.js';
import { designTool } from './design-tool.js';
import { reportDiffTool } from './report-diff-tool.js';
import { modelEditTool } from './edit-tool.js';
import { modelAutomatonTool } from './automaton-tool.js';
import { ENGINE_SCHEMA_VERSION } from './engine.js';
// DSH 0.1.7-alpha.1 (session format v4) retires the shared
// `{ kind: 'plugin', plugin }` wrapper: native admission rejects it in every
// declared durable message slot, and the official v3-to-v4 migration rewrites
// those historical rows to `plugin:<name>`. Declaring the producer-owned kind
// here keeps the write path and the history guard on one identity, and still
// compiles against the earlier releases that only declare `plugin`.
export const name = 'dsh-model-everything';
// Skills are contributed through the registry service, which dsh-base always
// mounts before bundle rows such as this one apply.
export const inject = ['skills'];
// Absolute path of the package's shipped skills directory. `lib/index.js`
// lives one level below the package root, so `../skills` from the module URL
// lands on `<package>/skills` regardless of where the package was installed.
const SKILLS_DIR = fileURLToPath(new URL('../skills', import.meta.url));
export const Config = z.object({
    interaction: z.union(['ask', 'auto', 'follow-approval']).default('follow-approval'),
});
/**
 * Model-visible catalog entry (cordis_inspect_list / cordis_inspect_query):
 * lets the model read this plugin's runtime status without guessing. Mirrors
 * the registration pattern of the official dsh-tool-cordis host providers.
 */
function inspectProvider(config, isRegistered, missingTools) {
    return {
        manifest: {
            id: 'dsh-model-everything',
            description: 'Model and diagram tooling for DeepSeek Harness: UML diagrams (render, read, review), executable verification of state machines, protocols and composed machines, data-model and migration checks, concurrency claim routing, external-checker export, dependency-graph review, and report diffing. The tools carry their own descriptions; the skills carry the doctrine and the per-domain detail.',
            methods: [
                {
                    name: 'status',
                    description: 'Read this plugin status: whether it registers its tools, which tools are on, and the model schema versions the bundled engines accept.',
                    inputSchema: {
                        type: 'object',
                        properties: {},
                        additionalProperties: false,
                    },
                    outputSchema: {
                        type: 'object',
                        description: 'Plugin status: registration state and the schema versions the bundled engines accept.',
                        properties: {
                            interaction: { type: 'string', enum: ['ask', 'auto', 'follow-approval'], description: 'Configured interaction mode. follow-approval resolves per session from approval/policy.' },
                            toolRegistered: { type: 'boolean', description: 'Whether the model_verify tool is registered on ctx.tools.' },
                            dataToolRegistered: { type: 'boolean', description: 'Whether the model_datamodel_verify tool is registered on ctx.tools.' },
                            concurrencyToolRegistered: { type: 'boolean', description: 'Whether the model_interleaving_scan tool is registered on ctx.tools.' },
                            composeToolRegistered: { type: 'boolean', description: 'Whether the model_compose_verify tool is registered on ctx.tools.' },
                            exportToolRegistered: { type: 'boolean', description: 'Whether the model_export tool is registered on ctx.tools.' },
                            umlToolsRegistered: { type: 'boolean', description: 'Whether the four UML tools (uml_render, uml_parse, uml_review, uml_explain_labels) are registered on ctx.tools.' },
                            structureToolRegistered: { type: 'boolean', description: 'Whether the uml_structure_verify tool (structure-diagram / dependency review) is registered on ctx.tools.' },
                            reportDiffToolRegistered: { type: 'boolean', description: 'Whether the report_diff tool (baseline report comparison) is registered on ctx.tools.' },
                            designToolRegistered: { type: 'boolean', description: 'Whether the model_design_review tool is registered on ctx.tools.' },
                            editToolRegistered: { type: 'boolean', description: 'Whether the model_edit tool is registered on ctx.tools.' },
                            automatonToolRegistered: { type: 'boolean', description: 'Whether the model_automaton_verify tool is registered on ctx.tools.' },
                            missingTools: { type: 'array', items: { type: 'string' }, description: 'Each tool that did not register, with the reason: an empty list means every one landed.' },
                            engineSchemaVersion: { type: 'integer', description: 'Model schema version the bundled state-machine verification engine accepts.' },
                            dataEngineSchemaVersion: { type: 'integer', description: 'Model schema version the bundled data-model verification engine accepts.' },
                        },
                        additionalProperties: false,
                    },
                },
            ],
        },
        query: async (method) => {
            if (method === 'status') {
                return {
                    interaction: config.interaction,
                    // Each name is asked for on its own: a row that failed to register one tool reports that tool, not all of
                    // them. `umlToolsRegistered` is the group the status groups the four UML tools under.
                    toolRegistered: isRegistered('model_verify'),
                    dataToolRegistered: isRegistered('model_datamodel_verify'),
                    concurrencyToolRegistered: isRegistered('model_interleaving_scan'),
                    composeToolRegistered: isRegistered('model_compose_verify'),
                    exportToolRegistered: isRegistered('model_export'),
                    umlToolsRegistered: ['uml_render', 'uml_parse', 'uml_review', 'uml_explain_labels'].every(isRegistered),
                    structureToolRegistered: isRegistered('uml_structure_verify'),
                    reportDiffToolRegistered: isRegistered('report_diff'),
                    designToolRegistered: isRegistered('model_design_review'),
                    editToolRegistered: isRegistered('model_edit'),
                    automatonToolRegistered: isRegistered('model_automaton_verify'),
                    missingTools: missingTools(),
                    engineSchemaVersion: ENGINE_SCHEMA_VERSION,
                    dataEngineSchemaVersion: DATA_ENGINE_SCHEMA_VERSION,
                };
            }
            return null;
        },
    };
}
export function apply(ctx, config) {
    // Optional services are registered opportunistically; base-bundle rows can
    // mount after this row applies, so registration is retried on the first
    // agent/pre-step — by then the app is fully booted.
    let providerRegistered = false;
    // One entry per tool, filled as that tool registers. The eight booleans the status reports used to be written
    // together inside one `try`, so a failure on the last registration reported all eight false - a partial failure
    // read as "nothing is installed", which is the wrong thing to tell someone debugging a profile.
    const registered = new Map();
    const registerProvider = () => {
        if (providerRegistered)
            return;
        const inspect = ctx.get('cordisInspect');
        if (inspect === undefined)
            return;
        try {
            ctx.effect(() => inspect.register(inspectProvider(config, (name) => registered.get(name) === '', () => [...registered.entries()].filter(([, problem]) => problem !== '').map(([name, problem]) => name + ': ' + problem))), 'dsh-model-everything: inspect provider');
            providerRegistered = true;
        }
        catch (err) {
            console.warn('[dsh-model-everything] inspect provider registration failed', err);
        }
    };
    const registerTool = () => {
        const tools = ctx.get('tools');
        if (tools === undefined)
            return;
        /** Register one tool, and remember whether it landed and, when it did not, why. */
        const register = (name, tool) => {
            if (registered.has(name))
                return;
            try {
                ctx.effect(() => tools.register(tool), 'dsh-model-everything: ' + name);
                registered.set(name, '');
            }
            catch (error) {
                registered.set(name, error instanceof Error ? error.message : String(error));
                console.warn('[dsh-model-everything] ' + name + ' did not register', error);
            }
        };
        // One call per tool: a tool that fails leaves its own entry, and the eight the status reports follow from
        // these names rather than from a single flag written after the last registration.
        register('model_verify', modelVerifyTool);
        register('model_datamodel_verify', modelDataModelVerifyTool);
        register('model_interleaving_scan', modelConcurrencyScanTool);
        register('model_compose_verify', modelComposeTool);
        register('model_export', modelExportTool);
        register('uml_render', umlRenderTool);
        register('uml_parse', umlParseTool);
        register('uml_review', umlReviewTool);
        register('uml_explain_labels', umlExplainLabelsTool);
        register('uml_structure_verify', umlStructureTool);
        register('model_design_review', designTool);
        register('report_diff', reportDiffTool);
        register('model_edit', modelEditTool);
        register('model_automaton_verify', modelAutomatonTool);
    };
    const registerIntegrations = () => {
        registerProvider();
        registerTool();
    };
    registerIntegrations();
    // Ship the bundled skill through the registry: reuse the standard
    // filesystem provider over this package's own `skills/` directory, so
    // catalog discovery, frontmatter parsing, and SKILL.md loading behave
    // exactly like project/user skills while the plugin stays self-contained.
    // Registration lands in the global registry layer (this row mounts at the
    // profile root), so every agent preset sees the skill. `registerProvider`
    // returns the effect disposer; its teardown unregisters and invalidates.
    ctx.skills.registerProvider((control) => {
        return new FileSystemSkillProvider(ctx, control, {
            providerName: 'dsh-model-everything',
            includeDefaultRoots: false,
            customSkillDirs: [SKILLS_DIR],
        });
    });
    // Optional services register opportunistically and a base-bundle row can mount after
    // this one applies, so registration is retried on the first model step - the point by
    // which the app is fully booted. Nothing is appended to the step: the tools and the
    // skill text are the guide, not an injected reminder. Session-start routing, if a
    // deployment wants it, is the separate gate component in `gate.ts`, not this row.
    ctx.on('agent/pre-step', async (_payload, next) => {
        const decision = await next();
        registerIntegrations();
        return decision;
    });
}

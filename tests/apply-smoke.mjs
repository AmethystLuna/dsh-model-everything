import { Context } from '@deepseek-ai/cordis'
import { createVolatile, updateVolatile } from '@deepseek-ai/cosmokit'
import { Config } from '../lib/index.js'

const ctx = new Context()
/** Every tool the plugin registers, by name, so the entry can be compared with its modules. */
const registered = []
let promptContext
let inspectProvider
ctx.provide('skills', { registerProvider() { return () => {} } })
ctx.provide('tools', { register(definition) { registered.push(definition?.name); return () => {} } })
ctx.provide('systemPrompt', { context(contribution) { promptContext = contribution; return () => {} } })
ctx.provide('cordisInspect', { register(provider) { inspectProvider = provider; return () => {} } })

const mod = await import('../lib/index.js')
// Built through the real schema, as the Loader builds it: `enabled` is declared
// `.volatile()`, so `apply` receives a live reference, not a copied boolean.
const config = new Config({ enabled: true, interaction: 'follow-approval' })
if (typeof config.enabled?.get !== 'function') {
  throw new Error('enabled is not a volatile reference; the Plugins page switch would have no field to edit')
}
mod.apply(ctx, config)

// The registrations are compared with the tool modules themselves rather than with a number:
// a total written here goes stale the moment a tool is added, and the failure it produces says
// nothing about whether the registration was right.
const modules = {
  model_verify: (await import('../lib/tool.js')).modelVerifyTool,
  model_datamodel_verify: (await import('../lib/data-tool.js')).modelDataModelVerifyTool,
  model_concurrency_scan: (await import('../lib/concurrency-tool.js')).modelConcurrencyScanTool,
  model_compose_verify: (await import('../lib/compose-tool.js')).modelComposeTool,
  model_export: (await import('../lib/export-tool.js')).modelExportTool,
  uml_render: (await import('../lib/uml-tool.js')).umlRenderTool,
  uml_parse: (await import('../lib/uml-tool.js')).umlParseTool,
  uml_review: (await import('../lib/uml-tool.js')).umlReviewTool,
  uml_explain_labels: (await import('../lib/uml-tool.js')).umlExplainLabelsTool,
  uml_structure_verify: (await import('../lib/structure-tool.js')).umlStructureTool,
  model_design_review: (await import('../lib/design-tool.js')).designTool,
  report_diff: (await import('../lib/report-diff-tool.js')).reportDiffTool,
}
const expected = new Set(Object.values(modules).map((definition) => definition.name))
const missing = [...expected].filter((name) => !registered.includes(name))
const extra = registered.filter((name) => !expected.has(name))
if (missing.length > 0) throw new Error('the entry did not register: ' + missing.join(', '))
if (extra.length > 0) throw new Error('the entry registered something no module declares: ' + extra.join(', '))
if (new Set(registered).size !== registered.length) throw new Error('a tool was registered twice: ' + JSON.stringify(registered))
if (promptContext !== undefined) throw new Error('this plugin must not register a system-prompt context')

// No system-prompt context exists to read: the tools and the skill text are the guide.

const status = await inspectProvider.query('status')
if (status.toolRegistered !== true) throw new Error('inspect status toolRegistered should be true')
if (status.dataToolRegistered !== true) throw new Error('inspect status dataToolRegistered should be true')
if (status.concurrencyToolRegistered !== true) throw new Error('inspect status concurrencyToolRegistered should be true')
if (status.composeToolRegistered !== true) throw new Error('inspect status composeToolRegistered should be true')
if (status.exportToolRegistered !== true) throw new Error('inspect status exportToolRegistered should be true')
if (status.umlToolsRegistered !== true) throw new Error('inspect status umlToolsRegistered should be true')
if (status.engineSchemaVersion !== 1) throw new Error('inspect status engineSchemaVersion should be 1')
if (status.dataEngineSchemaVersion !== 1) throw new Error('inspect status dataEngineSchemaVersion should be 1')
if (status.interaction !== 'follow-approval') throw new Error('inspect status interaction mismatch')
if (status.enabled !== true) throw new Error('inspect status enabled should read the live switch')

// The Plugins page writes through the settings service, which updates the
// volatile reference in place. The plugin must observe the new value without
// being remounted, which is what makes the switch live inside a session.
const before = registered.length
updateVolatile(config.enabled, createVolatile(false))
const toggled = await inspectProvider.query('status')
if (toggled.enabled !== false) throw new Error('the live switch did not reach the plugin')
if (registered.length !== before) throw new Error('toggling the switch must not disturb the registered tools')

console.log('PASS apply smoke: tool and inspect registrations, and the live enable switch')

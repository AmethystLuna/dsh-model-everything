import { Context } from '@deepseek-ai/cordis'
import { createVolatile, updateVolatile } from '@deepseek-ai/cosmokit'
import { Config } from '../lib/index.js'

const ctx = new Context()
let toolsRegistered = 0
let promptContext
let inspectProvider
ctx.provide('skills', { registerProvider() { return () => {} } })
ctx.provide('tools', { register() { toolsRegistered += 1; return () => {} } })
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

if (toolsRegistered !== 11) throw new Error('expected eleven tool registrations, got ' + toolsRegistered)
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
updateVolatile(config.enabled, createVolatile(false))
const toggled = await inspectProvider.query('status')
if (toggled.enabled !== false) throw new Error('the live switch did not reach the plugin')
if (toolsRegistered !== 11) throw new Error('toggling the switch must not disturb the verification tools')

console.log('PASS apply smoke: tool and inspect registrations, and the live enable switch')

// White-box suite for the built Client bundle.
//
// The browser half cannot be exercised here, but everything that made it fail can: which file the package
// exports as `./client`, whether that file registers exactly one factory under the package name, and whether
// that factory yields a plugin that binds a view per tool. A registration-less bundle, or one that lives at
// a path the loader does not serve, fails boot with the single word `failed` and no detail - so the
// contract is pinned here instead of being rediscovered from a crash dialog.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const repo = fileURLToPath(new URL('../../', import.meta.url)).replaceAll('\\', '/').replace(/\/?$/, '/')
const manifest = JSON.parse(readFileSync(repo + 'package.json', 'utf8'))

let failures = 0
const test = (name, body) => {
  try {
    body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', String(error.message).slice(0, 240))
  }
}

/** Load the bundle the way the page does: a script whose only ambient name is `window`. */
function loadBundle() {
  const path = manifest.exports['./client']
  if (typeof path !== 'string') throw new Error('the package declares no ./client export')
  const code = readFileSync(repo + path.replace(/^\.\//, ''), 'utf8')
  const registrations = []
  const sandbox = { window: { __ModuleLoader__: { load: (registration) => registrations.push(registration) } } }
  vm.runInNewContext(code, sandbox, { filename: path })
  return { path, registrations }
}

const stubReact = {
  createElement: (type, props) => ({ type, props }),
}

test('the declared client export is the built bundle the loader can execute', () => {
  const path = manifest.exports['./client']
  if (path !== './lib/client.js') throw new Error('the client export moved: ' + String(path))
  const code = readFileSync(repo + 'lib/client.js', 'utf8')
  if (/^\s*(export|import)\s/m.test(code)) throw new Error('the bundle is an ES module, which the loader cannot execute as a factory')
  if (!code.includes('window.__ModuleLoader__.load(')) throw new Error('the bundle registers nothing')
})

test('the bundle registers exactly one factory under the package name', () => {
  const { registrations } = loadBundle()
  if (registrations.length !== 1) throw new Error(String(registrations.length) + ' registrations')
  if (registrations[0].id !== manifest.name) throw new Error('registered as ' + String(registrations[0].id))
  if (typeof registrations[0].factory !== 'function') throw new Error('no factory')
})

test('the factory returns a plugin that injects the slot service', () => {
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory((name) => {
    if (name === 'react') return stubReact
    throw new Error('unexpected require: ' + name)
  })
  if (plugin === null || typeof plugin !== 'object') throw new Error('the factory returned ' + String(plugin))
  if (!Array.isArray(plugin.inject) || !plugin.inject.includes('slots')) throw new Error('inject: ' + JSON.stringify(plugin.inject))
  if (typeof plugin.apply !== 'function') throw new Error('no apply')
})

test('apply binds one view per tool name, keyed by the wire name', () => {
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory(() => stubReact)
  const registered = []
  plugin.apply({
    slots: {
      inject: (slot, callback) => {
        if (slot !== 'tool.call.toolview') throw new Error('injected ' + slot)
        callback()
      },
      register: (options, component) => registered.push({ options, component }),
    },
  })
  if (registered.length === 0) throw new Error('no view registered')
  for (const entry of registered) {
    if (entry.options.name !== 'tool.call.toolview') throw new Error('wrong slot: ' + String(entry.options.name))
    if (entry.options.key !== 'model_verify') throw new Error('wrong key: ' + String(entry.options.key))
    if (entry.options.id !== undefined) throw new Error('a keyed slot declares only key; id would be ignored: ' + String(entry.options.id))
    if (typeof entry.component !== 'function') throw new Error('the view is not a component')
  }
})

test('the view renders the machine as an svg element', () => {
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory(() => stubReact)
  let component
  plugin.apply({
    slots: {
      inject: (_slot, callback) => callback(),
      register: (_options, view) => {
        component = view
      },
    },
  })
  const element = component({
    phase: 'result',
    toolName: 'model_verify',
    block: {
      args: { model: { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }] } },
      result: { verdict: 'fail', findings: [{ severity: 'error', code: 'S1', message: 'state "b" is a dead end' }] },
    },
  })
  if (element === null || typeof element !== 'object') throw new Error('the view returned nothing')
  if (element.type !== 'div') throw new Error('the view rendered ' + String(element.type))
  const html = element.props?.dangerouslySetInnerHTML?.__html
  if (typeof html !== 'string' || !html.startsWith('<svg')) throw new Error('the view rendered no svg')
  if (!html.includes('a') || !html.includes('go')) throw new Error('the svg is empty')
})

test('the view survives a call that has no result yet', () => {
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory(() => stubReact)
  let component
  plugin.apply({ slots: { inject: (_slot, cb) => cb(), register: (_options, view) => { component = view } } })
  for (const props of [{ phase: 'preparing' }, { phase: 'start', block: {} }, { phase: 'result', block: { args: { model: null } } }, {}]) {
    const element = component(props)
    if (element === null || typeof element !== 'object') throw new Error('no element for ' + JSON.stringify(props))
  }
})

if (failures > 0) {
  console.log('client tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all client tests passed')

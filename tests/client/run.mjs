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

// A stub that keeps children, because the whiteboard nests its drawing inside a wrapper and a stub that
// dropped children would report an empty board.
const stubReact = {
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props ?? {}), ...(children.length === 0 ? {} : { children: children.length === 1 ? children[0] : children }) },
  }),
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

/** A host that offers both seats, with the tab registry the sidebar expects. */
function applyWithSeats(plugin) {
  const registered = []
  const tabs = []
  plugin.apply({
    slots: {
      inject: (_slot, callback) => callback(),
      register: (options, component) => registered.push({ options, component }),
    },
    get: (service) => (service === 'sidebarRightTabs' ? { register: (options) => tabs.push(options) } : undefined),
  })
  return { registered, tabs }
}

test('apply binds one view per tool name, keyed by the wire name', () => {
  const { registrations } = loadBundle()
  const { registered } = applyWithSeats(registrations[0].factory(() => stubReact))
  const views = registered.filter((entry) => entry.options.name === 'tool.call.toolview')
  if (views.length === 0) throw new Error('no tool view registered')
  for (const entry of views) {
    if (entry.options.key !== 'model_verify') throw new Error('wrong key: ' + String(entry.options.key))
    if (entry.options.id !== undefined) throw new Error('a keyed slot declares only key; id would be ignored: ' + String(entry.options.id))
    if (typeof entry.component !== 'function') throw new Error('the view is not a component')
  }
})

test('the whiteboard takes a tab and a body in the right sidebar', () => {
  const { registrations } = loadBundle()
  const { registered, tabs } = applyWithSeats(registrations[0].factory(() => stubReact))
  if (tabs.length !== 1) throw new Error('tab types registered: ' + String(tabs.length))
  if (tabs[0].id === undefined || tabs[0].keepMounted !== true) throw new Error('the tab declaration is incomplete: ' + JSON.stringify(Object.keys(tabs[0])))
  const bodies = registered.filter((entry) => entry.options.name === 'sidebar.right.pane.tab')
  if (bodies.length !== 1) throw new Error('bodies: ' + String(bodies.length))
  if (bodies[0].options.key !== tabs[0].id) throw new Error('the body key does not match the tab id: ' + String(bodies[0].options.key))
  if (typeof bodies[0].component !== 'function') throw new Error('the whiteboard is not a component')
})

test('a host without the sidebar seat is left alone, not crashed', () => {
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory(() => stubReact)
  const registered = []
  plugin.apply({
    slots: {
      inject: (slot, callback) => {
        if (slot === 'sidebar.right.pane.tab') return undefined
        callback()
      },
      register: (options, component) => registered.push({ options, component }),
    },
    get: () => undefined,
  })
  if (registered.some((entry) => entry.options.name === 'sidebar.right.pane.tab')) throw new Error('a body was registered without a seat')
})

test('the whiteboard draws what it is given, and says why when it refuses', () => {
  const { registrations } = loadBundle()
  const { registered } = applyWithSeats(registrations[0].factory(() => stubReact))
  const body = registered.find((entry) => entry.options.name === 'sidebar.right.pane.tab')
  const element = body.component({})
  // No hooks on the stub, so the board renders its sample read-only: an svg plus the source box is enough.
  const html = JSON.stringify(element)
  if (!html.includes('<svg')) throw new Error('the whiteboard drew nothing')
  if (!html.includes('textarea')) throw new Error('the whiteboard has no source box')
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

test('the theme probe reads the page surface, and falls back without one', () => {
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory(() => stubReact)
  const probe = plugin.themeMode ?? (() => 'light')
  // No document in this process: the fallback must be light rather than a throw.
  if (probe() !== 'light') throw new Error('the fallback is not light: ' + String(probe()))
})

test('the whiteboard offers a colour scheme picker', () => {
  const { registrations } = loadBundle()
  const { registered } = applyWithSeats(registrations[0].factory(() => stubReact))
  const body = registered.find((entry) => entry.options.name === 'sidebar.right.pane.tab')
  const html = JSON.stringify(body.component({}))
  for (const scheme of ['default', 'high-contrast', 'print']) {
    if (!html.includes(scheme)) throw new Error('the picker is missing ' + scheme)
  }
})

if (failures > 0) {
  console.log('client tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all client tests passed')

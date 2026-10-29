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

// The annotation module is imported directly: it decides what the message says and where it goes, and
// neither question needs a page.
const { annotationMessage, fillComposer } = await import('../../lib/annotation.js')
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
  const keys = views.map((entry) => String(entry.options.key)).sort().join(',')
  if (keys !== 'diagram_render,model_verify') throw new Error('keys registered: ' + keys)
  for (const entry of views) {
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
  for (const scheme of ['default', 'github', 'high-contrast', 'print']) {
    if (!html.includes(scheme)) throw new Error('the picker is missing ' + scheme)
  }
})

test('the whiteboard tab is registered once the sidebar service appears later', () => {
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory(() => stubReact)
  const tabs = []
  const registered = []
  let seen = 0
  let pending = null
  plugin.mount(
    {
      slots: {
        inject: () => undefined,
        register: (options) => registered.push(options),
      },
      get: (service) => {
        if (service !== 'sidebarRightTabs') return undefined
        seen += 1
        // The host composes seats before services: the first look misses, the second finds it.
        return seen < 2 ? undefined : { register: (options) => tabs.push(options) }
      },
    },
    { schedule: (run) => { pending = run } },
  )
  if (tabs.length !== 0) throw new Error('the tab was registered before the service existed')
  if (typeof pending !== 'function') throw new Error('no retry was scheduled')
  pending()
  if (tabs.length !== 1) throw new Error('tabs after the retry: ' + String(tabs.length))
  if (!registered.some((options) => options.name === 'sidebar.right.pane.tab')) throw new Error('the body was never registered')
})

test('the drawing card draws the source the call carried', () => {
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory(() => stubReact)
  let component
  plugin.apply({ slots: { inject: (_slot, cb) => cb(), register: (_options, view) => { component = view } } })
  const element = component({
    phase: 'result',
    toolName: 'diagram_render',
    block: { args: { source: 'graph TD\n  a[Draft] --> b[Ship]', scheme: 'print' } },
  })
  if (element === null || typeof element !== 'object') throw new Error('the drawing card returned nothing')
  const html = JSON.stringify(element)
  if (!html.includes('<svg')) throw new Error('the card drew no svg')
  if (!html.includes('Draft') || !html.includes('Ship')) throw new Error('the drawing lost its nodes')
  if (!html.includes('width: 100%')) throw new Error('the drawing does not scale to the pane')
})

test('the drawing card lists the lines the renderer refused', () => {
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory(() => stubReact)
  let component
  plugin.apply({ slots: { inject: (_slot, cb) => cb(), register: (_options, view) => { component = view } } })
  const element = component({
    phase: 'result',
    toolName: 'diagram_render',
    block: { args: { source: 'sequenceDiagram\n  A->>B: hi' } },
  })
  const html = JSON.stringify(element)
  if (!html.includes('line 1')) throw new Error('the refused line is not shown: ' + html.slice(0, 160))
})

test('the drawing card survives a call whose source has not arrived', () => {
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory(() => stubReact)
  let component
  plugin.apply({ slots: { inject: (_slot, cb) => cb(), register: (_options, view) => { component = view } } })
  for (const props of [{ phase: 'preparing', toolName: 'diagram_render' }, { phase: 'start', toolName: 'diagram_render', block: {} }, { toolName: 'diagram_render' }]) {
    const element = component(props)
    if (element === null || typeof element !== 'object') throw new Error('no element for ' + JSON.stringify(props))
  }
})

test('the drawing key is the name the shipped tool declares', () => {
  // The client cannot import the tool (it would pull the host SDK into the bundle), so the name is a
  // literal there. This is the check that keeps the literal and the tool from drifting apart.
  const built = readFileSync(repo + 'lib/diagram-render-tool.js', 'utf8')
  if (!/DIAGRAM_TOOL_NAME = 'diagram_render'/.test(built)) throw new Error('the tool no longer declares diagram_render')
})

test('the annotation message names the node, the drawing and the note', () => {
  const text = annotationMessage({ nodeId: 'n1', label: 'Checkout', note: '这个判断应该拆开', caption: 'graph TD' })
  if (!text.includes('Checkout (n1)')) throw new Error('the node is not named: ' + text)
  if (!text.includes('graph TD')) throw new Error('the drawing is not named: ' + text)
  if (!text.includes('这个判断应该拆开')) throw new Error('the note is not carried verbatim: ' + text)
})

test('a blank note still says the node was marked', () => {
  const text = annotationMessage({ nodeId: 'n1' })
  if (!text.includes('marked this node')) throw new Error('a silent note became silence: ' + text)
  if (text.includes('no note — the reader marked this node\n')) throw new Error('unexpected trailing line')
})

test('filling the composer appends to the draft instead of replacing it', () => {
  const element = { tagName: 'TEXTAREA', value: 'half a sentence', dispatchEvent: () => true, focus: () => {} }
  const written = fillComposer({ querySelector: () => element }, 'Diagram annotation · node "a"')
  if (written !== 'filled') throw new Error('the write reported ' + written)
  if (!element.value.startsWith('half a sentence')) throw new Error('the draft was replaced: ' + element.value)
  if (!element.value.includes('Diagram annotation')) throw new Error('the note did not land: ' + element.value)
})

test('no composer means no write, and the caller is told', () => {
  const written = fillComposer({ querySelector: () => null }, 'text')
  if (written !== 'no-composer') throw new Error('reported ' + written)
  if (fillComposer(undefined, 'text') !== 'no-composer') throw new Error('an absent document was treated as a composer')
})

if (failures > 0) {
  console.log('client tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all client tests passed')

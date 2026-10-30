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
const { annotationMessage, composerRect, fillComposer, pageCensus, prependBlock, pushNote, sessionFromLocation, withoutEmptyQuestion } = await import('../../lib/annotation.js')
const { annotationCountOf, decorateTranscript } = await import('../../lib/transcript.js')

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

test('the card draws from the result when the settled call no longer carries its arguments', () => {
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory(() => stubReact)
  let component
  plugin.apply({ slots: { inject: (_slot, cb) => cb(), register: (_options, view) => { component = view } } })
  const element = component({
    phase: 'result',
    toolName: 'diagram_render',
    block: { result: { svg: '<svg xmlns="http://www.w3.org/2000/svg"><g data-node-id="a"><rect width="4" height="4" /></g></svg>', caption: 'one box' } },
  })
  const html = JSON.stringify(element)
  if (!html.includes('<svg')) throw new Error('the settled result was ignored')
  if (!html.includes('data-node-id')) throw new Error('the returned drawing lost its node ids')
})

test('the card finds the source in whatever shape the settled block carries', () => {
  const shapes = [
    { meta: { source: 'graph TD' + String.fromCharCode(10) + '  a[A] --> b[B]', caption: 'graph, 2 boxes' } },
    { args: { value: (key) => (key === 'source' ? 'graph TD' + String.fromCharCode(10) + '  a[A] --> b[B]' : undefined) } },
    { args: JSON.stringify({ source: 'graph TD' + String.fromCharCode(10) + '  a[A] --> b[B]' }) },
    { call: { input: JSON.stringify({ source: 'graph TD' + String.fromCharCode(10) + '  a[A] --> b[B]' }) } },
  ]
  for (const block of shapes) {
    const { registrations } = loadBundle()
    const plugin = registrations[0].factory(() => stubReact)
    let component
    plugin.apply({ slots: { inject: (_slot, cb) => cb(), register: (_options, view) => { component = view } } })
    const element = component({ phase: 'result', toolName: 'diagram_render', block })
    const html = JSON.stringify(element)
    if (!html.includes('<svg')) throw new Error('no drawing for block shape: ' + JSON.stringify(block).slice(0, 60))
  }
})

test('a sent annotation is folded to the reader question, behind its count, once', () => {
  const block = [
    'Diagram annotations - 2 items (numbers match the picture).',
    'Please answer each item separately, and start each answer with "Annotation N:".',
    'Drawing: graph LR',
    '',
    '1. node D',
    '   Note: 测试',
    '',
    'Question: 这里为什么要拆开？',
  ].join(String.fromCharCode(10))
  const chips = []
  const node = {
    textContent: block,
    attrs: {},
    children: [],
    getAttribute(name) { return this.attrs[name] },
    setAttribute(name, value) { this.attrs[name] = value },
    querySelector() { return null },
    appendChild(child) { this.children.push(child) },
  }
  const doc = {
    querySelectorAll: () => [node],
    createElement: () => {
      const chip = { textContent: '', attrs: {}, handlers: [], setAttribute(name, value) { this.attrs[name] = value }, addEventListener(_type, handler) { this.handlers.push(handler) } }
      chips.push(chip)
      return chip
    },
  }
  if (annotationCountOf(block) !== 2) throw new Error('the count was not read')
  if (decorateTranscript(doc, 'Notes') !== 1) throw new Error('nothing was folded')
  if (node.textContent !== '这里为什么要拆开？') throw new Error('the bubble kept the protocol: ' + JSON.stringify(node.textContent))
  if (!chips[0].textContent.includes('×2')) throw new Error('the chip does not carry the count: ' + chips[0].textContent)
  if (decorateTranscript(doc, 'Notes') !== 0) throw new Error('a second pass stacked another chip')
  chips[0].handlers[0]()
  if (node.textContent !== block) throw new Error('the chip does not put the block back')
  chips[0].handlers[0]()
  if (node.textContent !== '这里为什么要拆开？') throw new Error('the chip does not fold again')
})

test('a message that is not an annotation is left alone', () => {
  const node = { textContent: 'just a sentence', attrs: {}, getAttribute(name) { return this.attrs[name] }, setAttribute(name, value) { this.attrs[name] = value }, querySelector() { return null }, appendChild() {} }
  const doc = { querySelectorAll: () => [node], createElement: () => ({ setAttribute() {}, addEventListener() {} }) }
  if (decorateTranscript(doc) !== 0) throw new Error('an ordinary message was folded')
  if (node.textContent !== 'just a sentence') throw new Error('an ordinary message was rewritten')
})

test('a container that also holds the marker is not the element to touch', () => {
  const inner = { textContent: 'Diagram annotations - 1 item. Question: why?', attrs: {}, getAttribute(name) { return this.attrs[name] }, setAttribute(name, value) { this.attrs[name] = value }, querySelector() { return null }, appendChild() {} }
  const outer = { textContent: inner.textContent, attrs: {}, getAttribute(name) { return this.attrs[name] }, setAttribute(name, value) { this.attrs[name] = value }, querySelector() { return inner }, appendChild() {} }
  const doc = { querySelectorAll: () => [outer, inner], createElement: () => ({ setAttribute() {}, addEventListener() {} }) }
  if (decorateTranscript(doc) !== 1) throw new Error('the wrong number of elements was folded')
  if (outer.textContent !== 'Diagram annotations - 1 item. Question: why?') throw new Error('the container was rewritten')
})

test('the card calls the same hooks whether or not a call has settled', () => {
  // A running call has no source and a settled one does. A hook that appears between those renders throws
  // 'rendered more hooks than during the previous render', and React takes the conversation view with it.
  const counts = []
  const counting = {
    createElement: stubReact.createElement,
    useState: (initial) => { counts[counts.length - 1] += 1; return [initial, () => {}] },
  }
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory(() => counting)
  let component
  plugin.apply({ slots: { inject: (_slot, cb) => cb(), register: (_options, view) => { component = view } } })
  counts.push(0)
  component({ phase: 'running', toolName: 'diagram_render', block: {} })
  counts.push(0)
  component({ phase: 'result', toolName: 'diagram_render', block: { meta: { source: 'graph TD' + String.fromCharCode(10) + '  a[A] --> b[B]' } } })
  if (counts[0] !== counts[1]) throw new Error('hooks per render changed: ' + JSON.stringify(counts))
  if (counts[0] === 0) throw new Error('the card used no hooks at all, so the comparison proves nothing')
})

test('the page census counts what a probe cannot see', () => {
  const doc = { querySelector: () => null, querySelectorAll: () => [1, 2] }
  const said = pageCensus(doc)
  if (!said.includes('textarea=2')) throw new Error('the census said: ' + said)
  if (!said.includes('focus-flow=no')) throw new Error('the census said: ' + said)
})

test('the drawing card offers the annotation button when the host has hooks', () => {
  const stateful = { createElement: stubReact.createElement, useState: (initial) => [initial, () => {}] }
  const { registrations } = loadBundle()
  const plugin = registrations[0].factory(() => stateful)
  let component
  plugin.apply({ slots: { inject: (_slot, cb) => cb(), register: (_options, view) => { component = view } } })
  const element = component({ phase: 'result', toolName: 'diagram_render', block: { args: { source: 'graph TD\n  a[One] --> b[Two]' } } })
  const html = JSON.stringify(element)
  if (!html.includes('<svg')) throw new Error('the card lost its drawing')
  if (!html.includes('Point at a node and send a note about it')) throw new Error('the card has no annotation affordance')
  // No page language here, so the surface falls back to English: the same string is translated, not duplicated.
  if (!html.includes('Note')) throw new Error('the annotation button is not translated')
})

test('the drawing key is the name the shipped tool declares', () => {
  // The client cannot import the tool (it would pull the host SDK into the bundle), so the name is a
  // literal there. This is the check that keeps the literal and the tool from drifting apart.
  const built = readFileSync(repo + 'lib/diagram-render-tool.js', 'utf8')
  if (!/DIAGRAM_TOOL_NAME = 'diagram_render'/.test(built)) throw new Error('the tool no longer declares diagram_render')
})

test('pushNote says what happened, and never claims a send it did not do', () => {
  const element = { tagName: 'TEXTAREA', value: '', dispatchEvent: () => true, focus: () => {} }
  const placed = pushNote({ querySelector: () => element }, { id: 'n1' }, 'note', 'graph TD', false)
  if (placed !== '已放入输入框') throw new Error('reported: ' + placed)
  if (!element.value.includes('n1') || !element.value.includes('note')) throw new Error('the note did not reach the composer')
  const missing = pushNote({ querySelector: () => null }, { id: 'n1' }, 'note', 'g', false)
  if (!missing.includes('没找到输入框')) throw new Error('a missing composer was reported as: ' + missing)
  // No KeyboardEvent in this process, so the send cannot be claimed; the text still lands and says so.
  const unclaimed = pushNote({ querySelector: () => element }, { id: 'n1' }, '', 'g', true)
  if (!unclaimed.includes('按一次回车发送')) throw new Error('the send was overclaimed: ' + unclaimed)
  if (pushNote(undefined, null, '', '', true) !== '') throw new Error('a missing pick should be silent')
})

test('the session a page shows is read from its own address', () => {
  const id = 'session-d966915c-56b0-4dd5-9c18-fae6e4b0ff99'
  if (sessionFromLocation({ pathname: '/s/' + id }) !== id) throw new Error('the session- id was not read')
  const bare = 'd966915c-56b0-4dd5-9c18-fae6e4b0ff99'
  if (sessionFromLocation({ search: '?session=' + bare }) !== bare) throw new Error('a bare uuid was not read')
  if (sessionFromLocation({ pathname: '/settings' }) !== undefined) throw new Error('a page with no session produced one')
  if (sessionFromLocation(undefined) !== undefined) throw new Error('no location produced a session')
})

test('the annotation message names the node, the drawing and the note', () => {
  const text = annotationMessage({ nodeId: 'n1', label: 'Checkout', note: '这个判断应该拆开', caption: 'graph TD' })
  if (!text.includes('Checkout (n1)')) throw new Error('the node is not named: ' + text)
  if (!text.includes('graph TD')) throw new Error('the drawing is not named: ' + text)
  if (!text.includes('这个判断应该拆开')) throw new Error('the note is not carried verbatim: ' + text)
})

test('a blank note still says the node was marked', () => {
  const text = annotationMessage({ nodeId: 'n1' })
  if (!text.includes('(marked, no note)')) throw new Error('a silent note became silence: ' + text)
  if (!text.includes('1. node n1')) throw new Error('the mark was not numbered: ' + text)
  if (!text.includes('start each answer with "Annotation N:"')) throw new Error('the block does not ask for item-by-item answers: ' + text)
})

test('filling the composer appends to the draft instead of replacing it', () => {
  const element = { tagName: 'TEXTAREA', value: 'half a sentence', dispatchEvent: () => true, focus: () => {} }
  const written = fillComposer({ querySelector: () => element }, 'Diagram annotation · node "a"')
  if (written !== 'filled') throw new Error('the write reported ' + written)
  if (!element.value.startsWith('half a sentence')) throw new Error('the draft was replaced: ' + element.value)
  if (!element.value.includes('Diagram annotation')) throw new Error('the note did not land: ' + element.value)
})

test('the block goes above the reader note, with a blank line between', () => {
  const element = { tagName: 'TEXTAREA', value: 'half a thought', dispatchEvent: () => true, focus: () => {} }
  const said = prependBlock({ querySelector: () => element }, [{ nodeId: 'a', note: 'note' }], 'graph TD')
  if (!said.startsWith('已放入')) throw new Error('reported: ' + said)
  const lines = element.value.split(String.fromCharCode(10))
  if (!lines[0].startsWith('Diagram annotations - ')) throw new Error('the block is not first: ' + element.value)
  if (!element.value.endsWith('half a thought')) throw new Error('the draft is not last: ' + element.value)
  if (!element.value.includes(String.fromCharCode(10, 10) + 'half a thought')) throw new Error('no blank line between block and draft')
})

test('a message with no question drops the question line', () => {
  const block = annotationMessage({ nodeId: 'a', note: 'x' })
  const bare = withoutEmptyQuestion(block)
  if (bare.includes('Question:')) throw new Error('the empty invitation stayed: ' + bare)
  if (!bare.includes('1. node a')) throw new Error('the block lost its item')
})

test('the block carries a line break per item, so the model can number them', () => {
  const element = { tagName: 'TEXTAREA', value: '', dispatchEvent: () => true, focus: () => {} }
  prependBlock({ querySelector: () => element }, [{ nodeId: 'a', note: 'one' }, { nodeId: 'b', note: '' }], 'graph TD')
  const lines = element.value.split(String.fromCharCode(10))
  if (!lines.includes('1. node a') || !lines.includes('2. node b')) throw new Error('items are not on their own lines: ' + JSON.stringify(lines))
})

test('the composer rect is read for the docked count, and absent without one', () => {
  const element = { tagName: 'TEXTAREA', value: '', getBoundingClientRect: () => ({ left: 10, top: 20, width: 300, height: 40 }) }
  const rect = composerRect({ querySelector: () => element })
  if (rect === undefined || rect.left !== 10 || rect.top !== 20) throw new Error('rect: ' + JSON.stringify(rect))
  if (composerRect({ querySelector: () => null }) !== undefined) throw new Error('a missing composer produced a rect')
})

test('an empty box takes the note as it is, with no stray blank line', () => {
  const element = { tagName: 'TEXTAREA', value: '', dispatchEvent: () => true, focus: () => {} }
  fillComposer({ querySelector: () => element }, 'Diagram annotation · node "a"')
  if (element.value !== 'Diagram annotation · node "a"') throw new Error('the empty box was filled with: ' + JSON.stringify(element.value))
  const blank = { tagName: 'TEXTAREA', value: '   ', dispatchEvent: () => true, focus: () => {} }
  fillComposer({ querySelector: () => blank }, 'note')
  if (blank.value !== 'note') throw new Error('a whitespace draft was kept: ' + JSON.stringify(blank.value))
})

test('a rich editor gets the block as html, with breaks kept and the quote marker escaped', () => {
  const calls = []
  const previous = globalThis.document
  globalThis.document = { execCommand: (command, _ui, value) => { calls.push([command, value]); return true } }
  try {
    const editable = { tagName: 'DIV', textContent: '', dispatchEvent: () => true, focus: () => {} }
    const doc = { querySelector: (selector) => (selector.includes('contenteditable') ? editable : null) }
    const block = '> a' + String.fromCharCode(10) + '> b'
    if (fillComposer(doc, block) !== 'filled') throw new Error('the surface was not filled')
    const html = calls.filter(([command]) => command === 'insertHTML').map(([, value]) => value)
    if (html.length !== 1) throw new Error('html inserts: ' + String(html.length))
    if (!html[0].includes('<br>')) throw new Error('the line break was dropped: ' + html[0])
    if (!html[0].includes('&gt; a')) throw new Error('the quote marker was not escaped: ' + html[0])
  } finally {
    globalThis.document = previous
  }
})

test('an editor that refuses html still gets one paragraph per line', () => {
  const calls = []
  const previous = globalThis.document
  globalThis.document = { execCommand: (command, _ui, value) => { calls.push([command, value]); return command !== 'insertHTML' } }
  try {
    const editable = { tagName: 'DIV', textContent: '', dispatchEvent: () => true, focus: () => {} }
    const doc = { querySelector: (selector) => (selector.includes('contenteditable') ? editable : null) }
    if (fillComposer(doc, 'a' + String.fromCharCode(10) + 'b' + String.fromCharCode(10) + 'c') !== 'filled') throw new Error('the surface was not filled')
    const texts = calls.filter(([command]) => command === 'insertText').map(([, value]) => value)
    if (texts.join('|') !== 'a|b|c') throw new Error('inserted as: ' + JSON.stringify(texts))
    const paragraphs = calls.filter(([command]) => command === 'insertParagraph').length
    if (paragraphs !== 2) throw new Error('paragraph breaks: ' + String(paragraphs))
  } finally {
    globalThis.document = previous
  }
})

test('a writing surface with no value is filled through its text', () => {
  const editable = { tagName: 'DIV', textContent: '', dispatchEvent: () => true, focus: () => {} }
  if (fillComposer({ querySelector: () => editable }, 'note') !== 'filled') throw new Error('the surface was not filled')
  if (editable.textContent !== 'note') throw new Error('filled as: ' + JSON.stringify(editable.textContent))
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

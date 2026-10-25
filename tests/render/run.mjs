// White-box suite for the renderer's pure half.
//
// Everything a drawing decides is decided here, in Node, with no browser: which nodes exist, what row each
// sits in, what shape is emitted, and what the markup says. The React shell is not covered by path here -
// it holds no decisions - and that is the point of the split: the code these cases exercise is the code the
// page runs, because both are built from these modules.
import { palette, roleForVerdict } from '../../lib/render/palette.js'
import { rankStates } from '../../lib/render/layout.js'
import { paint, paintWith } from '../../lib/render/paint.js'
import { toSvg } from '../../lib/render/svg.js'
import { viewModel } from '../../lib/render/viewmodel.js'

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

const NL = String.fromCharCode(10)
const machine = {
  schemaVersion: 1,
  init: 'idle',
  states: [{ id: 'idle' }, { id: 'busy' }, { id: 'done' }],
  transitions: [
    { from: 'idle', event: 'start', to: 'busy' },
    { from: 'busy', event: 'finish', to: 'done' },
  ],
}
const view = (overrides = {}) => viewModel({ phase: 'result', toolName: 'model_verify', args: { model: machine }, result: { verdict: 'pass' }, ...overrides })

// ------------------------------------------------------------------------------------------------ palette

test('every verdict earns its own role', () => {
  const seen = new Map([
    ['pass', 'pass'],
    ['pass_with_findings', 'findings'],
    ['fail', 'fail'],
    [undefined, 'undecided'],
    ['something-else', 'undecided'],
  ])
  for (const [verdict, expected] of seen) {
    const role = roleForVerdict(verdict)
    if (role !== expected) throw new Error(String(verdict) + ' -> ' + role + ', expected ' + expected)
  }
})

test('an override replaces one role and leaves the rest', () => {
  const colours = palette({ fail: '#000000' })
  if (colours.fail !== '#000000') throw new Error('the override did not apply')
  if (colours.pass === undefined || colours.pass === '#000000') throw new Error('the override leaked into another role')
})

// ----------------------------------------------------------------------------------------------- viewmodel

test('a call with no model draws nothing but still carries the verdict', () => {
  const diagram = viewModel({ phase: 'result', toolName: 'model_verify', args: {}, result: { verdict: 'fail', findings: [{ severity: 'error', code: 'S1', message: 'deadlock' }] } })
  if (diagram.kind !== 'none') throw new Error('a model-less call drew a machine')
  if (!diagram.caption.startsWith('fail — S1: deadlock')) throw new Error('caption: ' + diagram.caption)
  if (diagram.nodes.length !== 0) throw new Error('nodes appeared from nowhere')
})

test('the caption falls back from a finding to a count to a verdict to nothing', () => {
  const counted = viewModel({ toolName: 't', args: {}, result: { verdict: 'pass', summary: { errors: 0 } } })
  if (counted.caption !== 'pass — 0 error(s)') throw new Error('count caption: ' + counted.caption)
  const bare = viewModel({ toolName: 't', args: {}, result: { verdict: 'pass' } })
  if (bare.caption !== 'pass') throw new Error('bare caption: ' + bare.caption)
  const none = viewModel({ toolName: 't' })
  if (none.caption !== 'no report yet') throw new Error('missing caption: ' + none.caption)
})

test('a machine becomes nodes and labelled edges', () => {
  const diagram = view()
  if (diagram.kind !== 'machine') throw new Error('kind: ' + diagram.kind)
  if (diagram.nodes.length !== 3) throw new Error('nodes: ' + String(diagram.nodes.length))
  if (diagram.edges.length !== 2) throw new Error('edges: ' + String(diagram.edges.length))
  const labels = diagram.edges.map((edge) => edge.label).join(',')
  if (labels !== 'start,finish') throw new Error('edge labels: ' + labels)
})

test('an edge without an event keeps an empty label rather than the word undefined', () => {
  const diagram = viewModel({ toolName: 't', args: { model: { init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', to: 'b' }] } } })
  if (diagram.edges[0].label !== '') throw new Error('label: ' + diagram.edges[0].label)
})

test('a malformed model is not a drawing', () => {
  const cases = [
    { model: null },
    { model: { states: 'not-an-array' } },
    { model: { states: [] } },
    { model: { states: [{ notAnId: 1 }] } },
  ]
  for (const args of cases) {
    const diagram = viewModel({ toolName: 't', args })
    if (diagram.kind !== 'none') throw new Error('drew from ' + JSON.stringify(args))
  }
})

test('a transition naming a state that does not exist is dropped, not drawn into nowhere', () => {
  const diagram = viewModel({ toolName: 't', args: { model: { init: 'a', states: [{ id: 'a' }], transitions: [{ from: 'a', event: 'go', to: 'ghost' }] } } })
  if (diagram.edges.length !== 1) throw new Error('the edge was dropped from the model, not from the drawing')
})

test('a finding that names a state marks that state, and only that state', () => {
  const diagram = viewModel({
    toolName: 'model_verify',
    args: { model: machine },
    result: { verdict: 'fail', findings: [{ severity: 'error', code: 'S3', message: 'state "busy" has no exit' }] },
  })
  const roles = new Map(diagram.nodes.map((node) => [node.id, node.role]))
  if (roles.get('busy') !== 'error') throw new Error('busy: ' + String(roles.get('busy')))
  if (roles.get('idle') !== 'normal') throw new Error('idle was marked: ' + String(roles.get('idle')))
})

test('without an error finding the blamed state is a warning', () => {
  const diagram = viewModel({
    toolName: 'model_verify',
    args: { model: machine },
    result: { verdict: 'pass_with_findings', findings: [{ severity: 'warning', code: 'A1', detail: 'state "done" is isolated' }] },
  })
  const role = diagram.nodes.find((node) => node.id === 'done')?.role
  if (role !== 'warning') throw new Error('done: ' + String(role))
})

test('a finding that names nothing leaves every state alone', () => {
  const diagram = viewModel({ toolName: 'model_verify', args: { model: machine }, result: { verdict: 'fail', findings: [{ severity: 'error', code: 'S1', message: 'a property failed' }] } })
  if (diagram.nodes.some((node) => node.role !== 'normal')) throw new Error('a state was marked without being named')
})

// -------------------------------------------------------------------------------------------------- layout

test('rows follow distance from the initial state', () => {
  const ranked = rankStates(view().nodes.map((node) => ({ id: node.id, role: 'normal' })), view().edges, 'idle')
  if (JSON.stringify(ranked.rows) !== JSON.stringify([['idle'], ['busy'], ['done']])) throw new Error('rows: ' + JSON.stringify(ranked.rows))
  if (ranked.unreachable.length !== 0) throw new Error('unreachable: ' + JSON.stringify(ranked.unreachable))
})

test('a state nothing reaches is listed apart, not merged into row zero', () => {
  const nodes = [{ id: 'a', role: 'normal' }, { id: 'island', role: 'normal' }]
  const ranked = rankStates(nodes, [], 'a')
  if (JSON.stringify(ranked.rows) !== JSON.stringify([['a']])) throw new Error('rows: ' + JSON.stringify(ranked.rows))
  if (JSON.stringify(ranked.unreachable) !== JSON.stringify(['island'])) throw new Error('unreachable: ' + JSON.stringify(ranked.unreachable))
})

test('an unknown initial state falls back to the first state', () => {
  const ranked = rankStates([{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }], [{ from: 'a', to: 'b', label: '' }], 'nope')
  if (JSON.stringify(ranked.rows) !== JSON.stringify([['a'], ['b']])) throw new Error('rows: ' + JSON.stringify(ranked.rows))
})

test('no states is no rows', () => {
  const ranked = rankStates([], [], undefined)
  if (ranked.rows.length !== 0 || ranked.unreachable.length !== 0) throw new Error('rows for an empty machine')
})

test('an edge to an unknown state does not create a row', () => {
  const ranked = rankStates([{ id: 'a', role: 'normal' }], [{ from: 'a', to: 'ghost', label: '' }], 'a')
  if (JSON.stringify(ranked.rows) !== JSON.stringify([['a']])) throw new Error('rows: ' + JSON.stringify(ranked.rows))
})

// --------------------------------------------------------------------------------------------------- paint

test('a machine is painted as boxes, links and a caption', () => {
  const { canvas, colours } = paintWith(view())
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  const links = canvas.shapes.filter((shape) => shape.kind === 'link')
  const captions = canvas.shapes.filter((shape) => shape.kind === 'caption')
  if (boxes.length !== 3) throw new Error('boxes: ' + String(boxes.length))
  if (links.length !== 2) throw new Error('links: ' + String(links.length))
  if (captions.length !== 1) throw new Error('captions: ' + String(captions.length))
  if (colours.pass === undefined) throw new Error('no palette returned')
  if (canvas.width < 360) throw new Error('width: ' + String(canvas.width))
  if (canvas.height <= 44) throw new Error('height: ' + String(canvas.height))
})

test('a link is painted only when both ends were placed', () => {
  const diagram = { kind: 'machine', title: 't', nodes: [{ id: 'a', role: 'normal' }], edges: [{ from: 'a', to: 'ghost', label: '' }], caption: 'pass' }
  const { canvas } = paintWith(diagram)
  if (canvas.shapes.some((shape) => shape.kind === 'link')) throw new Error('a dangling edge was painted')
})

test('the caption colour follows the verdict it quotes', () => {
  const fail = paintWith({ kind: 'none', title: 't', nodes: [], edges: [], caption: 'fail — S1: x' })
  const caption = fail.canvas.shapes.find((shape) => shape.kind === 'caption')
  if (fail.colours[caption.colour] !== fail.colours.fail) throw new Error('a failing caption is not the failing colour')
  const undecided = paintWith({ kind: 'none', title: 't', nodes: [], edges: [], caption: 'no report yet' })
  if (undecided.canvas.shapes.length !== 2) throw new Error('a caption-only canvas lost its title')
})

test('a marked state paints in the role that marked it', () => {
  const { canvas, colours } = paintWith({
    kind: 'machine',
    title: 't',
    nodes: [{ id: 'a', role: 'error' }, { id: 'b', role: 'warning' }, { id: 'c', role: 'normal' }],
    edges: [],
    caption: 'fail',
  })
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  const byLabel = new Map(boxes.map((box) => [box.label, box.colour]))
  if (colours[byLabel.get('a')] !== colours.fail) throw new Error('a is ' + String(byLabel.get('a')))
  if (colours[byLabel.get('b')] !== colours.findings) throw new Error('b is ' + String(byLabel.get('b')))
  if (colours[byLabel.get('c')] !== colours.edge) throw new Error('c is ' + String(byLabel.get('c')))
})

test('an unreachable row is painted below the reachable ones', () => {
  const { canvas } = paintWith({
    kind: 'machine',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'island', role: 'normal' }],
    edges: [],
    caption: 'pass_with_findings',
  })
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  const a = boxes.find((box) => box.label === 'a')
  const island = boxes.find((box) => box.label === 'island')
  if (a === undefined || island === undefined) throw new Error('a box is missing')
  if (island.y <= a.y) throw new Error('the unreachable state is not below: ' + String(island.y) + ' vs ' + String(a.y))
})

// ----------------------------------------------------------------------------------------------------- svg

test('the markup is a sized svg with the drawing inside', () => {
  const { canvas, colours } = paintWith(view())
  const { markup, dropped } = toSvg(canvas, colours, 'model_verify')
  if (dropped !== 0) throw new Error(String(dropped) + ' shape(s) had no writer')
  if (!markup.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')) throw new Error('header: ' + markup.slice(0, 60))
  if (!markup.includes('role="img"') || !markup.includes('aria-label="model_verify"')) throw new Error('no accessible name')
  if (!markup.includes('idle') || !markup.includes('start')) throw new Error('the drawing is empty')
})

test('every value from a model or a report is escaped', () => {
  const hostile = viewModel({
    toolName: 'model_verify',
    args: { model: { init: 'a', states: [{ id: '<img src=x onerror=alert(1)>' }, { id: 'a' }], transitions: [] } },
    result: { verdict: 'pass' },
  })
  const { canvas, colours } = paintWith(hostile)
  const { markup } = toSvg(canvas, colours)
  if (markup.includes('<img')) throw new Error('a state id reached the markup unescaped')
  if (!markup.includes('&lt;img')) throw new Error('the state id vanished instead of being escaped')
})

test('a caption is escaped too', () => {
  const diagram = { kind: 'none', title: 't', nodes: [], edges: [], caption: 'fail & <b>' }
  const { canvas, colours } = paintWith(diagram)
  const { markup } = toSvg(canvas, colours)
  if (markup.includes('<b>')) throw new Error('the caption reached the markup as markup')
  if (!markup.includes('fail &amp; &lt;b&gt;')) throw new Error('caption: ' + markup.slice(-120))
})

test('a canvas with no shapes still writes a valid svg', () => {
  const { markup, dropped } = toSvg({ width: 10, height: 10, shapes: [] }, palette())
  if (dropped !== 0) throw new Error('dropped: ' + String(dropped))
  if (!markup.endsWith('</svg>')) throw new Error('markup: ' + markup)
  if (markup.includes('aria-label')) throw new Error('a label was invented')
})

test('a shape with no writer is counted, not silently skipped', () => {
  const { markup, dropped } = toSvg({ width: 10, height: 10, shapes: [{ kind: 'mystery' }] }, palette())
  if (dropped !== 1) throw new Error('dropped: ' + String(dropped))
  if (markup.includes('mystery')) throw new Error('an unknown shape reached the markup')
})

test('the geometry is written with at most two decimals', () => {
  const { canvas, colours } = paintWith({ kind: 'none', title: 't', nodes: [], edges: [], caption: 'pass' })
  const { markup } = toSvg(canvas, colours)
  const numbers = [...markup.matchAll(/(?:x|y|width|height)="(-?\d+(?:\.\d+)?)"/g)].map((match) => match[1])
  for (const value of numbers) {
    const decimals = value.includes('.') ? value.split('.')[1].length : 0
    if (decimals > 2) throw new Error('coordinate with ' + String(decimals) + ' decimals: ' + value)
  }
})


test('a report present but empty still captions itself', () => {
  const diagram = viewModel({ toolName: 't', args: {}, result: {} })
  if (diagram.caption !== 'unknown') throw new Error('caption: ' + diagram.caption)
})

test('a finding with no code and no message is still quoted without inventing text', () => {
  const diagram = viewModel({ toolName: 't', args: {}, result: { verdict: 'fail', findings: [{ severity: 'error' }] } })
  if (diagram.caption !== 'fail — error') throw new Error('caption: ' + diagram.caption)
})

test('an unnamed tool is named tool', () => {
  const diagram = viewModel({})
  if (diagram.title !== 'tool') throw new Error('title: ' + diagram.title)
})

test('a model with no initial state carries none', () => {
  const diagram = viewModel({ toolName: 't', args: { model: { states: [{ id: 'a' }, { id: 'b' }], transitions: [] } } })
  if (diagram.init !== undefined) throw new Error('an init appeared: ' + String(diagram.init))
})

test('the initial state is painted as the initial one, and only it', () => {
  const { canvas } = paintWith(view())
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  const initial = boxes.filter((box) => box.initial)
  if (initial.length !== 1) throw new Error(String(initial.length) + ' boxes claim to be initial')
  if (initial[0].label !== 'idle') throw new Error('the initial box is ' + initial[0].label)
})

test('a muted state paints muted, and links leaving it follow', () => {
  const { canvas, colours } = paintWith({
    kind: 'machine',
    title: 't',
    init: 'a',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'm', role: 'muted' }],
    edges: [{ from: 'm', to: 'a', label: 'back' }],
    caption: 'pass',
  })
  const byLabel = new Map(canvas.shapes.filter((shape) => shape.kind === 'box').map((box) => [box.label, box.colour]))
  if (colours[byLabel.get('m')] !== colours.muted) throw new Error('muted box: ' + String(byLabel.get('m')))
  const link = canvas.shapes.find((shape) => shape.kind === 'link')
  if (colours[link.colour] !== colours.muted) throw new Error('the link from a muted state is ' + String(link.colour))
})

test('a link leaving a failing state is painted in the failing colour', () => {
  const { canvas, colours } = paintWith({
    kind: 'machine',
    title: 't',
    nodes: [{ id: 'bad', role: 'error' }, { id: 'ok', role: 'normal' }],
    edges: [{ from: 'bad', to: 'ok', label: '' }],
    caption: 'fail',
  })
  const link = canvas.shapes.find((shape) => shape.kind === 'link')
  if (colours[link.colour] !== colours.fail) throw new Error('link colour: ' + String(link.colour))
})

test('a link leaving a warning state is painted in the warning colour', () => {
  const { canvas, colours } = paintWith({
    kind: 'machine',
    title: 't',
    nodes: [{ id: 'warn', role: 'warning' }, { id: 'ok', role: 'normal' }],
    edges: [{ from: 'warn', to: 'ok', label: '' }],
    caption: 'pass_with_findings',
  })
  const link = canvas.shapes.find((shape) => shape.kind === 'link')
  if (colours[link.colour] !== colours.findings) throw new Error('link colour: ' + String(link.colour))
})

test('the initial box is written with a heavier border', () => {
  const { canvas, colours } = paintWith(view())
  const { markup } = toSvg(canvas, colours)
  if (!markup.includes('stroke-width="3"')) throw new Error('the initial state has no heavier border')
})

test('an edge with no event writes no label element', () => {
  const { canvas, colours } = paintWith({
    kind: 'machine',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }],
    edges: [{ from: 'a', to: 'b', label: '' }],
    caption: 'pass',
  })
  const { markup } = toSvg(canvas, colours)
  if (markup.includes('font-size="10"')) throw new Error('an empty label was written')
})


test('a cycle fixes a row on the first visit and does not move it', () => {
  const nodes = [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }]
  const ranked = rankStates(nodes, [{ from: 'a', to: 'b', label: 'go' }, { from: 'b', to: 'a', label: 'back' }], 'a')
  if (JSON.stringify(ranked.rows) !== JSON.stringify([['a'], ['b']])) throw new Error('rows: ' + JSON.stringify(ranked.rows))
  if (ranked.unreachable.length !== 0) throw new Error('a cycle made a state unreachable')
})

if (failures > 0) {
  console.log(NL + 'render tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all render tests passed')

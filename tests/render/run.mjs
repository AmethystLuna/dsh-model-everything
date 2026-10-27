// White-box suite for the renderer's pure half.
//
// Everything a drawing decides is decided here, in Node, with no browser: which nodes exist, what row each
// sits in, what shape is emitted, and what the markup says. The input is the shape the host actually hands a
// tool view - a lazy arguments view plus content blocks once settled - because that shape is what the first
// version of this code guessed wrong: the card said "no report yet" for a report that was right there.
import { palette, roleForVerdict, schemeNames } from '../../lib/render/palette.js'
import { rankStates } from '../../lib/render/layout.js'
import { paint, paintWith } from '../../lib/render/paint.js'
import { toSvg } from '../../lib/render/svg.js'
import { viewModel } from '../../lib/render/viewmodel.js'
import { emptyDiagram, labelOf } from '../../lib/render/model.js'
import { LINE_HEIGHT, MAX_LINE_CHARS, TEXT_PADDING, MAX_NODE_WIDTH, explicitLines, measure, textWidth, wrapLine } from '../../lib/render/text.js'
import { anchor, approachSides, crossesBox, routeEdge, simplify } from '../../lib/render/route.js'
import { render } from '../../lib/render/index.js'

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

/** A lazy arguments view, the way the host supplies one: total readers, no fields of its own. */
const argsView = (fields) => ({
  value: (key) => fields[key],
  text: (key) => (typeof fields[key] === 'string' ? fields[key] : undefined),
  keys: () => Object.keys(fields),
  has: (key) => key in fields,
})

/** The report text a settled call carries, in this plugin's own format. */
const reportText = ({ verdict, code, message }) =>
  [
    'model-everything/verify/v1  verdict=' + (verdict ?? 'pass') + '  0 error finding(s)',
    'CHECKS  pass S1 S3 | fail S2',
    code === undefined ? '' : '  [error/' + code + '] ' + (message ?? ''),
  ].join(NL)

/** A settled call, as the host shapes it. */
const settled = ({ model = machine, verdict = 'pass', code, message, name = 'model_verify', content } = {}) => ({
  phase: 'result',
  toolName: name,
  block: {
    kind: 'tool-result',
    name,
    args: argsView(model === undefined ? {} : { model }),
    content: content ?? [{ type: 'text', text: reportText({ verdict, code, message }) }],
    isError: false,
  },
})

const view = (options = {}) => viewModel(settled(options))

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
  const diagram = view({ model: null, verdict: 'fail', code: 'S1', message: 'deadlock' })
  if (diagram.kind !== 'none') throw new Error('a model-less call drew a machine')
  if (!diagram.caption.startsWith('fail — S1: deadlock')) throw new Error('caption: ' + diagram.caption)
  if (diagram.nodes.length !== 0) throw new Error('nodes appeared from nowhere')
})

test('the caption falls back from a finding to a verdict to nothing', () => {
  const counted = view({ verdict: 'pass' })
  if (counted.caption !== 'pass') throw new Error('caption: ' + counted.caption)
  const bare = viewModel({ block: { kind: 'tool-result', name: 't', args: argsView({}), content: [{ type: 'text', text: 'nothing parsed here' }] } })
  if (bare.caption !== 'no report yet') throw new Error('missing caption: ' + bare.caption)
  const empty = viewModel({})
  if (empty.caption !== 'no report yet') throw new Error('empty input caption: ' + empty.caption)
})

test('the first error is read out of the report text, with its message', () => {
  const diagram = view({ verdict: 'fail', code: 'S2_NO_TRANSITIONS', message: 'state "done" has no exit' })
  if (diagram.caption !== 'fail — S2_NO_TRANSITIONS: state "done" has no exit') throw new Error('caption: ' + diagram.caption)
})

test('a report that only names the code in its header still yields the code', () => {
  const content = [{ type: 'text', text: 'model-everything/verify/v1  verdict=fail  1 error finding(s) (first error: S3_GUARD) thing' }]
  const diagram = viewModel({ block: { kind: 'tool-result', name: 'model_verify', args: argsView({}), content } })
  if (diagram.caption !== 'fail — S3_GUARD') throw new Error('caption: ' + diagram.caption)
})

test('a machine becomes nodes and labelled edges', () => {
  const diagram = view()
  if (diagram.kind !== 'machine') throw new Error('kind: ' + diagram.kind)
  if (diagram.nodes.length !== 3) throw new Error('nodes: ' + String(diagram.nodes.length))
  if (diagram.edges.length !== 2) throw new Error('edges: ' + String(diagram.edges.length))
  const labels = diagram.edges.map((edge) => edge.label).join(',')
  if (labels !== 'start,finish') throw new Error('edge labels: ' + labels)
})

test('the arguments are read through the host lazy view, not off a plain object', () => {
  const diagram = viewModel({ block: { kind: 'tool-result', name: 'model_verify', args: argsView({ model: machine }), content: [] } })
  if (diagram.kind !== 'machine') throw new Error('the lazy view was not asked')
})

test('a plain-object argument shape is still read, for callers without the view', () => {
  const diagram = viewModel({ block: { kind: 'tool-result', name: 'model_verify', args: { model: machine }, content: [] }, toolName: 'model_verify' })
  if (diagram.kind !== 'machine') throw new Error('the plain shape was not read')
})

test('an edge without an event keeps an empty label rather than the word undefined', () => {
  const diagram = view({ model: { init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', to: 'b' }] } })
  if (diagram.edges[0].label !== '') throw new Error('label: ' + diagram.edges[0].label)
})

test('a malformed model is not a drawing', () => {
  const cases = [null, { states: 'not-an-array' }, { states: [] }, { states: [{ notAnId: 1 }] }]
  for (const model of cases) {
    const diagram = view({ model })
    if (diagram.kind !== 'none') throw new Error('drew from ' + JSON.stringify(model))
  }
})

test('a transition naming a state that does not exist is kept in the model and dropped by the painter', () => {
  const diagram = view({ model: { init: 'a', states: [{ id: 'a' }], transitions: [{ from: 'a', event: 'go', to: 'ghost' }] } })
  if (diagram.edges.length !== 1) throw new Error('the edge was dropped from the model, not from the drawing')
})

test('a finding that names a state marks that state, and only that state', () => {
  const diagram = view({ verdict: 'fail', code: 'S3_EXIT', message: 'state "busy" has no exit' })
  const roles = new Map(diagram.nodes.map((node) => [node.id, node.role]))
  if (roles.get('busy') !== 'error') throw new Error('busy: ' + String(roles.get('busy')))
  if (roles.get('idle') !== 'normal') throw new Error('idle was marked: ' + String(roles.get('idle')))
})

test('a finding that names nothing leaves every state alone', () => {
  const diagram = view({ verdict: 'fail', code: 'S1', message: 'a property failed' })
  if (diagram.nodes.some((node) => node.role !== 'normal')) throw new Error('a state was marked without being named')
})

test('a parsed report object beside the content is read as a fallback', () => {
  const diagram = viewModel({
    block: {
      kind: 'tool-result',
      name: 'model_verify',
      args: argsView({ model: machine }),
      content: [],
      result: { verdict: 'fail', findings: [{ severity: 'error', code: 'A1', message: 'state "done" repeats' }] },
    },
  })
  if (diagram.caption !== 'fail — A1: state "done" repeats') throw new Error('caption: ' + diagram.caption)
  if (diagram.nodes.find((node) => node.id === 'done')?.role !== 'error') throw new Error('the named state was not marked')
})

test('the title comes from the block, then the props, then a placeholder', () => {
  if (view().title !== 'model_verify') throw new Error('title: ' + view().title)
  const fromProps = viewModel({ toolName: 'uml_review', block: { kind: 'tool-result', args: argsView({}), content: [] } })
  if (fromProps.title !== 'uml_review') throw new Error('props title: ' + fromProps.title)
  if (viewModel({}).title !== 'tool') throw new Error('placeholder title: ' + viewModel({}).title)
})

// -------------------------------------------------------------------------------------------------- layout

test('rows follow distance from the initial state', () => {
  const diagram = view()
  const ranked = rankStates(diagram.nodes, diagram.edges, 'idle')
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

test('a cycle fixes a row on the first visit and does not move it', () => {
  const nodes = [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }]
  const ranked = rankStates(nodes, [{ from: 'a', to: 'b', label: 'go' }, { from: 'b', to: 'a', label: 'back' }], 'a')
  if (JSON.stringify(ranked.rows) !== JSON.stringify([['a'], ['b']])) throw new Error('rows: ' + JSON.stringify(ranked.rows))
  if (ranked.unreachable.length !== 0) throw new Error('a cycle made a state unreachable')
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
  if (canvas.width < 240) throw new Error('width: ' + String(canvas.width))
  if (canvas.height <= 44) throw new Error('height: ' + String(canvas.height))
  // The canvas must be wide enough for the drawing it holds, or the widest thing in it is clipped.
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  if (canvas.width < right) throw new Error('the canvas is narrower than its boxes: ' + String(canvas.width) + ' < ' + String(right))
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

test('the initial state is painted as the initial one, and only it', () => {
  const { canvas } = paintWith(view())
  const initial = canvas.shapes.filter((shape) => shape.kind === 'box' && shape.initial)
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
  const edge = canvas.shapes.find((shape) => shape.kind === 'link' || shape.kind === 'path')
  if (colours[edge.colour] !== colours.muted) throw new Error('the edge from a muted state is ' + String(edge.colour))
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
  const hostile = view({ model: { init: 'a', states: [{ id: '<img src=x onerror=alert(1)>' }, { id: 'a' }], transitions: [] } })
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

test('the initial box is written with a heavier border', () => {
  const { canvas, colours } = paintWith(view())
  const { markup } = toSvg(canvas, colours)
  if (!markup.includes('stroke-width="2.5"')) throw new Error('the initial state has no heavier border')
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
  const labels = [...markup.matchAll(/<text x="[\d.]+" y="[\d.]+" font-size="10" fill="([^"]+)">([^<]*)<\/text>/g)].map((match) => match[2])
  if (labels.includes('')) throw new Error('an empty label was written')
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

test('a model with no initial state carries none', () => {
  const diagram = view({ model: { states: [{ id: 'a' }, { id: 'b' }], transitions: [] } })
  if (diagram.kind !== 'machine') throw new Error('kind: ' + diagram.kind)
  if (diagram.init !== undefined) throw new Error('an init appeared: ' + String(diagram.init))
})

test('a model that declares an initial state carries it', () => {
  if (view().init !== 'idle') throw new Error('init: ' + String(view().init))
})

test('a row keeps the order breadth-first found it in, under the parent that discovered it', () => {
  // `s` discovers `a` then `b`, so the row below holds a then b, each under its own parent.
  const nodes = [{ id: 's', role: 'normal' }, { id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }]
  const edges = [{ from: 's', event: '', to: 'a' }, { from: 's', event: '', to: 'b' }]
  const ranked = rankStates(nodes, edges, 's')
  if (JSON.stringify(ranked.rows) !== JSON.stringify([['s'], ['a', 'b']])) throw new Error('rows: ' + JSON.stringify(ranked.rows))
})

test('a back edge with nothing in its way is a straight line between the two boxes', () => {
  const diagram = {
    kind: 'machine',
    title: 't',
    init: 'a',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }],
    edges: [
      { from: 'a', label: 'go', to: 'b' },
      { from: 'b', label: 'back', to: 'a' },
    ],
    caption: 'pass',
  }
  const { canvas } = paintWith(diagram)
  const links = canvas.shapes.filter((shape) => shape.kind === 'link')
  if (links.length !== 2) throw new Error('links: ' + String(links.length))
  const back = links.find((shape) => shape.label === 'back')
  if (back === undefined) throw new Error('the back edge was lost')
  // Upward: the arrow leaves the top of the lower box and arrives at the bottom of the upper one.
  if (!(back.y2 < back.y1)) throw new Error('the back edge points the wrong way: ' + String(back.y1) + ' -> ' + String(back.y2))
})

test('a self loop is a small loop, not a line to itself', () => {
  const diagram = {
    kind: 'machine',
    title: 't',
    init: 'a',
    nodes: [{ id: 'a', role: 'normal' }],
    edges: [{ from: 'a', label: 'again', to: 'a' }],
    caption: 'pass',
  }
  const { canvas } = paintWith(diagram)
  const routes = canvas.shapes.filter((shape) => shape.kind === 'path')
  if (routes.length !== 1) throw new Error('loops: ' + String(routes.length))
  if (routes[0].points.length !== 4) throw new Error('a loop needs four corners, got ' + String(routes[0].points.length))
  const box = canvas.shapes.find((shape) => shape.kind === 'box')
  const maxX = Math.max(...routes[0].points.map((point) => point.x))
  if (maxX - (box.x + box.width) > 40) throw new Error('the loop is not small: ' + String(maxX - (box.x + box.width)) + 'px out')
})

test('a long caption wraps and the canvas is widened to fit it', () => {
  const caption = 'fail — S2_NO_TRANSITIONS: Non-terminal state done has no outgoing transitions, and a second sentence keeps going for a while to force a wrap.'
  const diagram = { kind: 'none', title: 't', nodes: [], edges: [], caption }
  const { canvas } = paintWith(diagram)
  const shape = canvas.shapes.find((entry) => entry.kind === 'caption')
  if (shape.lines.length < 2) throw new Error('lines: ' + String(shape.lines.length))
  const longest = Math.max(...shape.lines.map((line) => line.length))
  if (longest > 78) throw new Error('a line is longer than the wrap limit: ' + String(longest))
  if (canvas.width < longest * 6.2) throw new Error('the canvas is narrower than its caption: ' + String(canvas.width))
})

test('a box grows with its label instead of clipping it', () => {
  const short = paintWith({ kind: 'machine', title: 't', init: 'a', nodes: [{ id: 'a', role: 'normal' }], edges: [], caption: 'pass' })
  const long = paintWith({ kind: 'machine', title: 't', init: 'a', nodes: [{ id: 'a-state-with-a-long-name', role: 'normal' }], edges: [], caption: 'pass' })
  const shortBox = short.canvas.shapes.find((shape) => shape.kind === 'box')
  const longBox = long.canvas.shapes.find((shape) => shape.kind === 'box')
  if (longBox.width <= shortBox.width) throw new Error('width did not grow: ' + String(shortBox.width) + ' -> ' + String(longBox.width))
  if (longBox.width > 220) throw new Error('the width cap is gone: ' + String(longBox.width))
})

test('every edge ends with an arrowhead', () => {
  const { canvas, colours } = paintWith(view())
  const markup = toSvg(canvas, colours).markup
  const arrows = (markup.match(/<polygon points=/g) ?? []).length
  const edges = canvas.shapes.filter((shape) => shape.kind === 'link' || shape.kind === 'path').length
  if (arrows !== edges) throw new Error(String(edges) + ' edges but ' + String(arrows) + ' arrowheads')
})

// -------------------------------------------------------------------------------------- edge heads and dashes

/** One edge between two rectangles, so the head is the only polygon the drawing holds. */
const edgeDiagram = (edge) => ({
  kind: 'machine',
  title: 't',
  init: 'a',
  nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }],
  edges: [{ from: 'a', label: '', to: 'b', ...edge }],
  caption: 'pass',
})

const edgeMarkup = (edge) => {
  const { canvas, colours } = paintWith(edgeDiagram(edge))
  return toSvg(canvas, colours).markup
}

/** Every head polygon in a drawing, as its corner list and the attributes after it. */
const headsOf = (markup) =>
  [...markup.matchAll(/<polygon points="([^"]+)"([^>]*)>/g)].map((match) => ({ corners: match[1].split(' '), attrs: match[2] }))

/** The source end of the one line in a drawing, to check which end a mark sits on. */
const sourceOf = (markup) => {
  const line = /<(?:line|polyline)[^>]*(?:x1="([\d.]+)" y1="([\d.]+)"|points="([\d.]+),([\d.]+))/.exec(markup)
  if (line === null) throw new Error('no line in: ' + markup)
  return (line[1] ?? line[3]) + ',' + (line[2] ?? line[4])
}

test('the painter keeps the arrow and the dash an edge states', () => {
  const { canvas } = paintWith(edgeDiagram({ arrow: 'generalization', dashed: true }))
  const route = canvas.shapes.find((shape) => shape.kind === 'link' || shape.kind === 'path')
  if (route?.arrow !== 'generalization') throw new Error('the arrow did not reach the shape: ' + String(route?.arrow))
  if (route?.dashed !== true) throw new Error('the dash did not reach the shape')
})

test('a generalisation head is hollow, so it differs from the association head', () => {
  const association = headsOf(edgeMarkup({}))
  const generalization = headsOf(edgeMarkup({ arrow: 'generalization' }))
  if (association.length !== 1 || generalization.length !== 1) throw new Error('heads: ' + String(association.length) + '/' + String(generalization.length))
  if (association[0].corners.length !== 3 || generalization[0].corners.length !== 3) throw new Error('a head is not a triangle')
  if (association[0].attrs.includes('stroke=')) throw new Error('the association head gained an outline')
  if (!generalization[0].attrs.includes('stroke=')) throw new Error('the generalisation head is not drawn as an outline')
  if (association[0].attrs === generalization[0].attrs) throw new Error('the two heads are written the same way')
  if (edgeMarkup({}) === edgeMarkup({ arrow: 'generalization' })) throw new Error('the two arrows draw the same picture')
})

test('a composition and an aggregation put a diamond at the source, filled and hollow', () => {
  for (const [name, arrow] of [['composition', 'composition'], ['aggregation', 'aggregation']]) {
    const markup = edgeMarkup({ arrow })
    const heads = headsOf(markup)
    if (heads.length !== 1) throw new Error(name + ' heads: ' + String(heads.length))
    if (heads[0].corners.length !== 4) throw new Error(name + ' head is not a diamond')
    if (heads[0].corners[0] !== sourceOf(markup)) throw new Error(name + ' diamond is not at the source')
    const filled = name === 'composition'
    if (!heads[0].attrs.includes(filled ? 'fill="#6b7280"' : 'fill="#ffffff"')) {
      throw new Error(name + ' fill: ' + heads[0].attrs)
    }
  }
})

test('a dependency and a realisation are dashed, and an association is solid', () => {
  if (edgeMarkup({}).includes('stroke-dasharray')) throw new Error('an association was drawn dashed')
  for (const arrow of ['dependency', 'realization']) {
    if (!edgeMarkup({ arrow, dashed: true }).includes('stroke-dasharray="4 3"')) throw new Error(arrow + ' is drawn solid')
  }
})

test('a mermaid edge states no arrow, and a mermaid drawing is unchanged', () => {
  const source = ['graph TD', '  a[Start] --> b{Check}', '  b -->|yes| c[Done]'].join(String.fromCharCode(10))
  const rendered = render({ source })
  if (rendered.diagram.edges.some((edge) => edge.arrow !== undefined)) throw new Error('a Mermaid edge gained an arrow type')
  const golden =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 283" width="240" height="283" role="img" aria-label="mermaid: graph, 3 boxes, 2 arrows" font-family="system-ui, -apple-system, Segoe UI, sans-serif"><rect x="0" y="0" width="240" height="283" fill="#ffffff" /><rect x="20" y="46" width="88" height="27" rx="6" fill="transparent" stroke="#6b7280" stroke-width="1" /><text font-size="11" text-anchor="middle" fill="#6b7280"><tspan x="64" y="63.5">Start</tspan></text><polygon points="64,127,108,140.5,64,154,20,140.5" fill="transparent" stroke="#6b7280" stroke-width="1" /><text font-size="11" text-anchor="middle" fill="#6b7280"><tspan x="64" y="144.5">Check</tspan></text><rect x="20" y="208" width="88" height="27" rx="6" fill="transparent" stroke="#6b7280" stroke-width="1" /><text font-size="11" text-anchor="middle" fill="#6b7280"><tspan x="64" y="225.5">Done</tspan></text><line x1="64" y1="73" x2="64" y2="127" stroke="#6b7280" stroke-width="1" /><polygon points="64,127 60.8,120 67.2,120" fill="#6b7280" /><line x1="64" y1="154" x2="64" y2="208" stroke="#6b7280" stroke-width="1" /><polygon points="64,208 60.8,201 67.2,201" fill="#6b7280" /><text x="64" y="181" font-size="10" fill="#9aa3ad">yes</text><text x="20" y="32" font-size="12" fill="#1f2933">mermaid</text><text x="20" y="262" font-size="10" text-anchor="middle" fill="#6b7280"><tspan x="20" dy="0">graph, 3 boxes, 2 arrows</tspan></text></svg>'
  if (rendered.markup !== golden) throw new Error('the Mermaid drawing changed: ' + rendered.markup)
})

test('a dashed mermaid edge is drawn dashed, because the painter now keeps the field', () => {
  const dashed = render({ source: 'graph TD\n  a -.-> b' })
  if (!dashed.markup.includes('stroke-dasharray="4 3"')) throw new Error('a dashed Mermaid edge is still solid')
  const solid = render({ source: 'graph TD\n  a --> b' })
  if (solid.markup.includes('stroke-dasharray')) throw new Error('a solid edge gained a dash')
})

test('a plantuml source reaches the svg with the head its arrow stated', () => {
  const association = render({ source: '@startuml\nA --> B\n@enduml' })
  const generalisation = render({ source: '@startuml\nA <|-- B\n@enduml' })
  if (generalisation.diagram.edges[0].from !== 'B' || generalisation.diagram.edges[0].to !== 'A') {
    throw new Error('the generalisation runs the wrong way: ' + JSON.stringify(generalisation.diagram.edges[0]))
  }
  if (association.markup === generalisation.markup) throw new Error('the two arrows draw the same head')
  if (!headsOf(generalisation.markup).some((head) => head.attrs.includes('stroke='))) {
    throw new Error('the generalisation head is not hollow')
  }
})


test('an edge between two rows leaves a horizontal side, whichever side of the page the target is on', () => {
  // The side is the route's approach direction, not the distance between the two centres: the drawing is layered
  // downwards, so a state two rows down is still entered from the top even when it sits far to one side.
  const diagram = {
    kind: 'machine',
    title: 't',
    init: 'a',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }, { id: 'c', role: 'normal' }],
    edges: [
      { from: 'a', label: 'left', to: 'b' },
      { from: 'a', label: 'right', to: 'c' },
      { from: 'b', label: 'swap', to: 'c' },
    ],
    caption: 'pass',
  }
  const { canvas } = paintWith(diagram)
  const boxes = new Map(canvas.shapes.filter((shape) => shape.kind === 'box').map((box) => [box.label, box]))
  const endsOf = new Map([
    ['left', ['a', 'b']],
    ['right', ['a', 'c']],
    ['swap', ['b', 'c']],
  ])
  const pointsOf = (shape) =>
    shape.kind === 'link' ? [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }] : shape.points
  for (const shape of canvas.shapes.filter((entry) => entry.kind === 'link' || entry.kind === 'path')) {
    const [from, to] = endsOf.get(shape.label)
    const points = pointsOf(shape)
    const source = boxes.get(from)
    const target = boxes.get(to)
    const first = points[0]
    const last = points[points.length - 1]
    if (first.y !== source.y && first.y !== source.y + source.height) {
      throw new Error(shape.label + ' leaves through a vertical side at y=' + String(first.y))
    }
    if (last.y !== target.y && last.y !== target.y + target.height) {
      throw new Error(shape.label + ' arrives through a vertical side at y=' + String(last.y))
    }
  }
})

test('an edge between adjacent rows is a straight vertical drop when the boxes allow one', () => {
  const diagram = {
    kind: 'machine',
    title: 't',
    init: 'a',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }, { id: 'c', role: 'normal' }],
    edges: [
      { from: 'a', label: 'one', to: 'b' },
      { from: 'b', label: 'two', to: 'c' },
    ],
    caption: 'pass',
  }
  const { canvas } = paintWith(diagram)
  const links = canvas.shapes.filter((shape) => shape.kind === 'link')
  if (links.length !== 2) throw new Error('links: ' + String(links.length))
  for (const link of links) {
    if (link.x1 !== link.x2) throw new Error('a drop is not vertical: ' + String(link.x1) + ' -> ' + String(link.x2))
    if (!(link.y2 > link.y1)) throw new Error('a forward edge points back up the page')
  }
})

test('an edge that has to go around a box is written as a polyline, not a line', () => {
  // The fan-out below puts a box under the direct edge: `a` reaches `e` past the row of services.
  const source = [
    'graph TD',
    '  a[Gateway] --> b[Auth service]',
    '  a --> c[Order service]',
    '  a --> d[Stock service]',
    '  c --> e[(Orders)]',
    '  d --> e',
    '  a -->|health probe| e',
  ].join(String.fromCharCode(10))
  const { canvas, colours } = paintWith(render({ source }).diagram)
  const routes = canvas.shapes.filter((shape) => shape.kind === 'path')
  if (routes.length === 0) throw new Error('no edge was routed')
  const { markup, dropped } = toSvg(canvas, colours)
  if (dropped !== 0) throw new Error('dropped: ' + String(dropped))
  if (!markup.includes('<polyline points="')) throw new Error('the routed edge wrote no polyline')
  // Every edge of the source is drawn exactly once, routed or not.
  const drawnEdges = canvas.shapes.filter((shape) => shape.kind === 'link' || shape.kind === 'path').length
  if (drawnEdges !== 6) throw new Error('edges drawn: ' + String(drawnEdges))
})

test('a diagram with no states is a title and a caption, nothing else', () => {
  const { canvas } = paintWith({ kind: 'none', title: 't', nodes: [], edges: [], caption: 'no report yet' })
  const kinds = canvas.shapes.map((shape) => shape.kind).sort()
  if (JSON.stringify(kinds) !== JSON.stringify(['caption', 'title'])) throw new Error('shapes: ' + JSON.stringify(kinds))
})

test('a caption with no verdict separator still gets a colour', () => {
  const { canvas, colours } = paintWith({ kind: 'none', title: 't', nodes: [], edges: [], caption: 'no report yet' })
  const caption = canvas.shapes.find((shape) => shape.kind === 'caption')
  if (colours[caption.colour] !== colours.undecided) throw new Error('caption role: ' + String(caption.colour))
})

test('a caption holding one very long token is broken instead of overflowing', () => {
  const token = 'x'.repeat(200)
  const { canvas } = paintWith({ kind: 'none', title: 't', nodes: [], edges: [], caption: token })
  const caption = canvas.shapes.find((shape) => shape.kind === 'caption')
  if (caption.lines.length < 2) throw new Error('lines: ' + String(caption.lines.length))
  for (const line of caption.lines) if (line.length > 78) throw new Error('a line still overflows: ' + String(line.length))
})


test('an edge naming a state the model does not have is dropped by the painter, not drawn', () => {
  const diagram = {
    kind: 'machine',
    title: 't',
    init: 'a',
    nodes: [{ id: 'a', role: 'normal' }],
    edges: [{ from: 'a', label: 'ghost', to: 'missing' }],
    caption: 'pass',
  }
  const { canvas } = paintWith(diagram)
  if (canvas.shapes.some((shape) => shape.kind === 'link' || shape.kind === 'path')) throw new Error('a dangling edge was painted')
})

test('the paint helper returns the canvas alone', () => {
  const canvas = paint(view())
  if (canvas.shapes.length === 0) throw new Error('no shapes')
  if (canvas.width <= 0 || canvas.height <= 0) throw new Error('no size')
})

test('an edge whose source is missing is dropped too', () => {
  const diagram = {
    kind: 'machine',
    title: 't',
    init: 'a',
    nodes: [{ id: 'a', role: 'normal' }],
    edges: [{ from: 'ghost', label: 'x', to: 'a' }],
    caption: 'pass',
  }
  if (paint(diagram).shapes.some((shape) => shape.kind === 'link' || shape.kind === 'path')) throw new Error('a sourceless edge was painted')
})

test('a one point path is written without an arrowhead and does not throw', () => {
  const { markup, dropped } = toSvg({ width: 10, height: 10, shapes: [{ kind: 'path', points: [{ x: 1, y: 1 }], label: '', labelX: 0, labelY: 0, colour: 'edge' }] }, palette())
  if (dropped !== 0) throw new Error('dropped: ' + String(dropped))
  if (markup.includes('<polygon')) throw new Error('a point with no direction drew an arrow')
  if (!markup.includes('<polyline')) throw new Error('the path itself is missing')
})

test('a zero length edge is written without an arrowhead', () => {
  const { markup } = toSvg({ width: 10, height: 10, shapes: [{ kind: 'link', x1: 5, y1: 5, x2: 5, y2: 5, label: '', labelX: 0, labelY: 0, colour: 'edge' }] }, palette())
  if (markup.includes('<polygon')) throw new Error('a zero length edge drew an arrow')
})

test('a wrapped caption writes one tspan per line', () => {
  const { canvas, colours } = paintWith({ kind: 'none', title: 't', nodes: [], edges: [], caption: 'a '.repeat(90) })
  const { markup } = toSvg(canvas, colours)
  const spans = (markup.match(/<tspan/g) ?? []).length
  const caption = canvas.shapes.find((shape) => shape.kind === 'caption')
  if (spans !== caption.lines.length) throw new Error('spans: ' + String(spans) + ' lines: ' + String(caption.lines.length))
  if (spans < 2) throw new Error('the caption did not wrap')
})

test('an empty caption is one blank line, not no lines', () => {
  const { canvas } = paintWith({ kind: 'none', title: 't', nodes: [], edges: [], caption: '' })
  const caption = canvas.shapes.find((shape) => shape.kind === 'caption')
  if (JSON.stringify(caption.lines) !== JSON.stringify([''])) throw new Error('lines: ' + JSON.stringify(caption.lines))
})

test('a repeated state id is drawn once', () => {
  const diagram = {
    kind: 'machine',
    title: 't',
    init: 'a',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'a', role: 'error' }],
    edges: [],
    caption: 'pass',
  }
  const boxes = paint(diagram).shapes.filter((shape) => shape.kind === 'box')
  if (boxes.length !== 1) throw new Error('boxes: ' + String(boxes.length))
})

test('an edge leaving a state nothing reaches still gets a row', () => {
  // `island` is unreachable, so it is drawn in its own block and has no row of its own to read.
  const diagram = {
    kind: 'machine',
    title: 't',
    init: 'a',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'island', role: 'normal' }],
    edges: [
      { from: 'a', label: 'go', to: 'a' },
      { from: 'island', label: 'out', to: 'a' },
      { from: 'a', label: 'in', to: 'island' },
    ],
    caption: 'pass',
  }
  const shapes = paint(diagram).shapes
  const routes = shapes.filter((shape) => shape.kind === 'path' || shape.kind === 'link')
  if (routes.length !== 3) throw new Error('edges drawn: ' + String(routes.length))
})

test('every drawn segment is axis-aligned, on every kind of drawing', () => {
  // The invariant the whole router rests on: a diagonal reads as a connection that skips the rows it crosses.
  const sources = [
    ['graph TD', '  a[Gateway] --> b[Auth]', '  a --> c[Order service]', '  a --> d[Stock]', '  c --> e[(Orders)]', '  d --> e', '  a -->|probe| e'].join(String.fromCharCode(10)),
    ['graph TD', '  subgraph Ingest', '    a[Gateway] --> b[Auth]', '    b --> c[Order service]', '  end', '  subgraph Fulfil', '    c --> d[(Orders)]', '    d --> e[Warehouse]', '  end', '  e --> f[Reconcile]', '  f -->|drift| a'].join(String.fromCharCode(10)),
  ]
  for (const source of sources) {
    const { canvas } = paintWith(render({ source }).diagram)
    for (const shape of canvas.shapes) {
      if (shape.kind === 'link') {
        if (Math.abs(shape.x1 - shape.x2) > 0.5 && Math.abs(shape.y1 - shape.y2) > 0.5) throw new Error('a link is diagonal')
        continue
      }
      if (shape.kind !== 'path') continue
      for (let index = 0; index + 1 < shape.points.length; index += 1) {
        const from = shape.points[index]
        const to = shape.points[index + 1]
        if (Math.abs(from.x - to.x) > 0.5 && Math.abs(from.y - to.y) > 0.5) {
          throw new Error('a path segment is diagonal: ' + JSON.stringify(from) + ' -> ' + JSON.stringify(to))
        }
      }
    }
  }
})

test('the dark surface gets its own palette', () => {
  const light = palette()
  const dark = palette({}, { mode: 'dark' })
  if (light.background === dark.background) throw new Error('both surfaces share a background')
  if (light.text === dark.text) throw new Error('both surfaces share a text colour')
  // The dark surface must not paint a dark line on a dark page.
  const luminance = (hex) => {
    const value = hex.replace('#', '')
    const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16))
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255
  }
  if (luminance(dark.text) < 0.6) throw new Error('the dark text colour is not light enough: ' + dark.text)
  if (luminance(dark.background) > 0.4) throw new Error('the dark background is not dark enough: ' + dark.background)
  if (luminance(light.text) > 0.4) throw new Error('the light text colour is not dark enough: ' + light.text)
})

test('a scheme replaces the family, and an override still wins', () => {
  const print = palette({}, { scheme: 'print' })
  if (print.fail !== '#000000') throw new Error('print fail: ' + print.fail)
  const overridden = palette({ fail: '#123456' }, { scheme: 'print', mode: 'dark' })
  if (overridden.fail !== '#123456') throw new Error('the override lost: ' + overridden.fail)
  const contrast = palette({}, { scheme: 'high-contrast' })
  if (contrast.edge !== '#000000') throw new Error('high contrast edge: ' + contrast.edge)
})



test('every scheme is offered by name, and github is one of them', () => {
  const names = schemeNames()
  if (!names.includes('github')) throw new Error('schemes: ' + names.join(','))
  for (const name of names) {
    const colours = palette({}, { scheme: name })
    if (colours.background === undefined || colours.text === undefined) throw new Error('incomplete scheme: ' + name)
  }
})

test('the github scheme follows the surface with its own values', () => {
  const light = palette({}, { scheme: 'github' })
  const dark = palette({}, { scheme: 'github', mode: 'dark' })
  // Primer's own foregrounds, not ours: the point of a named scheme is that it is recognisably that product.
  if (light.text !== '#1f2328') throw new Error('github light text: ' + light.text)
  if (dark.text !== '#e6edf3') throw new Error('github dark text: ' + dark.text)
  if (light.pass !== '#1a7f37') throw new Error('github light pass: ' + light.pass)
  if (dark.fail !== '#f85149') throw new Error('github dark fail: ' + dark.fail)
  if (light.background === dark.background) throw new Error('the github scheme does not follow the surface')
})

test('a scheme with only one variant keeps it on the dark surface', () => {
  const printDark = palette({}, { scheme: 'print', mode: 'dark' })
  if (printDark.background !== '#ffffff') throw new Error('print followed the surface: ' + printDark.background)
  const contrastDark = palette({}, { scheme: 'high-contrast', mode: 'dark' })
  if (contrastDark.text !== '#000000') throw new Error('high contrast followed the surface: ' + contrastDark.text)
})

test('an unknown scheme name falls back to the default palette', () => {
  // The value can arrive from a DOM control in the page, so the lookup is total rather than typed away.
  const unknown = palette({}, { scheme: 'nonsense' })
  const light = palette()
  if (unknown.background !== light.background || unknown.text !== light.text) throw new Error('the fallback is not the default palette')
})

test('the drawing carries its own surface, so no container decides its contrast', () => {
  const { canvas, colours } = paintWith(view())
  const { markup } = toSvg(canvas, colours)
  // The first thing in the body is a full-bleed rectangle in the palette's background, before any shape.
  const afterHeader = markup.slice(markup.indexOf('>') + 1)
  const firstRect = /^<rect x="0" y="0" width="([\d.]+)" height="([\d.]+)" fill="([^"]+)"/.exec(afterHeader)
  if (firstRect === null) throw new Error('no background rectangle: ' + afterHeader.slice(0, 80))
  if (Number(firstRect[1]) !== canvas.width || Number(firstRect[2]) !== canvas.height) throw new Error('the background does not cover the canvas')
  if (firstRect[3] !== colours.background) throw new Error('the background is ' + firstRect[3] + ', not the palette surface')
})

test('the background follows the scheme and the surface', () => {
  const light = paintWith(view())
  const dark = paintWith(view(), {}, { mode: 'dark' })
  const lightMarkup = toSvg(light.canvas, light.colours).markup
  const darkMarkup = toSvg(dark.canvas, dark.colours).markup
  if (lightMarkup.includes(light.colours.background) === false) throw new Error('the light surface is missing')
  if (light.colours.background === dark.colours.background) throw new Error('both surfaces share a background')
  if (!darkMarkup.includes(dark.colours.background)) throw new Error('the dark surface is missing')
})

test('a group is drawn as a boundary around its members', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }, { id: 'c', role: 'normal' }],
    edges: [
      { from: 'a', label: 'in', to: 'b' },
      { from: 'b', label: 'out', to: 'c' },
    ],
    groups: [{ id: 'g1', label: 'Core', members: ['a', 'b'] }],
    caption: 'graph',
  }
  const { canvas } = paintWith(diagram)
  const group = canvas.shapes.find((shape) => shape.kind === 'group')
  if (group === undefined) throw new Error('no group was drawn')
  if (group.label !== 'Core') throw new Error('label: ' + group.label)
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  const inside = (id) => {
    const box = boxes.find((entry) => entry.label === id)
    return box.x >= group.x && box.y >= group.y && box.x + box.width <= group.x + group.width && box.y + box.height <= group.y + group.height
  }
  if (!inside('a') || !inside('b')) throw new Error('a member is outside its group boundary')
  // A boundary is a bounding box, so it can span a column its members do not occupy; what it must not do is
  // contain a box that is not in the group.
  const outside = boxes.find((entry) => entry.label === 'c')
  const contained = outside.x >= group.x && outside.y >= group.y &&
    outside.x + outside.width <= group.x + group.width && outside.y + outside.height <= group.y + group.height
  if (contained) throw new Error('a non-member is inside the boundary')
})

test('a group is painted before the boxes, so it sits behind them', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }],
    edges: [],
    groups: [{ id: 'g1', label: 'Only', members: ['a'] }],
    caption: 'graph',
  }
  const kinds = paintWith(diagram).canvas.shapes.map((shape) => shape.kind)
  if (kinds.indexOf('group') > kinds.indexOf('box')) throw new Error('the boundary is painted over its member: ' + kinds.join(','))
})

test('an empty group is not drawn, because it claims a containment nobody stated', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }],
    edges: [],
    groups: [{ id: 'g1', label: 'Empty', members: ['ghost'] }],
    caption: 'graph',
  }
  const { canvas } = paintWith(diagram)
  if (canvas.shapes.some((shape) => shape.kind === 'group')) throw new Error('an empty boundary was drawn')
})

test('a group is written as a dashed boundary with its name, and its label is escaped', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }],
    edges: [],
    groups: [{ id: 'g1', label: '<Core & Edge>', members: ['a'] }],
    caption: 'graph',
  }
  const { canvas, colours } = paintWith(diagram)
  const { markup, dropped } = toSvg(canvas, colours)
  if (dropped !== 0) throw new Error('dropped: ' + String(dropped))
  if (!markup.includes('stroke-dasharray="4 3"')) throw new Error('the boundary is not dashed')
  if (markup.includes('<Core')) throw new Error('the group label reached the markup unescaped')
  if (!markup.includes('&lt;Core &amp; Edge&gt;')) throw new Error('the group label is missing')
})

test('a subgraph in mermaid reaches the drawing as a boundary', () => {
  const source = ['graph TD', '  subgraph Core', '    a --> b', '  end', '  b --> c'].join(String.fromCharCode(10))
  const rendered = render({ source })
  const group = rendered.canvas.shapes.find((shape) => shape.kind === 'group')
  if (group === undefined) throw new Error('the subgraph produced no boundary')
  if (group.label !== 'Core') throw new Error('label: ' + group.label)
})

test('a nested group sits inside its parent', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }, { id: 'c', role: 'normal' }],
    edges: [],
    groups: [
      { id: 'outer', label: 'Outer', members: ['a', 'b', 'c'] },
      { id: 'inner', label: 'Inner', members: ['b', 'c'] },
    ],
    caption: 'graph',
  }
  const { canvas } = paintWith(diagram)
  const outer = canvas.shapes.find((shape) => shape.kind === 'group' && shape.label === 'Outer')
  const inner = canvas.shapes.find((shape) => shape.kind === 'group' && shape.label === 'Inner')
  if (outer === undefined || inner === undefined) throw new Error('a boundary is missing')
  const inside = inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
  if (!inside) throw new Error('the nested boundary escaped its parent')
})

test('a group stacks its members inside its own boundary', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }],
    edges: [{ from: 'a', label: 'next', to: 'b' }],
    groups: [{ id: 'g', label: 'Both', members: ['a', 'b'] }],
    caption: 'graph',
  }
  const { canvas } = paintWith(diagram)
  const group = canvas.shapes.find((shape) => shape.kind === 'group')
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  for (const box of boxes) {
    if (box.x < group.x || box.y < group.y || box.x + box.width > group.x + group.width || box.y + box.height > group.y + group.height) {
      throw new Error('a member was placed outside its own group')
    }
  }
  // Stacked, not side by side: the second member starts below the first.
  const [first, second] = [...boxes].sort((left, right) => left.y - right.y)
  if (second.y <= first.y + first.height) throw new Error('members are not stacked')
})

test('a member claimed by two groups belongs to the first', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }],
    edges: [],
    groups: [
      { id: 'first', label: 'First', members: ['a'] },
      { id: 'second', label: 'Second', members: ['a', 'b'] },
    ],
    caption: 'graph',
  }
  const boxes = paintWith(diagram).canvas.shapes.filter((shape) => shape.kind === 'box')
  if (boxes.length !== 2) throw new Error('a state was drawn ' + String(boxes.length) + ' times')
})

test('a diagram without groups still lays out in ranks', () => {
  const diagram = {
    kind: 'machine',
    title: 't',
    init: 'a',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }, { id: 'c', role: 'normal' }],
    edges: [
      { from: 'a', label: 'x', to: 'b' },
      { from: 'a', label: 'y', to: 'c' },
    ],
    caption: 'pass',
  }
  const boxes = paintWith(diagram).canvas.shapes.filter((shape) => shape.kind === 'box')
  const rows = new Map()
  for (const box of boxes) rows.set(box.y, (rows.get(box.y) ?? 0) + 1)
  if (rows.size !== 2) throw new Error('rows: ' + String(rows.size))
})

test('two groups that overlap without containing each other are siblings, not nested', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }, { id: 'c', role: 'normal' }],
    edges: [],
    groups: [
      { id: 'left', label: 'Left', members: ['a', 'b'] },
      { id: 'right', label: 'Right', members: ['b', 'c'] },
    ],
    caption: 'graph',
  }
  const { canvas } = paintWith(diagram)
  const groups = canvas.shapes.filter((shape) => shape.kind === 'group')
  if (groups.length !== 2) throw new Error('boundaries: ' + String(groups.length))
  // Neither boundary may sit entirely inside the other: they overlap over `b`, which is not containment.
  const [first, second] = groups
  const inside = (inner, outer) => inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
  if (inside(first, second) || inside(second, first)) throw new Error('an overlapping group was drawn as nested')
})

test('a boundary whose members are all unknown is not drawn', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }],
    edges: [],
    groups: [
      { id: 'outer', label: 'Outer', members: ['a', 'ghost'] },
      { id: 'inner', label: 'Inner', members: ['ghost'] },
    ],
    caption: 'graph',
  }
  const { canvas } = paintWith(diagram)
  const labels = canvas.shapes.filter((shape) => shape.kind === 'group').map((shape) => shape.label)
  if (labels.includes('Inner')) throw new Error('a boundary with no real member was drawn')
  if (!labels.includes('Outer')) throw new Error('the boundary that does have a member was dropped')
})

test('a nested boundary inside an empty one is dropped with its parent', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }],
    edges: [],
    groups: [
      { id: 'empty', label: 'Empty', members: ['ghost'] },
      { id: 'child', label: 'Child', members: ['ghost', 'a'] },
    ],
    caption: 'graph',
  }
  const labels = paintWith(diagram).canvas.shapes.filter((shape) => shape.kind === 'group').map((shape) => shape.label)
  if (!labels.includes('Child')) throw new Error('the boundary with a real member was dropped: ' + labels.join(','))
})

test('a declared parent wins over an inferred one', () => {
  // `inner`'s members are not a subset of `outer`'s, so inference could not place it; the source did.
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }],
    edges: [],
    groups: [
      { id: 'outer', label: 'Outer', members: ['a'] },
      { id: 'inner', label: 'Inner', members: ['b'], parent: 'outer' },
    ],
    caption: 'graph',
  }
  const { canvas } = paintWith(diagram)
  const outer = canvas.shapes.find((shape) => shape.kind === 'group' && shape.label === 'Outer')
  const inner = canvas.shapes.find((shape) => shape.kind === 'group' && shape.label === 'Inner')
  if (outer === undefined || inner === undefined) throw new Error('a boundary is missing')
  const inside = inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
  if (!inside) throw new Error('the declared child was not drawn inside its parent')
})

test('a parent that does not exist is ignored, not fatal', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }],
    edges: [],
    groups: [{ id: 'g', label: 'Orphan', members: ['a'], parent: 'nowhere' }],
    caption: 'graph',
  }
  const groups = paintWith(diagram).canvas.shapes.filter((shape) => shape.kind === 'group')
  if (groups.length !== 1) throw new Error('boundaries: ' + String(groups.length))
})

test('a parent cycle is broken instead of recursing forever', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }],
    edges: [],
    groups: [
      { id: 'x', label: 'X', members: ['a'], parent: 'y' },
      { id: 'y', label: 'Y', members: ['b'], parent: 'x' },
    ],
    caption: 'graph',
  }
  const groups = paintWith(diagram).canvas.shapes.filter((shape) => shape.kind === 'group')
  if (groups.length !== 2) throw new Error('boundaries: ' + String(groups.length))
})

test('an overlapping boundary of a different size is not a container', () => {
  // `left` is smaller than `right` but not contained in it, so the subset test must reject rather than nest.
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }, { id: 'c', role: 'normal' }, { id: 'd', role: 'normal' }],
    edges: [],
    groups: [
      { id: 'left', label: 'Left', members: ['a', 'b'] },
      { id: 'right', label: 'Right', members: ['b', 'c', 'd'] },
    ],
    caption: 'graph',
  }
  const groups = paintWith(diagram).canvas.shapes.filter((shape) => shape.kind === 'group')
  if (groups.length !== 2) throw new Error('boundaries: ' + String(groups.length))
  const [first, second] = groups
  const inside = (inner, outer) => inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
  if (inside(first, second) || inside(second, first)) throw new Error('an overlapping boundary was nested')
})

test('the tightest of several would-be containers wins', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id, role: 'normal' })),
    edges: [],
    groups: [
      { id: 'large', label: 'Large', members: ['a', 'b', 'c', 'd'] },
      { id: 'big', label: 'Big', members: ['a', 'b', 'c'] },
      { id: 'mid', label: 'Mid', members: ['a', 'b'] },
    ],
    caption: 'graph',
  }
  const { canvas } = paintWith(diagram)
  const large = canvas.shapes.find((shape) => shape.kind === 'group' && shape.label === 'Large')
  const big = canvas.shapes.find((shape) => shape.kind === 'group' && shape.label === 'Big')
  const mid = canvas.shapes.find((shape) => shape.kind === 'group' && shape.label === 'Mid')
  if (large === undefined || big === undefined || mid === undefined) throw new Error('a boundary is missing')
  const inside = (inner, outer) => inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
  if (!inside(mid, big)) throw new Error('mid is not inside big')
  if (!inside(big, large)) throw new Error('big is not inside large')
})

test('the inference picks the tightest container when two would do', () => {
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }, { id: 'c', role: 'normal' }],
    edges: [],
    groups: [
      { id: 'big', label: 'Big', members: ['a', 'b', 'c'] },
      { id: 'mid', label: 'Mid', members: ['a', 'b'] },
    ],
    caption: 'graph',
  }
  const { canvas } = paintWith(diagram)
  const big = canvas.shapes.find((shape) => shape.kind === 'group' && shape.label === 'Big')
  const mid = canvas.shapes.find((shape) => shape.kind === 'group' && shape.label === 'Mid')
  if (big === undefined || mid === undefined) throw new Error('a boundary is missing')
  const inside = (inner, outer) => inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height
  if (!inside(mid, big)) throw new Error('the tighter boundary was not nested in the looser one')
})

test('an empty diagram is the drawing that has nothing to draw', () => {
  const empty = emptyDiagram('t', 'nothing here')
  if (empty.kind !== 'none') throw new Error('kind: ' + empty.kind)
  if (empty.nodes.length !== 0 || empty.edges.length !== 0) throw new Error('an empty diagram carries shapes')
  if (empty.caption !== 'nothing here') throw new Error('caption: ' + empty.caption)
  const { canvas } = paintWith(empty)
  if (canvas.shapes.some((shape) => shape.kind === 'box')) throw new Error('boxes appeared from nowhere')
})

test('a node draws its label when a notation gave one, and its id when it did not', () => {
  if (labelOf({ id: 'a', role: 'normal' }) !== 'a') throw new Error('id was not used')
  if (labelOf({ id: 'a', label: 'Alpha', role: 'normal' }) !== 'Alpha') throw new Error('label was ignored')
  // An empty label is not a label: the id is what identifies the box.
  if (labelOf({ id: 'a', label: '', role: 'normal' }) !== 'a') throw new Error('an empty label was used')
})

test('a break in a label is a line end, in every spelling a source uses', () => {
  for (const spelling of ['a<br>b', 'a<br/>b', 'a<br />b', 'a\nb']) {
    const lines = explicitLines(spelling)
    if (lines.length !== 2 || lines[0] !== 'a' || lines[1] !== 'b') throw new Error(spelling + ' -> ' + JSON.stringify(lines))
  }
})

test('a long label wraps instead of running off its box', () => {
  const measured = measure('Attach order to the existing account')
  if (measured.lines.length < 2) throw new Error('not wrapped: ' + JSON.stringify(measured.lines))
  for (const line of measured.lines) {
    if (line.length > MAX_LINE_CHARS) throw new Error('line over the limit: ' + line)
  }
  // The box is sized for the longest line it actually draws, not for the whole label.
  if (measured.width > MAX_NODE_WIDTH) throw new Error('width over the maximum: ' + String(measured.width))
  if (measured.height !== measured.lines.length * LINE_HEIGHT + TEXT_PADDING) throw new Error('height: ' + String(measured.height))
})

test('a word with no space in it is broken rather than allowed to overflow', () => {
  const lines = wrapLine('a'.repeat(MAX_LINE_CHARS + 5))
  if (lines.length !== 2) throw new Error('lines: ' + JSON.stringify(lines.length))
  if (lines.some((line) => line.length > MAX_LINE_CHARS)) throw new Error('a piece is longer than the limit')
})

test('the box follows the text: two lines are taller than one, and a longer label is wider', () => {
  const one = measure('Notify the warehouse')
  const two = measure('Notify the warehouse<br/>and the carrier')
  if (!(two.height > one.height)) throw new Error('height did not grow: ' + String(one.height) + ' -> ' + String(two.height))
  if (!(two.width >= one.width)) throw new Error('width shrank')
})

test('a rendered drawing keeps its text inside its boxes', () => {
  const source = [
    'graph TD',
    '  a[Order intake service<br/>validates and enqueues] --> b{Is the customer already known?}',
    '  b -->|yes, existing account| c[Attach order to the existing account]',
    '  b -->|no, new customer| d[Create an account then attach]',
  ].join(String.fromCharCode(10))
  const { canvas } = paintWith(render({ source }).diagram)
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  for (const box of boxes) {
    if (box.lines === undefined || box.lines.length === 0) throw new Error('a box has no lines: ' + box.label)
    const widest = Math.max(...box.lines.map((line) => textWidth(line)))
    if (widest > box.width + 1) throw new Error('"' + box.label + '" needs ' + String(Math.round(widest)) + ' but its box is ' + String(Math.round(box.width)))
    if (box.lines.length * LINE_HEIGHT > box.height) throw new Error('"' + box.label + '" has more lines than its box holds')
  }
})

test('an edge label is not drawn on top of a box', () => {
  const source = [
    'graph TD',
    '  subgraph Ingest',
    '    a[Order intake service] --> b{Is the customer known?}',
    '    b -->|yes, existing account| c[Attach to the account]',
    '    b -->|no, new customer| d[Create an account]',
    '  end',
  ].join(String.fromCharCode(10))
  const { canvas } = paintWith(render({ source }).diagram)
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  const labels = canvas.shapes.filter((shape) => (shape.kind === 'link' || shape.kind === 'path') && shape.label !== '')
  for (const label of labels) {
    const width = textWidth(label.label)
    const left = label.labelX - width / 2
    for (const box of boxes) {
      const overlaps = left < box.x + box.width && left + width > box.x && label.labelY < box.y + box.height && label.labelY + 12 > box.y
      if (overlaps) {
        throw new Error('label "' + label.label + '" lands on box "' + String(box.label) + '"')
      }
    }
  }
})

test('the canvas covers what was drawn, including an edge that runs beside the boxes', () => {
  const source = [
    'graph TD',
    '  a[First] --> b[Second]',
    '  b --> c[Third]',
    '  c -->|drift found, reconciling| a',
  ].join(String.fromCharCode(10))
  const { canvas } = paintWith(render({ source }).diagram)
  for (const shape of canvas.shapes) {
    if (shape.kind === 'box' || shape.kind === 'group') {
      if (shape.x + shape.width > canvas.width) throw new Error('a box reaches past the canvas')
      continue
    }
    if (shape.kind === 'path') {
      for (const point of shape.points) {
        if (point.x > canvas.width) throw new Error('a path leaves the canvas at ' + String(point.x) + ' of ' + String(canvas.width))
      }
      if (shape.label !== '' && shape.labelX + textWidth(shape.label) / 2 > canvas.width) throw new Error('a path label leaves the canvas')
    }
  }
})

test('a label that is only a break draws an empty line, not a crash', () => {
  const lines = explicitLines('a<br>')
  if (lines.length !== 2 || lines[1] !== '') throw new Error('trailing break: ' + JSON.stringify(lines))
  if (wrapLine('').join('') !== '') throw new Error('an empty line did not stay empty')
  // A line of nothing but spaces has no word to wrap: it collapses to one empty line rather than disappearing.
  const blank = wrapLine('    ')
  if (blank.length !== 1 || blank[0] !== '') throw new Error('blank line: ' + JSON.stringify(blank))
})

test('a box written without pre-wrapped lines still draws its label', () => {
  const { markup } = toSvg({
    width: 200,
    height: 80,
    shapes: [{ kind: 'box', x: 10, y: 10, width: 120, height: 34, label: 'Single line', colour: 'normal', initial: false }],
  }, palette())
  if (!markup.includes('<tspan') || !markup.includes('Single line')) throw new Error('the label was not drawn')
})

test('a box in the way of an edge is routed around, not through', () => {
  const from = { x: 0, y: 0, width: 100, height: 40 }
  const to = { x: 0, y: 200, width: 100, height: 40 }
  const between = { x: 0, y: 100, width: 100, height: 40 }
  const route = routeEdge(from, to, [from, to, between])
  if (!route.routed) throw new Error('the edge was not routed')
  if (route.points.length < 3) throw new Error('a detour needs at least three points: ' + JSON.stringify(route.points))
  for (let index = 0; index + 1 < route.points.length; index += 1) {
    const a = route.points[index]
    const b = route.points[index + 1]
    if (crossesBox(a.x, a.y, b.x, b.y, between)) throw new Error('the route still crosses the box: ' + JSON.stringify(a) + ' -> ' + JSON.stringify(b))
  }
})

test('an edge with nothing in its way stays a straight segment', () => {
  const from = { x: 0, y: 0, width: 100, height: 40 }
  const to = { x: 0, y: 200, width: 100, height: 40 }
  const route = routeEdge(from, to, [from, to])
  if (route.routed) throw new Error('a clear edge was routed as a detour')
  if (route.points.length !== 2) throw new Error('points: ' + JSON.stringify(route.points))
})

test('the route leaves the side that faces the target and arrives at the side that faces back', () => {
  const from = { x: 0, y: 0, width: 100, height: 40 }
  const right = { x: 300, y: 0, width: 100, height: 40 }
  const below = { x: 0, y: 300, width: 100, height: 40 }
  if (approachSides(from, right).exit !== 'right' || approachSides(from, right).entry !== 'left') throw new Error('horizontal sides')
  if (approachSides(from, below).exit !== 'bottom' || approachSides(from, below).entry !== 'top') throw new Error('vertical sides')
  const exit = anchor(from, 'bottom')
  if (exit.x !== 50 || exit.y !== 40) throw new Error('bottom anchor: ' + JSON.stringify(exit))
})

test('collinear points are dropped, so a route carries only its corners', () => {
  const points = simplify([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }])
  if (points.length !== 3) throw new Error('points: ' + JSON.stringify(points))
  if (points[1].x !== 100 || points[1].y !== 0) throw new Error('the corner moved: ' + JSON.stringify(points[1]))
})

test('a route never crosses the box it was routed around, however it got there', () => {
  const from = { x: 0, y: 0, width: 100, height: 40 }
  const to = { x: 0, y: 300, width: 100, height: 40 }
  const wall = { x: -1000, y: 50, width: 3000, height: 200 }
  const route = routeEdge(from, to, [from, to, wall])
  // Going around the end of the wall is a legitimate route; crossing it is not, whether or not a search ran.
  for (let index = 0; index + 1 < route.points.length; index += 1) {
    const a = route.points[index]
    const b = route.points[index + 1]
    if (crossesBox(a.x, a.y, b.x, b.y, wall)) throw new Error('the route crosses the wall: ' + JSON.stringify(route.points))
  }
})

test('a rendered drawing carries no edge through a box', () => {
  const source = [
    'graph TD',
    '  a[Gateway] --> b[Auth service]',
    '  a --> c[Order service]',
    '  a --> d[Stock service]',
    '  c --> e[(Orders)]',
    '  d --> e',
    '  a -->|health probe, every 30s| e',
  ].join(String.fromCharCode(10))
  const { canvas } = paintWith(render({ source }).diagram)
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  const crossings = []
  for (const shape of canvas.shapes) {
    if (shape.kind === 'link') {
      for (const box of boxes) if (crossesBox(shape.x1, shape.y1, shape.x2, shape.y2, box)) crossings.push('a link crosses "' + box.label + '"')
      continue
    }
    if (shape.kind !== 'path') continue
    for (let index = 0; index + 1 < shape.points.length; index += 1) {
      const a = shape.points[index]
      const b = shape.points[index + 1]
      for (const box of boxes) if (crossesBox(a.x, a.y, b.x, b.y, box)) crossings.push('a path crosses "' + box.label + '"')
    }
  }
  if (crossings.length > 0) throw new Error(crossings.join('; '))
})

test('a diagonal that misses every box is not a crossing, and a short route needs no simplification', () => {
  const box = { x: 100, y: 100, width: 50, height: 50 }
  if (crossesBox(0, 0, 60, 60, box)) throw new Error('a clear diagonal was reported as a crossing')
  if (!crossesBox(0, 0, 200, 200, box)) throw new Error('a diagonal through the box was missed')
  const two = simplify([{ x: 0, y: 0 }, { x: 10, y: 10 }])
  if (two.length !== 2) throw new Error('a two-point route was changed')
})

test('a caller can pin the anchors an edge leaves and enters by', () => {
  const from = { x: 0, y: 0, width: 100, height: 40 }
  const to = { x: 400, y: 0, width: 100, height: 40 }
  const route = routeEdge(from, to, [from, to], { exit: { x: 100, y: 20 }, entry: { x: 400, y: 20 } })
  if (route.routed) throw new Error('a clear route was sent on a detour')
  if (route.points[0].x !== 100 || route.points[1].x !== 400) throw new Error('the anchors were ignored: ' + JSON.stringify(route.points))
})

test('a target walled in on every side keeps its edge rather than losing it', () => {
  // Four boxes drawn as a closed ring around the target: no lane reaches its top edge, so the search cannot finish.
  const from = { x: 0, y: 0, width: 100, height: 40 }
  const to = { x: 0, y: 400, width: 100, height: 40 }
  const ring = [
    { x: -30, y: 340, width: 160, height: 12 },
    { x: -30, y: 488, width: 160, height: 12 },
    { x: -42, y: 340, width: 12, height: 160 },
    { x: 130, y: 340, width: 12, height: 160 },
  ]
  const route = routeEdge(from, to, [from, to, ...ring])
  if (route.routed) throw new Error('a closed ring reported a route')
  if (route.points.length !== 2) throw new Error('the edge was not kept: ' + JSON.stringify(route.points))
})

test('a long chain is wrapped into columns instead of one endless drop', () => {
  const nodes = []
  const edges = []
  for (let index = 0; index < 12; index += 1) nodes.push({ id: 'n' + String(index), role: 'normal' })
  for (let index = 0; index + 1 < nodes.length; index += 1) edges.push({ from: 'n' + String(index), label: '', to: 'n' + String(index + 1) })
  const { canvas } = paintWith({ kind: 'graph', title: 't', nodes, edges, caption: 'pass' })
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  const columns = new Set(boxes.map((box) => Math.round(box.x)))
  if (columns.size < 2) throw new Error('a twelve-step chain was left in one column')
  if (canvas.height > canvas.width * 3) throw new Error('the drawing is still a strip: ' + String(canvas.width) + 'x' + String(canvas.height))
})

test('three rows are left as one column, because a short stack reads better stacked', () => {
  const nodes = [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }, { id: 'c', role: 'normal' }]
  const edges = [{ from: 'a', label: '', to: 'b' }, { from: 'b', label: '', to: 'c' }]
  const { canvas } = paintWith({ kind: 'graph', title: 't', nodes, edges, caption: 'pass' })
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  if (new Set(boxes.map((box) => Math.round(box.x))).size !== 1) throw new Error('a three-row drawing was wrapped')
})

test('a boundary orders its children by what connects to them, not by where they were written', () => {
  // `later` is written first but only `first` connects to the node above the group, so `first` has to come first.
  const diagram = {
    kind: 'graph',
    title: 't',
    nodes: [
      { id: 'top', role: 'normal' },
      { id: 'later', role: 'normal' },
      { id: 'first', role: 'normal' },
    ],
    edges: [
      { from: 'top', label: '', to: 'first' },
      { from: 'first', label: '', to: 'later' },
    ],
    groups: [{ id: 'g', label: 'Package', members: ['later', 'first'] }],
    caption: 'pass',
  }
  const { canvas } = paintWith(diagram)
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  const first = boxes.find((box) => box.label === 'first')
  const later = boxes.find((box) => box.label === 'later')
  if (first.y >= later.y) throw new Error('the connected child was not placed above the unrelated one')
})

if (failures > 0) {
  console.log(NL + 'render tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all render tests passed')

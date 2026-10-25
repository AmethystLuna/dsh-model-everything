// White-box suite for the renderer's pure half.
//
// Everything a drawing decides is decided here, in Node, with no browser: which nodes exist, what row each
// sits in, what shape is emitted, and what the markup says. The input is the shape the host actually hands a
// tool view - a lazy arguments view plus content blocks once settled - because that shape is what the first
// version of this code guessed wrong: the card said "no report yet" for a report that was right there.
import { palette, roleForVerdict } from '../../lib/render/palette.js'
import { rankStates } from '../../lib/render/layout.js'
import { paintWith } from '../../lib/render/paint.js'
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

if (failures > 0) {
  console.log(NL + 'render tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all render tests passed')

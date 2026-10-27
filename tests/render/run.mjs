// White-box suite for the renderer's pure half.
//
// Everything a drawing decides is decided here, in Node, with no browser: which nodes exist, what row each
// sits in, what shape is emitted, and what the markup says. The input is the shape the host actually hands a
// tool view - a lazy arguments view plus content blocks once settled - because that shape is what the first
// version of this code guessed wrong: the card said "no report yet" for a report that was right there.
import { palette, roleForVerdict, schemeNames } from '../../lib/render/palette.js'
import { rankStates } from '../../lib/render/layout.js'
import { LABEL_HEIGHT, MULTI_EDGE_SPACING, paint, paintWith } from '../../lib/render/paint.js'
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

/**
 * Every edge label the writer emitted, as the mask rectangle it was drawn over and the text inside it.
 *
 * A label is a rectangle in the page colour followed by centred text; reading both together is what makes the
 * markup say "this word sits on that line" rather than "this word is somewhere near it".
 */
const labelBlocks = (markup) =>
  [...markup.matchAll(/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="([^"]+)" \/><text x="(-?[\d.]+)" y="(-?[\d.]+)" font-size="10" text-anchor="middle" fill="([^"]+)">([^<]*)<\/text>/g)].map(
    (match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      width: Number(match[3]),
      height: Number(match[4]),
      fill: match[5],
      textX: Number(match[6]),
      textY: Number(match[7]),
      textFill: match[8],
      text: match[9],
    }),
  )

test('an edge with no event writes no label element', () => {
  const { canvas, colours } = paintWith({
    kind: 'machine',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }],
    edges: [{ from: 'a', to: 'b', label: '' }],
    caption: 'pass',
  })
  const { markup } = toSvg(canvas, colours)
  if (labelBlocks(markup).length !== 0) throw new Error('an empty label was written')
  // The near miss: the same drawing with an event does emit one, so the assertion above is about the label and
  // not about a markup shape the writer never produces.
  const labelled = paintWith({
    kind: 'machine',
    title: 't',
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }],
    edges: [{ from: 'a', to: 'b', label: 'go' }],
    caption: 'pass',
  })
  const blocks = labelBlocks(toSvg(labelled.canvas, labelled.colours).markup)
  if (blocks.length !== 1 || blocks[0].text !== 'go') throw new Error('a labelled edge wrote ' + JSON.stringify(blocks))
})

test('a label is written over a mask in the page colour, centred on the point the painter chose', () => {
  const { canvas, colours } = paintWith(view())
  const { markup } = toSvg(canvas, colours)
  const labelled = canvas.shapes.filter((shape) => (shape.kind === 'link' || shape.kind === 'path') && shape.label !== '')
  const blocks = labelBlocks(markup)
  if (labelled.length === 0) throw new Error('the fixture carries no label to write')
  if (blocks.length !== labelled.length) throw new Error(String(blocks.length) + ' labels written for ' + String(labelled.length) + ' edges')
  for (const [index, block] of blocks.entries()) {
    const shape = labelled[index]
    if (block.text !== shape.label) throw new Error('label text: ' + block.text)
    // A mask of no width masks nothing, and the line shows through the word.
    if (!(block.width > 0) || !(block.height > 0)) throw new Error('label "' + block.text + '" has an empty mask')
    if (block.fill !== colours.background) throw new Error('label "' + block.text + '" is masked in ' + block.fill + ', not the page colour')
    // The label keeps the colour it has always had: the mask is geometry, not emphasis.
    if (block.textFill !== colours.muted) throw new Error('label "' + block.text + '" changed colour to ' + block.textFill)
    if (Math.abs(block.textX - (block.x + block.width / 2)) > 0.2) throw new Error('label "' + block.text + '" is not centred in its mask')
    if (Math.abs(block.textX - shape.labelX) > 0.2 || Math.abs(block.textY - 3.5 - shape.labelY) > 0.2) {
      throw new Error('the mask of "' + block.text + '" is not where the painter put the label')
    }
  }
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
  // The golden holds the label on its line as well as the shapes: `yes` is centred on x=64, the line's own x, over
  // a mask from 54.1 to 73.9, so the line it names is interrupted by the word and nothing else is.
  const golden =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 283" width="240" height="283" role="img" aria-label="mermaid: graph, 3 boxes, 2 arrows" font-family="system-ui, -apple-system, Segoe UI, sans-serif"><rect x="0" y="0" width="240" height="283" fill="#ffffff" /><rect x="20" y="46" width="88" height="27" rx="6" fill="transparent" stroke="#6b7280" stroke-width="1" /><text font-size="11" text-anchor="middle" fill="#6b7280"><tspan x="64" y="63.5">Start</tspan></text><polygon points="64,127,108,140.5,64,154,20,140.5" fill="transparent" stroke="#6b7280" stroke-width="1" /><text font-size="11" text-anchor="middle" fill="#6b7280"><tspan x="64" y="144.5">Check</tspan></text><rect x="20" y="208" width="88" height="27" rx="6" fill="transparent" stroke="#6b7280" stroke-width="1" /><text font-size="11" text-anchor="middle" fill="#6b7280"><tspan x="64" y="225.5">Done</tspan></text><line x1="64" y1="73" x2="64" y2="127" stroke="#6b7280" stroke-width="1" /><polygon points="64,127 60.8,120 67.2,120" fill="#6b7280" /><line x1="64" y1="154" x2="64" y2="208" stroke="#6b7280" stroke-width="1" /><polygon points="64,208 60.8,201 67.2,201" fill="#6b7280" /><rect x="54.1" y="175" width="19.8" height="12" fill="#ffffff" /><text x="64" y="184.5" font-size="10" text-anchor="middle" fill="#9aa3ad">yes</text><text x="20" y="32" font-size="12" fill="#1f2933">mermaid</text><text x="20" y="262" font-size="10" text-anchor="middle" fill="#6b7280"><tspan x="20" dy="0">graph, 3 boxes, 2 arrows</tspan></text></svg>'
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

// ---------------------------------------------------------------------------------------- multi-edges between one pair

/** The points a link or a path draws, in drawing order. */
const routePointsOf = (shape) =>
  shape.kind === 'link' ? [{ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }] : shape.points

/** The segments a link or a path draws, so two edges can be compared for a shared run. */
const segmentsOfShape = (shape) => {
  const points = routePointsOf(shape)
  const out = []
  for (let index = 0; index + 1 < points.length; index += 1) {
    out.push({ x1: points[index].x, y1: points[index].y, x2: points[index + 1].x, y2: points[index + 1].y })
  }
  return out
}

/** Do two edges run along one line with an overlap? Two relations may cross; they may not be drawn as one line. */
const sharesSegment = (left, right) =>
  left.some((p) =>
    right.some((q) => {
      const horizontal = Math.abs(p.y1 - p.y2) < 0.5 && Math.abs(q.y1 - q.y2) < 0.5 && Math.abs(p.y1 - q.y1) < 0.5
      const vertical = Math.abs(p.x1 - p.x2) < 0.5 && Math.abs(q.x1 - q.x2) < 0.5 && Math.abs(p.x1 - q.x1) < 0.5
      if (!horizontal && !vertical) return false
      return horizontal
        ? Math.max(Math.min(p.x1, p.x2), Math.min(q.x1, q.x2)) < Math.min(Math.max(p.x1, p.x2), Math.max(q.x1, q.x2)) - 0.5
        : Math.max(Math.min(p.y1, p.y2), Math.min(q.y1, q.y2)) < Math.min(Math.max(p.y1, p.y2), Math.max(q.y1, q.y2)) - 0.5
    }),
  )

/** A drawing whose only edges are the ones given, between two boxes in two rows. */
const pairDiagram = (edges) => ({
  kind: 'machine',
  title: 't',
  init: 'a',
  nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }],
  edges: edges.map((edge) => ({ from: 'a', label: '', to: 'b', ...edge })),
  caption: 'pass',
})

/** The link-or-path shapes of a canvas, in edge order. */
const routesOf = (canvas) => canvas.shapes.filter((shape) => shape.kind === 'link' || shape.kind === 'path')

test('two edges between one pair take a port each and share no segment', () => {
  const { canvas } = paintWith(pairDiagram([{ arrow: 'association' }, { arrow: 'composition' }]))
  const routes = routesOf(canvas)
  if (routes.length !== 2) throw new Error('edges drawn: ' + String(routes.length))
  const target = canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === 'b')
  const ends = routes.map((shape) => routePointsOf(shape)[routePointsOf(shape).length - 1])
  for (const end of ends) if (end.y !== target.y) throw new Error('a port is not on the target top side: ' + JSON.stringify(end))
  if (ends[0].x === ends[1].x) throw new Error('the two edges share a target port: ' + String(ends[0].x))
  const middle = target.x + target.width / 2
  if (ends[0].x !== middle) throw new Error('the first edge did not keep the middle: ' + String(ends[0].x) + ' vs ' + String(middle))
  if (ends[1].x !== middle + MULTI_EDGE_SPACING) throw new Error('the second edge is not one spacing over: ' + String(ends[1].x))
  // Both ends differ, not only the target: two edges that met at one box would still read as one edge there.
  const starts = routes.map((shape) => routePointsOf(shape)[0])
  if (starts[0].x === starts[1].x) throw new Error('the two edges share a source port')
  if (sharesSegment(segmentsOfShape(routes[0]), segmentsOfShape(routes[1]))) throw new Error('the two edges share a segment')
})

test('three edges between one pair stay distinct and take the fan in order', () => {
  const { canvas } = paintWith(pairDiagram([{}, { arrow: 'composition' }, { arrow: 'aggregation' }]))
  const routes = routesOf(canvas)
  if (routes.length !== 3) throw new Error('edges drawn: ' + String(routes.length))
  const target = canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === 'b')
  const middle = target.x + target.width / 2
  const ends = routes.map((shape) => routePointsOf(shape)[routePointsOf(shape).length - 1])
  const offsets = ends.map((end) => end.x - middle)
  if (JSON.stringify(offsets) !== JSON.stringify([0, MULTI_EDGE_SPACING, -MULTI_EDGE_SPACING])) {
    throw new Error('the fan is not 0, +1, -1: ' + JSON.stringify(offsets))
  }
  if (new Set(ends.map((end) => end.x)).size !== 3) throw new Error('two of the three share a port')
  for (let left = 0; left < routes.length; left += 1) {
    for (let right = left + 1; right < routes.length; right += 1) {
      if (sharesSegment(segmentsOfShape(routes[left]), segmentsOfShape(routes[right]))) {
        throw new Error('edges ' + String(left) + ' and ' + String(right) + ' share a segment')
      }
    }
  }
  // The fan is ordered, not just distinct: the third edge is left of the first, which is left of the second.
  if (!(ends[2].x < ends[0].x && ends[0].x < ends[1].x)) throw new Error('the fan is not ordered: ' + JSON.stringify(ends.map((end) => end.x)))
})

test('two long edges between one pair run on two lanes', () => {
  const source = ['graph TD', '  a[A] --> b[B]', '  b --> c[C]', '  a --> c', '  a --> c'].join(String.fromCharCode(10))
  const routes = routesOf(paintWith(render({ source }).diagram).canvas)
  if (routes.length !== 4) throw new Error('edges drawn: ' + String(routes.length))
  const laneOf = (shape) => {
    let best
    for (const segment of segmentsOfShape(shape)) {
      if (Math.abs(segment.x1 - segment.x2) > 0.5) continue
      const length = Math.abs(segment.y2 - segment.y1)
      if (best === undefined || length > best.length) best = { x: segment.x1, length }
    }
    return best === undefined ? undefined : best.x
  }
  const left = laneOf(routes[2])
  const right = laneOf(routes[3])
  if (left === undefined || right === undefined) throw new Error('a long edge lost its lane')
  // The property is "two separate lanes", not "exactly one spacing apart": coordinate assignment decides where a lane
  // sits (the mean of its ends), and the fan only has to keep the two edges off each other. Pinning the distance made
  // the case fail the moment the coordinate stage improved.
  if (Math.abs(left - right) < MULTI_EDGE_SPACING * 0.5) {
    throw new Error('the two lanes are only ' + String(Math.abs(left - right)) + ' apart, so they read as one')
  }
  if (sharesSegment(segmentsOfShape(routes[2]), segmentsOfShape(routes[3]))) throw new Error('the two long edges share a segment')
})

test('a single edge is drawn exactly as before the fan', () => {
  // The guard against over-correction: a pair is a fan, one edge is the line it always was, byte for byte.
  const golden =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 192" width="240" height="192" role="img" aria-label="plantuml: plantuml, 2 boxes, 1 arrow" font-family="system-ui, -apple-system, Segoe UI, sans-serif"><rect x="0" y="0" width="240" height="192" fill="#ffffff" /><rect x="20" y="46" width="88" height="27" rx="6" fill="transparent" stroke="#6b7280" stroke-width="1" /><text font-size="11" text-anchor="middle" fill="#6b7280"><tspan x="64" y="63.5">API</tspan></text><rect x="20" y="117" width="88" height="27" rx="6" fill="transparent" stroke="#6b7280" stroke-width="1" /><text font-size="11" text-anchor="middle" fill="#6b7280"><tspan x="64" y="134.5">DB</tspan></text><line x1="64" y1="73" x2="64" y2="117" stroke="#6b7280" stroke-width="1" /><polygon points="64,117 60.8,110 67.2,110" fill="#6b7280" /><text x="20" y="32" font-size="12" fill="#1f2933">plantuml</text><text x="20" y="171" font-size="10" text-anchor="middle" fill="#6b7280"><tspan x="20" dy="0">plantuml, 2 boxes, 1 arrow</tspan></text></svg>'
  const markup = render({ source: '@startuml\nAPI --> DB\n@enduml' }).markup
  if (markup !== golden) throw new Error('a drawing with one edge changed: ' + markup)
})

test('a composition in a multi-edge keeps its diamond and the association keeps its head', () => {
  const rendered = render({ source: '@startuml\nAPI --> DB\nAPI *-- DB\n@enduml' })
  const heads = headsOf(rendered.markup)
  if (heads.length !== 2) throw new Error('heads drawn: ' + String(heads.length) + ' for two edges')
  const diamond = heads.find((head) => head.corners.length === 4)
  const arrow = heads.find((head) => head.corners.length === 3)
  if (diamond === undefined) throw new Error('the composition lost its diamond')
  if (arrow === undefined) throw new Error('the association lost its head')
  const boxes = rendered.canvas.shapes.filter((shape) => shape.kind === 'box')
  const api = boxes.find((box) => box.label === 'API')
  const db = boxes.find((box) => box.label === 'DB')
  // The diamond sits at the source end, on the box the edge leaves; the association's head on the target's edge.
  const diamondAt = diamond.corners[0].split(',')
  if (Number(diamondAt[1]) !== api.y + api.height) throw new Error('the diamond is not at the source: ' + diamond.corners[0])
  const arrowAt = arrow.corners[0].split(',')
  if (Number(arrowAt[1]) !== db.y) throw new Error('the association head is not at the target: ' + arrow.corners[0])
  if (diamondAt[0] === arrowAt[0]) throw new Error('the two edges are drawn on one line')
})

test('two identical mermaid edges are two edges, drawn apart', () => {
  // The property is a model-level one: Mermaid states no arrow, and its two `-->` lines are still two statements.
  const { diagram } = render({ source: ['graph TD', '  a[A] --> b[B]', '  a --> b'].join(String.fromCharCode(10)) })
  if (diagram.edges.length !== 2) throw new Error('edges in the model: ' + String(diagram.edges.length))
  if (diagram.edges.some((edge) => edge.arrow !== undefined)) throw new Error('a Mermaid edge gained an arrow type')
  const { canvas } = paintWith(diagram)
  const routes = routesOf(canvas)
  if (routes.length !== 2) throw new Error('edges drawn: ' + String(routes.length))
  const ends = routes.map((shape) => routePointsOf(shape)[routePointsOf(shape).length - 1])
  if (ends[0].x === ends[1].x) throw new Error('the two Mermaid edges share a port')
  if (sharesSegment(segmentsOfShape(routes[0]), segmentsOfShape(routes[1]))) throw new Error('the two Mermaid edges share a segment')
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
    // A pair carrying three relations: the fan moves each edge, and a fan is still a run of axis-aligned segments.
    '@startuml\nAPI --> DB\nAPI *-- DB\nAPI o-- DB\n@enduml',
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

// ------------------------------------------------------------------------------------------------ edge labels

/** The labels a canvas carries: the point each is centred on, and the rectangle its mask covers. */
const labelRectsOf = (canvas) =>
  canvas.shapes
    .filter((shape) => (shape.kind === 'link' || shape.kind === 'path') && shape.label !== '')
    .map((shape) => ({ label: shape.label, x: shape.labelX, y: shape.labelY, width: textWidth(shape.label), height: LABEL_HEIGHT }))

/** How far a point is from a drawn edge: zero means it lies on the line. */
const distanceToRoute = (shape, point) => {
  let best = Infinity
  for (const segment of segmentsOfShape(shape)) {
    const dx = Math.max(Math.min(segment.x1, segment.x2) - point.x, 0, point.x - Math.max(segment.x1, segment.x2))
    const dy = Math.max(Math.min(segment.y1, segment.y2) - point.y, 0, point.y - Math.max(segment.y1, segment.y2))
    best = Math.min(best, Math.hypot(dx, dy))
  }
  return best
}

/** Do two label rectangles overlap? The defect this whole change exists to prevent. */
const labelsOverlap = (left, right) =>
  left.x - left.width / 2 < right.x + right.width / 2 &&
  left.x + left.width / 2 > right.x - right.width / 2 &&
  left.y - left.height / 2 < right.y + right.height / 2 &&
  left.y + left.height / 2 > right.y - right.height / 2

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
  for (const label of labelRectsOf(canvas)) {
    for (const box of boxes) {
      const overlaps =
        label.x - label.width / 2 < box.x + box.width && label.x + label.width / 2 > box.x &&
        label.y - label.height / 2 < box.y + box.height && label.y + label.height / 2 > box.y
      if (overlaps) {
        throw new Error('label "' + label.label + '" lands on box "' + String(box.label) + '"')
      }
    }
  }
})

/** Does a label rectangle lie across a piece of line? Two points of padding, the margin the painter reserves. */
const labelHitsSegment = (spot, segment) =>
  spot.x + spot.width / 2 > Math.min(segment.x1, segment.x2) - 2 &&
  spot.x - spot.width / 2 < Math.max(segment.x1, segment.x2) + 2 &&
  spot.y + spot.height / 2 > Math.min(segment.y1, segment.y2) - 2 &&
  spot.y - spot.height / 2 < Math.max(segment.y1, segment.y2) + 2

test('a label is centred on its own line', () => {
  // Labels a reader actually meets: a decision's two branches, a long back edge, and a PlantUML pair whose edges
  // run side by side. Five points at two notches is the tolerance stated: rounding to a tenth, never a whole gap.
  const sources = [
    ['graph TD', '  a[Idea] --> b{Feasible?}', '  b -->|yes| c[Build]', '  b -->|no| d[Revise]', '  d -->|retry| a'].join(NL),
    ['graph TD', '  subgraph Ingest', '    a[Gateway] --> b[Auth]', '    b --> c[Order service]', '  end', '  c -->|handover| d[(Orders)]', '  d --> e[Warehouse]'].join(NL),
    ['@startuml', 'API --> DB : read', 'API *-- DB : owns', 'Cache --> API : miss', '@enduml'].join(NL),
  ]
  let seen = 0
  for (const source of sources) {
    const { canvas } = paintWith(render({ source }).diagram)
    for (const shape of routesOf(canvas)) {
      if (shape.label === '') continue
      seen += 1
      const distance = distanceToRoute(shape, { x: shape.labelX, y: shape.labelY })
      if (distance > 2) throw new Error('label "' + shape.label + '" is ' + distance.toFixed(1) + ' points off its own edge')
    }
  }
  if (seen < 5) throw new Error('only ' + String(seen) + ' labels were measured')
})

test('a label whose midpoint sits across another line moves off the crossing', () => {
  // Clearing a box and clearing another label are two of the three collisions. The third is another edge's line:
  // a label lying across one hides it, and the mask makes that worse than text next to it. In this drawing the
  // left branch's midpoint lies across the right branch's drop, and there is room above it on the same run.
  const source = [
    'graph TD',
    '  a[Start here] --> b{Choice?}',
    '  b -->|left, with a longer name| c[Left]',
    '  b -->|right, also long| d[Right]',
    '  c --> e[Merge]',
    '  d --> e',
    '  e -->|return| a',
  ].join(NL)
  const { canvas } = paintWith(render({ source }).diagram)
  const routes = routesOf(canvas)
  const shape = routes.find((route) => route.label === 'left, with a longer name')
  if (shape === undefined) throw new Error('the labelled branch was lost')
  const label = labelRectsOf(canvas).find((entry) => entry.label === 'left, with a longer name')
  const points = routePointsOf(shape)
  let longest = { from: points[0], to: points[1], length: -1 }
  for (let index = 0; index + 1 < points.length; index += 1) {
    const length = Math.abs(points[index].x - points[index + 1].x) + Math.abs(points[index].y - points[index + 1].y)
    if (length > longest.length) longest = { from: points[index], to: points[index + 1], length }
  }
  const middle = { x: (longest.from.x + longest.to.x) / 2, y: (longest.from.y + longest.to.y) / 2, width: label.width, height: label.height }
  const others = routes.filter((route) => route !== shape).flatMap((route) => segmentsOfShape(route))
  if (!others.some((segment) => labelHitsSegment(middle, segment))) {
    throw new Error('the fixture does not put the midpoint across another line, so nothing had to move')
  }
  const crossed = others.filter((segment) => labelHitsSegment(label, segment))
  if (crossed.length > 0) throw new Error('the label still lies across ' + String(crossed.length) + ' line(s) of other edges')
  if (distanceToRoute(shape, label) > 2) throw new Error('the label left its own edge')
})

test('two labels of a multi-edge do not overlap', () => {
  // Each statement gets its own line, one fan spacing apart, and each label is wider than that spacing: left at
  // their midpoints, the two words would sit on top of each other.
  const { canvas } = paintWith(pairDiagram([{ label: 'read' }, { label: 'owns', arrow: 'composition' }]))
  const labels = labelRectsOf(canvas)
  if (labels.length !== 2) throw new Error('labels: ' + String(labels.length))
  if (textWidth('read') <= MULTI_EDGE_SPACING) throw new Error('the fixture labels are too narrow to collide')
  const routes = routesOf(canvas)
  const midpoints = routes.map((shape) => {
    const points = routePointsOf(shape)
    return { label: 'midpoint', x: (points[0].x + points[points.length - 1].x) / 2, y: (points[0].y + points[points.length - 1].y) / 2, width: textWidth('read'), height: LABEL_HEIGHT }
  })
  if (!labelsOverlap(midpoints[0], midpoints[1])) throw new Error('the fixture does not put the two midpoints on top of each other')
  if (labelsOverlap(labels[0], labels[1])) throw new Error('the two labels of one pair are drawn on top of each other')
  const moved = labels.filter((label) => midpoints.some((middle) => Math.abs(label.y - middle.y) > 1))
  if (moved.length === 0) throw new Error('neither label moved, so the clearance was luck rather than a decision')
  for (const [index, label] of labels.entries()) {
    if (distanceToRoute(routes[index], label) > 2) throw new Error('label "' + label.label + '" left its own edge to avoid the other')
  }
})

test('a label whose midpoint lands on a box moves along its own segment, and stays on it', () => {
  // The `loop` edge runs up the left of the drawing, straight past a box that starts one point into the label's
  // width. So the midpoint is occupied and the label has to walk.
  const source = [
    'graph TD',
    '  a[A] --> b[B]',
    '  a --> c[C]',
    '  b --> d[D]',
    '  c --> d',
    '  d --> e[E]',
    '  e -->|loop| b',
    '  a --> e',
  ].join(NL)
  const { canvas } = paintWith(render({ source }).diagram)
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  const shape = routesOf(canvas).find((route) => route.label === 'loop')
  if (shape === undefined) throw new Error('the labelled back edge was lost')
  const points = routePointsOf(shape)
  // The longest run is the whole edge here, so its midpoint is the place the label would take if it never moved.
  let longest = { from: points[0], to: points[1], length: -1 }
  for (let index = 0; index + 1 < points.length; index += 1) {
    const length = Math.abs(points[index].x - points[index + 1].x) + Math.abs(points[index].y - points[index + 1].y)
    if (length > longest.length) longest = { from: points[index], to: points[index + 1], length }
  }
  const middle = { x: (longest.from.x + longest.to.x) / 2, y: (longest.from.y + longest.to.y) / 2 }
  const onBox = (spot) =>
    boxes.some((box) => spot.x - spot.width / 2 < box.x + box.width && spot.x + spot.width / 2 > box.x && spot.y - LABEL_HEIGHT / 2 < box.y + box.height && spot.y + LABEL_HEIGHT / 2 > box.y)
  const label = labelRectsOf(canvas).find((entry) => entry.label === 'loop')
  if (!onBox({ ...label, x: middle.x, y: middle.y })) throw new Error('the fixture does not put the midpoint on a box, so nothing had to move')
  if (Math.abs(label.y - middle.y) < 1) throw new Error('the label stayed on the box it had to clear')
  if (distanceToRoute(shape, label) > 2) throw new Error('the label left its segment while moving')
  if (onBox(label)) throw new Error('the label moved and is still on a box')
})

test('a self loop keeps its label beside the loop, the one label that cannot fit on its line', () => {
  // A self loop's longest run is eighteen points long. Its name does not fit in that, and masking the run would
  // put the word over the box it belongs to, so the label sits outside the loop by design.
  const source = ['graph TD', '  a[Only] -->|again| a'].join(NL)
  const { canvas } = paintWith(render({ source }).diagram)
  const shape = routesOf(canvas).find((route) => route.kind === 'path')
  if (shape === undefined) throw new Error('the self loop was not drawn as a loop')
  const label = labelRectsOf(canvas).find((entry) => entry.label === 'again')
  if (label === undefined) throw new Error('the loop label was dropped')
  const loopRight = Math.max(...shape.points.map((point) => point.x))
  if (label.x - label.width / 2 < loopRight) throw new Error('the loop label is on top of the loop')
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

/** Every place an edge passes through a box it does not attach to.
 *
 * A port may sit inside its own box's bounding box: a symbol need not fill it, and a cylinder's cap apex is inside.
 * So a segment that starts or ends strictly inside a box is that edge attaching to it; every other segment has to
 * clear every box, including the two the edge joins.
 */
const boxCrossings = (canvas) => {
  const boxes = canvas.shapes.filter((shape) => shape.kind === 'box')
  const attaches = (point, box) =>
    point.x > box.x + 0.5 && point.x < box.x + box.width - 0.5 && point.y > box.y + 0.5 && point.y < box.y + box.height - 0.5
  const crossings = []
  for (const shape of canvas.shapes) {
    if (shape.kind === 'link') {
      const from = { x: shape.x1, y: shape.y1 }
      const to = { x: shape.x2, y: shape.y2 }
      for (const box of boxes) {
        if (attaches(from, box) || attaches(to, box)) continue
        if (crossesBox(from.x, from.y, to.x, to.y, box)) crossings.push('a link crosses "' + box.label + '"')
      }
      continue
    }
    if (shape.kind !== 'path') continue
    for (let index = 0; index + 1 < shape.points.length; index += 1) {
      const a = shape.points[index]
      const b = shape.points[index + 1]
      for (const box of boxes) {
        if (attaches(a, box) || attaches(b, box)) continue
        if (crossesBox(a.x, a.y, b.x, b.y, box)) crossings.push('a path crosses "' + box.label + '"')
      }
    }
  }
  return crossings
}

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
  const crossings = boxCrossings(canvas)
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

// ----------------------------------------------------------------------------------------------- shape ports
//
// A port is legal only where the symbol's own outline is. The rule is per symbol, so every case below names the
// symbol's geometry independently - the four vertices, the ellipse's cardinal points, the cap curve - and asks the
// painter to have used it. The geometry is recomputed here rather than imported, so a painter that agrees with a
// mistaken helper still fails: what is asserted is the shape a reader sees.

/** The four points a diamond is drawn through, from the box alone: top, right, bottom, left. */
const diamondCorners = (box) => [
  { x: box.x + box.width / 2, y: box.y },
  { x: box.x + box.width, y: box.y + box.height / 2 },
  { x: box.x + box.width / 2, y: box.y + box.height },
  { x: box.x, y: box.y + box.height / 2 },
]

/** A point on one cubic Bezier at `t`: what "the top of the cap" means without asking the renderer. */
const cubicAt = (p0, p1, p2, p3, t) => {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

/** How far a point is from a segment. Zero means it lies on it. */
const distanceToSegment = (point, a, b) => {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length))
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

/** How far a point is from a diamond's outline: zero means it lies on one of the four edges. */
const distanceToDiamond = (box, point) => {
  const corners = diamondCorners(box)
  let best = Infinity
  for (let index = 0; index < corners.length; index += 1) {
    best = Math.min(best, distanceToSegment(point, corners[index], corners[(index + 1) % corners.length]))
  }
  return best
}

/** Is the point strictly inside the polygon - not on an edge's line, and on one side of every edge? */
const strictlyInside = (polygon, point) => {
  let sign = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]
    const b = polygon[(index + 1) % polygon.length]
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
    if (Math.abs(cross) < 1e-9) return false
    const side = cross > 0 ? 1 : -1
    if (sign === 0) sign = side
    else if (side !== sign) return false
  }
  return true
}

/** The box an id was drawn as, paired through the label the fixture gave it. */
const boxOfNode = (canvas, diagram, id) => {
  const node = diagram.nodes.find((entry) => entry.id === id)
  if (node === undefined) return undefined
  return canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === labelOf(node))
}

/** The two points a route attaches with: its source end and its target end. */
const endsOfRoute = (shape) => {
  const points = routePointsOf(shape)
  return [points[0], points[points.length - 1]]
}

// The policy these cases hold: a symbol with discrete points gives every edge end a point of its own, and only when
// the four are taken does an edge share one. A symbol with a run keeps spreading along the run. So the cases below
// come in pairs - a diamond and a rectangle on the same four branches - and the fallback and the tie-break have cases
// of their own, because a rule that always shares and a rule that never shares would each pass half of them.

/** Which vertex of a diamond a point is, by the order `diamondCorners` returns: top, right, bottom, left. */
const cornerAt = (corners, point) => corners.findIndex((corner) => Math.hypot(corner.x - point.x, corner.y - point.y) <= 0.01)

/** The side a diamond vertex belongs to, by the same order. */
const SIDES_BY_CORNER = ['top', 'right', 'bottom', 'left']

/**
 * Does the route meet this vertex square to the side it belongs to, coming from that side's outside?
 *
 * The neighbouring point on the route is `away`: the second point for a port an edge leaves by, the second-to-last for
 * one it arrives at. Both have to lie outside the symbol - an edge that meets a right vertex from above is a line
 * glued to the side, whatever the port's coordinate says.
 */
const meetsSquare = (corners, port, away) => {
  const at = cornerAt(corners, port)
  if (at === -1) return false
  const dx = away.x - port.x
  const dy = away.y - port.y
  const side = SIDES_BY_CORNER[at]
  if (side === 'right') return dx > 0.01 && Math.abs(dy) <= 0.01
  if (side === 'left') return dx < -0.01 && Math.abs(dy) <= 0.01
  if (side === 'top') return dy < -0.01 && Math.abs(dx) <= 0.01
  return dy > 0.01 && Math.abs(dx) <= 0.01
}

/** A machine whose one source is a diamond (or a rectangle, for the contrast) with branches out to boxes in a row. */
const branchDiagram = (shape, targets) => ({
  kind: 'machine',
  title: 't',
  init: 'd',
  caption: 'pass',
  nodes: [{ id: 'd', role: 'normal', ...(shape === 'rect' ? {} : { shape }) }, ...targets.map((id) => ({ id, role: 'normal' }))],
  edges: targets.map((id, index) => ({ from: 'd', label: 'branch ' + String(index + 1), to: id })),
})

test('a diamond with two labelled branches leaves by two different vertices', () => {
  // The case that named the rule: a decision's two branches used to leave one vertex and fan apart a few points later,
  // so the two lines coincided exactly where a reader looks first, at the outline of the decision.
  const { canvas } = paintWith(branchDiagram('diamond', ['x', 'y']))
  const diamond = canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === 'd')
  if (diamond.shape !== 'diamond') throw new Error('the fixture did not draw a diamond')
  const corners = diamondCorners(diamond)
  const routes = routesOf(canvas)
  if (routes.length !== 2) throw new Error('edges drawn: ' + String(routes.length))
  const anchors = routes.map((shape) => endsOfRoute(shape)[0])
  for (const [index, anchor] of anchors.entries()) {
    // A vertex, and nothing else: the four points are the only places a side meets the outline.
    if (distanceToDiamond(diamond, anchor) > 0.01) throw new Error('a port is not on the diamond: ' + JSON.stringify(anchor))
    if (cornerAt(corners, anchor) === -1) throw new Error('a port sits between two vertices: ' + JSON.stringify(anchor))
    const points = routePointsOf(routes[index])
    if (!meetsSquare(corners, anchor, points[1])) {
      throw new Error('the edge does not leave its vertex square to that side: ' + JSON.stringify(points.slice(0, 3)))
    }
  }
  // Two vertices, and two lines: not one line that the fan splits after the outline.
  if (cornerAt(corners, anchors[0]) === cornerAt(corners, anchors[1])) {
    throw new Error('the two branches leave one vertex: ' + JSON.stringify(anchors))
  }
  if (sharesSegment(segmentsOfShape(routes[0]), segmentsOfShape(routes[1]))) throw new Error('the two branches share a segment')
  // The labels name the branches, and each sits on the line it names.
  const labels = routes.map((shape) => shape.label)
  if (JSON.stringify(labels) !== JSON.stringify(['branch 1', 'branch 2'])) throw new Error('labels: ' + JSON.stringify(labels))
  for (const shape of routes) {
    if (distanceToRoute(shape, { x: shape.labelX, y: shape.labelY }) > 2) throw new Error('label "' + shape.label + '" is off its own edge')
  }
})

test('a diamond with four outgoing edges uses all four vertices', () => {
  // Four branches and four points, so every branch gets one. One of them has to leave by the point that is left - the
  // top one, toward a target below - and that is the case where the route has to go round its own symbol instead of
  // through it.
  const { canvas } = paintWith(branchDiagram('diamond', ['far left', 'near left', 'near right', 'far right']))
  const diamond = canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === 'd')
  const corners = diamondCorners(diamond)
  const routes = routesOf(canvas)
  if (routes.length !== 4) throw new Error('edges drawn: ' + String(routes.length))
  const used = routes.map((shape) => cornerAt(corners, endsOfRoute(shape)[0]))
  if (used.some((at) => at === -1)) throw new Error('a port is not a vertex: ' + JSON.stringify(used))
  if (new Set(used).size !== 4) throw new Error('the four branches did not take four vertices: ' + JSON.stringify(used))
  for (const [index, shape] of routes.entries()) {
    const points = routePointsOf(shape)
    if (!meetsSquare(corners, points[0], points[1])) {
      throw new Error('a branch does not leave its vertex square to that side: ' + JSON.stringify(points.slice(0, 3)))
    }
  }
  // The point that faces away from its target is still a port on the outline, and the route round it crosses nothing.
  const crossings = boxCrossings(canvas)
  if (crossings.length > 0) throw new Error(crossings.join('; '))
})

test('a fifth edge on a diamond shares a point, and the fallback is the side it approaches by', () => {
  // Four points and five branches: the fifth has nowhere of its own to go, so the old rule applies to it - the side
  // the route approaches by, whose point it shares with whichever branch already holds it - and the two still fan
  // apart after the port. Sharing is the fallback, and it is asserted rather than left to be assumed.
  const { canvas } = paintWith(branchDiagram('diamond', ['a1', 'a2', 'a3', 'a4', 'a5']))
  const diamond = canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === 'd')
  const corners = diamondCorners(diamond)
  const routes = routesOf(canvas)
  if (routes.length !== 5) throw new Error('edges drawn: ' + String(routes.length))
  const used = routes.map((shape) => cornerAt(corners, endsOfRoute(shape)[0]))
  if (used.some((at) => at === -1)) throw new Error('a port is not a vertex: ' + JSON.stringify(used))
  if (new Set(used).size !== 4) throw new Error('the fifth branch did not fall back: ' + JSON.stringify(used))
  const shared = used.find((at, index) => used.indexOf(at) !== index)
  // Every target is below the diamond, so the side the route approaches by is the bottom one, and the shared point is
  // its vertex rather than one of the three that a scored branch took.
  if (shared !== SIDES_BY_CORNER.indexOf('bottom')) throw new Error('the fallback took a point that was free: ' + JSON.stringify(used))
  const pair = routes.filter((shape, index) => used[index] === shared)
  if (pair.length !== 2) throw new Error('the shared point is held by ' + String(pair.length) + ' edges')
  const [first, second] = pair.map((shape) => routePointsOf(shape))
  // One point, two lines: they leave together and part, which is the fan the sharing rule is named for.
  if (JSON.stringify(first) === JSON.stringify(second)) throw new Error('the two edges sharing a point are drawn as one line')
  const parts = first.some((point, at) => second[at] === undefined || point.x !== second[at].x || point.y !== second[at].y)
  if (!parts) throw new Error('the two edges sharing a point never part')
})

test('a circle with two edges uses two different cardinal points', () => {
  const diagram = {
    kind: 'machine',
    title: 't',
    init: 'hub',
    caption: 'pass',
    nodes: [
      { id: 'hub', role: 'normal', shape: 'circle' },
      { id: 'x', role: 'normal' },
      { id: 'y', role: 'normal' },
    ],
    edges: [{ from: 'hub', label: 'one', to: 'x' }, { from: 'hub', label: 'two', to: 'y' }],
  }
  const { canvas } = paintWith(diagram)
  const hub = canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === 'hub')
  if (hub.shape !== 'circle') throw new Error('the fixture did not draw a circle')
  const centre = { x: hub.x + hub.width / 2, y: hub.y + hub.height / 2 }
  const cardinals = [
    { x: centre.x, y: hub.y },
    { x: hub.x + hub.width, y: centre.y },
    { x: centre.x, y: hub.y + hub.height },
    { x: hub.x, y: centre.y },
  ]
  const routes = routesOf(canvas)
  if (routes.length !== 2) throw new Error('edges drawn: ' + String(routes.length))
  const anchors = routes.map((shape) => endsOfRoute(shape)[0])
  const used = anchors.map((anchor) => cardinals.findIndex((cardinal) => Math.hypot(cardinal.x - anchor.x, cardinal.y - anchor.y) <= 0.01))
  if (used.some((at) => at === -1)) throw new Error('a port is not a cardinal point: ' + JSON.stringify(anchors))
  if (used[0] === used[1]) throw new Error('the two edges share a cardinal point: ' + JSON.stringify(anchors))
})

test('a rectangle with four outgoing edges still spreads them along one side', () => {
  // The contrast to the four-vertex case: a rectangle has a run on its side and no points, so its four branches stay
  // on the side the route leaves by and are spaced along it. Nothing about the discrete rule reaches a symbol that
  // has no points to give.
  const { canvas } = paintWith(branchDiagram('rect', ['far left', 'near left', 'near right', 'far right']))
  const source = canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === 'd')
  if (source.shape !== undefined) throw new Error('the fixture drew a symbol instead of a rectangle')
  const ends = routesOf(canvas).map((shape) => endsOfRoute(shape)[0])
  if (ends.length !== 4) throw new Error('edges drawn: ' + String(ends.length))
  for (const end of ends) {
    if (Math.abs(end.y - (source.y + source.height)) > 0.01) throw new Error('a port left the bottom side: ' + JSON.stringify(end))
    if (end.x <= source.x || end.x >= source.x + source.width) throw new Error('a port is on the box corner, not the side: ' + JSON.stringify(end))
  }
  if (new Set(ends.map((end) => end.x)).size !== 4) throw new Error('the four ports are not four places: ' + JSON.stringify(ends.map((end) => end.x)))
})

test('two edges that tie for a point keep the order they were written in', () => {
  // Mirror-image targets score the bottom vertex equally - the same drop, the same sideways distance either way - so
  // the rule has to say which edge keeps it: the one written first, and the later edge takes the side nearest its own
  // target. This is what makes the assignment deterministic, and it is the only reason edge order is read at all.
  const cornersOf = (canvas) => {
    const box = canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === 'd')
    return diamondCorners(box)
  }
  const first = paintWith({ ...branchDiagram('diamond', ['l', 'r']) }).canvas
  const swapped = paintWith({
    ...branchDiagram('diamond', ['l', 'r']),
    edges: [{ from: 'd', label: 'branch 1', to: 'r' }, { from: 'd', label: 'branch 2', to: 'l' }],
  }).canvas
  const bottom = SIDES_BY_CORNER.indexOf('bottom')
  const right = SIDES_BY_CORNER.indexOf('right')
  const left = SIDES_BY_CORNER.indexOf('left')
  const usedIn = (canvas) => routesOf(canvas).map((shape) => cornerAt(cornersOf(canvas), endsOfRoute(shape)[0]))
  const written = usedIn(first)
  const reversed = usedIn(swapped)
  if (written[0] !== bottom) throw new Error('the first edge did not keep the point the two tie for: ' + JSON.stringify(written))
  if (written[1] !== right) throw new Error('the later edge did not take the side nearest its target: ' + JSON.stringify(written))
  if (reversed[0] !== bottom) throw new Error('rewriting the edges moved the tied point off the first one: ' + JSON.stringify(reversed))
  if (reversed[1] !== left) throw new Error('the later edge did not take the side nearest its target: ' + JSON.stringify(reversed))
})

test('a circle has four legal points, so four edges land on the ellipse cardinal points', () => {
  const diagram = {
    kind: 'machine',
    title: 't',
    init: 'top1',
    caption: 'pass',
    nodes: [
      { id: 'top1', role: 'normal' },
      { id: 'top2', role: 'normal' },
      { id: 'hub', role: 'normal', shape: 'circle' },
      { id: 'lo1', role: 'normal' },
      { id: 'lo2', role: 'normal' },
    ],
    edges: [
      { from: 'top1', label: 'a', to: 'hub' },
      { from: 'top2', label: 'b', to: 'hub' },
      { from: 'hub', label: 'c', to: 'lo1' },
      { from: 'hub', label: 'd', to: 'lo2' },
    ],
  }
  const { canvas } = paintWith(diagram)
  const hub = canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === 'hub')
  if (hub.shape !== 'circle') throw new Error('the fixture did not draw a circle')
  const centre = { x: hub.x + hub.width / 2, y: hub.y + hub.height / 2 }
  const cardinals = [
    { x: centre.x, y: hub.y },
    { x: hub.x + hub.width, y: centre.y },
    { x: centre.x, y: hub.y + hub.height },
    { x: hub.x, y: centre.y },
  ]
  const routes = routesOf(canvas)
  if (routes.length !== 4) throw new Error('edges drawn: ' + String(routes.length))
  const used = new Set()
  routes.forEach((shape, index) => {
    const edge = diagram.edges[index]
    const points = routePointsOf(shape)
    for (const [id, point, away] of [[edge.from, points[0], points[1]], [edge.to, points[points.length - 1], points[points.length - 2]]]) {
      if (id !== 'hub') continue
      const at = cardinals.findIndex((cardinal) => Math.hypot(cardinal.x - point.x, cardinal.y - point.y) <= 0.01)
      if (at === -1) throw new Error('a port is not an ellipse cardinal point: ' + JSON.stringify(point))
      // And the line meets the ellipse square to that cardinal point, from outside it: four points used, and used as
      // sides rather than as coordinates on one side.
      if (!meetsSquare(cardinals, point, away)) throw new Error('an edge does not meet its cardinal point square: ' + JSON.stringify(points.slice(-3)))
      used.add(at)
    }
  })
  // Two edges arrive at the top and two leave the bottom, and each of the four cardinals is in use.
  if (used.size !== 4) throw new Error('the four cardinals are not all in use: ' + JSON.stringify([...used]))
})

test('a wrapped column edge meets a circle at the left and right cardinal points', () => {
  // Twelve boxes wrap into two columns, so the crossing edge is read sideways: it leaves the last box of one column
  // and arrives at the first of the next. Those two sides of a circle are cardinal points, not a spread.
  const nodes = []
  const edges = []
  for (let index = 0; index < 12; index += 1) {
    nodes.push({ id: 'n' + String(index), role: 'normal', ...(index === 5 || index === 6 ? { shape: 'circle' } : {}) })
    if (index + 1 < 12) edges.push({ from: 'n' + String(index), label: '', to: 'n' + String(index + 1) })
  }
  const diagram = { kind: 'graph', title: 't', init: 'n0', nodes, edges, caption: 'pass' }
  const { canvas } = paintWith(diagram)
  const routes = routesOf(canvas)
  if (routes.length !== edges.length) throw new Error('a route was dropped, so the edges and the routes no longer pair up')
  const circles = new Set(['n5', 'n6'])
  const used = new Set()
  routes.forEach((shape, index) => {
    const edge = edges[index]
    for (const [id, point] of [[edge.from, endsOfRoute(shape)[0]], [edge.to, endsOfRoute(shape)[1]]]) {
      if (!circles.has(id)) continue
      const box = boxOfNode(canvas, diagram, id)
      const cardinals = [
        { x: box.x + box.width / 2, y: box.y },
        { x: box.x + box.width, y: box.y + box.height / 2 },
        { x: box.x + box.width / 2, y: box.y + box.height },
        { x: box.x, y: box.y + box.height / 2 },
      ]
      const at = cardinals.findIndex((cardinal) => Math.hypot(cardinal.x - point.x, cardinal.y - point.y) <= 0.01)
      if (at === -1) throw new Error('a circle port is not a cardinal point: ' + JSON.stringify(point))
      used.add(at)
    }
  })
  // The crossing edge leaves by the right cardinal and arrives at the left one; if the drawing stopped wrapping, the
  // case measured nothing and says so rather than passing quietly.
  if (!used.has(1) || !used.has(3)) throw new Error('no edge crosses a column, so the left and right cardinals were not exercised: ' + JSON.stringify([...used]))
})

test('a rectangle still spreads two ports along one side', () => {
  // The guard against over-constraining: the rule is per symbol, and a rectangle is the symbol that always had a
  // side. Its two ports stay apart, one fan spacing apart, exactly where they were.
  const { canvas } = paintWith(pairDiagram([{ label: '' }, { label: '' }]))
  const target = canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === 'b')
  const ends = routesOf(canvas).map((shape) => endsOfRoute(shape)[1])
  if (ends.length !== 2) throw new Error('edges drawn: ' + String(ends.length))
  for (const end of ends) if (end.y !== target.y && end.y !== target.y + target.height) throw new Error('a port left the rectangle side: ' + JSON.stringify(end))
  const middle = target.x + target.width / 2
  const offsets = ends.map((end) => end.x - middle).sort((left, right) => left - right)
  if (JSON.stringify(offsets) !== JSON.stringify([0, MULTI_EDGE_SPACING])) throw new Error('the rectangle did not spread its ports: ' + JSON.stringify(offsets))
})

test('a cylinder top port sits on its cap curve, not on the box edge', () => {
  const diagram = {
    kind: 'machine',
    title: 't',
    init: 'above',
    caption: 'pass',
    nodes: [{ id: 'above', role: 'normal' }, { id: 'store', role: 'normal', shape: 'cylinder' }, { id: 'below', role: 'normal' }],
    edges: [{ from: 'above', label: 'write', to: 'store' }, { from: 'store', label: 'read', to: 'below' }],
  }
  const { canvas } = paintWith(diagram)
  const store = canvas.shapes.find((shape) => shape.kind === 'box' && shape.label === 'store')
  if (store.shape !== 'cylinder') throw new Error('the fixture did not draw a cylinder')
  // The writer draws each cap as a cubic from one shoulder to the other, with the box's own edge as the control
  // line; its apex is a quarter of the cap's depth inside the box, and that is the only point an edge may meet.
  const cap = Math.min(10, store.height / 3)
  const apexTop = cubicAt(store.y + cap, store.y, store.y, store.y + cap, 0.5)
  const apexBottom = cubicAt(store.y + store.height - cap, store.y + store.height, store.y + store.height, store.y + store.height - cap, 0.5)
  const centre = store.x + store.width / 2
  const routes = routesOf(canvas)
  if (routes.length !== 2) throw new Error('edges drawn: ' + String(routes.length))
  const [entry, exit] = [endsOfRoute(routes[0])[1], endsOfRoute(routes[1])[0]]
  if (Math.abs(entry.x - centre) > 0.01 || Math.abs(entry.y - apexTop) > 0.01) {
    throw new Error('the top port is not the cap curve apex: ' + JSON.stringify(entry) + ' vs ' + JSON.stringify({ x: centre, y: apexTop }))
  }
  if (entry.y <= store.y + 0.01) throw new Error('the top port is on the box edge, which is off the cap: ' + String(entry.y))
  if (Math.abs(exit.x - centre) > 0.01 || Math.abs(exit.y - apexBottom) > 0.01) {
    throw new Error('the bottom port is not the cap curve apex: ' + JSON.stringify(exit) + ' vs ' + JSON.stringify({ x: centre, y: apexBottom }))
  }
})

test('a rendered diamond carries no endpoint inside its outline, and every endpoint on it is a vertex', () => {
  const source = [
    'graph TD',
    '  a[Idea] --> b{Feasible?}',
    '  b -->|yes| c[Build]',
    '  b -->|no| d[Revise]',
    '  d -->|retry| a',
    '  c --> b',
  ].join(NL)
  const rendered = render({ source })
  const { canvas } = paintWith(rendered.diagram)
  const diamond = canvas.shapes.find((shape) => shape.kind === 'box' && shape.shape === 'diamond')
  if (diamond === undefined) throw new Error('the fixture no longer draws a diamond')
  const corners = diamondCorners(diamond)
  let attached = 0
  routesOf(canvas).forEach((shape, index) => {
    const edge = rendered.diagram.edges[index]
    if (edge === undefined) return
    const points = routePointsOf(shape)
    const ends = [[edge.from, points[0]], [edge.to, points[points.length - 1]]]
    for (const [id, point] of ends) {
      if (id !== 'b') continue
      attached += 1
      if (strictlyInside(corners, point)) throw new Error('an edge endpoint falls inside the diamond: ' + JSON.stringify(point))
      // "Not inside" is not enough: the endpoint has to be on the outline, and the side's only outline points are
      // the vertices.
      if (distanceToDiamond(diamond, point) > 0.01) throw new Error('an edge endpoint is off the diamond: ' + JSON.stringify(point))
      if (!corners.some((corner) => Math.hypot(corner.x - point.x, corner.y - point.y) <= 0.01)) {
        throw new Error('an edge endpoint is between two vertices: ' + JSON.stringify(point))
      }
    }
  })
  if (attached !== 4) throw new Error('the fixture attaches ' + String(attached) + ' endpoints to the diamond, expected four')
})

test('a stadium and a hexagon keep their ports on the flat run, not on a cap or a cut corner', () => {
  // Both symbols own only part of the box's side: a stadium's ends are arcs, and a hexagon's ends are cut corners.
  // Four edges between one pair fan out past that flat run, and what used to be a legal point on the box is now
  // outside the symbol - so the spread has to stop at the run.
  for (const shape of ['stadium', 'hexagon']) {
    const diagram = {
      kind: 'machine',
      title: 't',
      init: 'a',
      caption: 'pass',
      nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal', shape }],
      edges: [
        { from: 'a', label: 'one', to: 'b' },
        { from: 'a', label: 'two', to: 'b' },
        { from: 'a', label: 'three', to: 'b' },
        { from: 'a', label: 'four', to: 'b' },
      ],
    }
    const { canvas } = paintWith(diagram)
    const box = canvas.shapes.find((entry) => entry.kind === 'box' && entry.label === 'b')
    if (box.shape !== shape) throw new Error('the fixture did not draw a ' + shape)
    const margin = shape === 'hexagon' ? Math.min(12, box.width / 4) : Math.min(box.height / 2, box.width / 2)
    const low = box.x + margin
    const high = box.x + box.width - margin
    const ends = routesOf(canvas).map((route) => endsOfRoute(route)[1])
    if (ends.length !== 4) throw new Error(shape + ': edges drawn ' + String(ends.length))
    for (const end of ends) {
      if (Math.abs(end.y - box.y) > 0.01) throw new Error(shape + ': a port did not arrive at the top side: ' + JSON.stringify(end))
      if (end.x < low - 0.01 || end.x > high + 0.01) {
        throw new Error(shape + ': a port is on the ' + (shape === 'hexagon' ? 'cut corner' : 'cap arc') + ': ' + JSON.stringify(end))
      }
    }
    if (new Set(ends.map((end) => end.x)).size !== 4) throw new Error(shape + ': the spread collapsed onto one point')
  }
})

const diagramOf = (spec) => ({ kind: 'graph', title: 't', caption: 'graph', ...spec })

test('a side anchor is the middle of that side, and a sideways edge leaves toward where it goes', () => {
  const box = { x: 10, y: 20, width: 40, height: 20 }
  const sides = [
    ['top', { x: 30, y: 20 }],
    ['bottom', { x: 30, y: 40 }],
    ['left', { x: 10, y: 30 }],
    ['right', { x: 50, y: 30 }],
  ]
  for (const [side, want] of sides) {
    const got = anchor(box, side)
    if (got.x !== want.x || got.y !== want.y) throw new Error(side + ': ' + JSON.stringify(got))
  }
  const right = { x: 100, y: 20, width: 40, height: 20 }
  const forward = approachSides(box, right)
  if (forward.exit !== 'right' || forward.entry !== 'left') throw new Error('forward: ' + JSON.stringify(forward))
  const backward = approachSides(right, box)
  if (backward.exit !== 'left' || backward.entry !== 'right') throw new Error('backward: ' + JSON.stringify(backward))
})

test('every symbol a node can state is written as the SVG shape that draws it', () => {
  const source = [
    'graph TD',
    '  a[[Subroutine]] --> b([Stadium])',
    '  b --> c<<Hexagon>>',
    '  c --> d[(Store)]',
    '  d --> e{Decision}',
    '  e --> f[Rectangle]',
  ].join(NL)
  const { markup, dropped } = render({ source })
  if (dropped !== 0) throw new Error('the writer dropped ' + String(dropped) + ' shapes')
  for (const tag of ['<polygon', '<rect', '<path']) if (!markup.includes(tag)) throw new Error('the drawing has no ' + tag)
})

test('a use case states a circle, which is drawn as an ellipse', () => {
  const { markup } = render({ source: '@startuml\nusecase "Do the thing" as uc\ncomponent Api\nApi --> uc\n@enduml' })
  if (!markup.includes('<ellipse')) throw new Error('the use case is not an ellipse')
})

test('a self loop keeps the line and the head the source stated', () => {
  const state = render({ source: ['stateDiagram-v2', '  [*] --> busy', '  busy --> [*]'].join(NL) })
  const loop = state.canvas.shapes.find((shape) => shape.kind === 'path' && shape.dashed === true)
  if (loop === undefined) throw new Error('the end transition is not a dashed self loop')
  const plant = render({ source: '@startuml\nA --> A\n@enduml' })
  const arrowed = plant.canvas.shapes.find((shape) => shape.kind === 'path' && shape.arrow === 'association')
  if (arrowed === undefined) throw new Error('the self loop carries no arrow type')
})

test('an edge from a boundary attaches to its rectangle and earns the muted colour; an edge to a boundary with nothing drawn is dropped', () => {
  const diagram = diagramOf({
    nodes: [{ id: 'a', role: 'normal' }, { id: 'b', role: 'normal' }, { id: 'c', role: 'normal' }],
    edges: [
      { from: 'b', to: 'a', label: '' },
      { from: 'g', to: 'b', label: '' },
      { from: 'b', to: 'empty', label: '' },
      { from: 'b', to: 'hollow', label: '' },
    ],
    groups: [
      { id: 'g', label: 'G', members: ['a'] },
      { id: 'empty', label: 'Empty', members: [] },
      { id: 'outer', label: 'Outer', members: ['c'] },
      { id: 'hollow', label: 'Hollow', members: [], parent: 'outer' },
    ],
  })
  const { canvas } = paintWith(diagram)
  const edges = canvas.shapes.filter((shape) => shape.kind === 'link' || shape.kind === 'path')
  // The empty boundary is not drawn, so an edge into it has nothing to land on - not even the boundary around it,
  // which the source did not say the edge pointed at.
  if (edges.length !== 2) throw new Error('edge shapes: ' + String(edges.length))
  const fromBoundary = edges.find((shape) => shape.colour === 'muted')
  if (fromBoundary === undefined) throw new Error('the boundary edge did not fall back to the muted colour')
})

test('a three-level nest is drawn inside out, and an edge naming a nested boundary attaches to the outermost one', () => {
  const diagram = diagramOf({
    nodes: [{ id: 'x', role: 'normal' }, { id: 'y', role: 'normal' }, { id: 'w', role: 'normal' }],
    edges: [
      { from: 'x', to: 'y', label: '' },
      { from: 'w', to: 'inner', label: '' },
    ],
    groups: [
      { id: 'outer', label: 'Outer', members: ['x'] },
      { id: 'mid', label: 'Mid', members: [], parent: 'outer' },
      { id: 'inner', label: 'Inner', members: ['y'], parent: 'mid' },
      { id: 'other', label: 'Other', members: ['w'] },
    ],
  })
  const { canvas } = paintWith(diagram)
  const rects = new Map(canvas.shapes.filter((shape) => shape.kind === 'group').map((shape) => [shape.id, shape]))
  for (const id of ['outer', 'mid', 'inner', 'other']) if (!rects.has(id)) throw new Error('the boundary ' + id + ' was not drawn')
  const nested = rects.get('inner')
  const middle = rects.get('mid')
  if (!(nested.x >= middle.x && nested.y >= middle.y && nested.x + nested.width <= middle.x + middle.width)) {
    throw new Error('the inner boundary is not inside the middle one')
  }
  if (canvas.shapes.filter((shape) => shape.kind === 'link' || shape.kind === 'path').length === 0) throw new Error('no edge was drawn')
})

test('the initial state pins its own level, and a sibling level is laid out without it', () => {
  const diagram = diagramOf({
    kind: 'machine',
    init: 'i',
    nodes: [{ id: 'i', role: 'normal' }, { id: 'a', role: 'normal' }],
    edges: [{ from: 'i', to: 'a', label: '' }],
    groups: [
      { id: 'g1', label: 'One', members: ['i'] },
      { id: 'g2', label: 'Two', members: ['a'] },
    ],
  })
  const { canvas } = paintWith(diagram)
  const rects = new Map(canvas.shapes.filter((shape) => shape.kind === 'group').map((shape) => [shape.id, shape]))
  const first = rects.get('g1')
  const second = rects.get('g2')
  if (first === undefined || second === undefined) throw new Error('a boundary was not drawn')
  if (!(first.y < second.y)) throw new Error('the initial state is not on the top level: ' + String(first.y) + ' vs ' + String(second.y))
})

test('a wrapped column reads its edges sideways, on whatever symbol the box is, and keeps the line style', () => {
  for (const shape of ['cylinder', 'hexagon', 'stadium']) {
    const nodes = []
    const edges = []
    for (let index = 0; index < 12; index += 1) nodes.push({ id: 'n' + String(index), role: 'normal', shape })
    for (let index = 0; index + 1 < 12; index += 1) edges.push({ from: 'n' + String(index), to: 'n' + String(index + 1), label: '' })
    edges.push({ from: 'n0', to: 'n11', label: 'skip', dashed: true, arrow: 'dependency' })
    const { canvas } = paintWith(diagramOf({ nodes, edges }))
    const columns = new Set(canvas.shapes.filter((entry) => entry.kind === 'box').map((entry) => Math.round(entry.x / 10)))
    if (columns.size < 2) throw new Error(shape + ': the drawing did not wrap')
    const skip = canvas.shapes.find((entry) => (entry.kind === 'path' || entry.kind === 'link') && entry.label === 'skip')
    if (skip === undefined) throw new Error(shape + ': the long edge is not drawn')
    if (skip.kind !== 'path') throw new Error(shape + ': the long edge did not take the router')
    if (skip.dashed !== true) throw new Error(shape + ': the long edge lost its dash')
    if (skip.arrow !== 'dependency') throw new Error(shape + ': the long edge lost its arrow type')
    const boxes = new Map(canvas.shapes.filter((entry) => entry.kind === 'box').map((entry) => [entry.label, entry]))
    const from = boxes.get('n0')
    const to = boxes.get('n11')
    if (skip.points[0].x !== from.x + from.width) throw new Error(shape + ': the edge does not leave the right side')
    if (skip.points[skip.points.length - 1].x !== to.x) throw new Error(shape + ': the edge does not arrive at the left side')
  }
})

test('a degenerate arrowhead is not written rather than written wrong', () => {
  const canvas = {
    width: 100,
    height: 100,
    shapes: [
      { kind: 'link', x1: 20, y1: 20, x2: 20, y2: 20, label: '', labelX: 20, labelY: 20, colour: 'edge', arrow: 'association' },
      { kind: 'link', x1: 30, y1: 30, x2: 30, y2: 30, label: '', labelX: 30, labelY: 30, colour: 'edge', arrow: 'generalization' },
      { kind: 'link', x1: 40, y1: 40, x2: 40, y2: 40, label: '', labelX: 40, labelY: 40, colour: 'edge', arrow: 'composition' },
      { kind: 'link', x1: 20, y1: 40, x2: 80, y2: 40, label: 'go', labelX: 50, labelY: 40, colour: 'edge', arrow: 'generalization' },
    ],
  }
  const { markup, dropped } = toSvg(canvas, palette(), 'degenerate')
  if (dropped !== 0) throw new Error('dropped: ' + String(dropped))
  if (markup.split('<polygon').length - 1 !== 1) throw new Error('the zero-length head was drawn')
  if (!markup.includes('go')) throw new Error('the labelled edge lost its label')
})

if (failures > 0) {
  console.log(NL + 'render tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all render tests passed')

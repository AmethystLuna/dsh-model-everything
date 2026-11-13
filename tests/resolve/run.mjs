// The corrections a drawing needs after its lines are read, decided without a canvas.
//
// The pass looks at the elements and the edges together: a name an arrow wrote is deleted when a block of that name exists, the edge is
// re-pointed at the rectangle, and a block with nothing inside it cannot receive an edge at all.
import { resolveBoundaries } from '../../lib/render/plantuml-resolve.js'

let failures = 0
function test(name, body) {
  try {
    body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const builderOf = ({ nodes = [], groups = [], edges = [], implicit = [] } = {}) => ({
  nodes: new Map(nodes.map((id) => [id, { id, role: 'normal' }])),
  groups,
  edges,
  implicit: new Set(implicit),
  edgeLines: edges.map((_, index) => index + 1),
  edgeScopes: edges.map(() => undefined),
  groupLines: new Map(groups.map((group) => [group.id, 1])),
})

const group = (id, label, members, parent) => ({ id, label, members, ...(parent === undefined ? {} : { parent }) })

test('an arrow name that a block owns becomes the block, and the box is not drawn twice', () => {
  const builder = builderOf({
    nodes: ['Api'],
    groups: [group('web', 'Web', ['Api'])],
    implicit: ['Web'],
    edges: [{ from: 'web', to: 'Api', label: '' }],
  })
  // The arrow wrote `Web` as an endpoint before the block existed; the endpoint is re-pointed at the block and the box is gone.
  builder.nodes.set('Web', { id: 'Web', role: 'normal' })
  const notes = []
  resolveBoundaries(builder, (message) => notes.push(message))
  if (builder.nodes.has('Web')) throw new Error('the box named after the block survived')
  if (builder.edges[0]?.from !== 'web') throw new Error('the edge was not re-pointed: ' + JSON.stringify(builder.edges[0]))
  if (notes.length !== 0) throw new Error('notes: ' + JSON.stringify(notes))
})

test('a name two blocks share is refused, and the edge is dropped', () => {
  const builder = builderOf({
    nodes: ['Api'],
    groups: [group('one', 'Web', ['Api']), group('two', 'Web', [])],
    implicit: ['Web'],
    edges: [{ from: 'Web', to: 'Api', label: '' }],
  })
  const notes = []
  resolveBoundaries(builder, (message) => notes.push(message))
  if (!notes.some((note) => note.includes('more than one block'))) throw new Error('notes: ' + JSON.stringify(notes))
  if (builder.edges.length !== 0) throw new Error('the edge survived')
})

test('an edge into a block with nothing inside it is refused, and says so once', () => {
  const builder = builderOf({
    nodes: ['Api'],
    groups: [group('web', 'Web', [])],
    implicit: ['Web'],
    edges: [{ from: 'Web', to: 'Api', label: '' }, { from: 'Api', to: 'Web', label: '' }],
  })
  const notes = []
  resolveBoundaries(builder, (message) => notes.push(message))
  if (builder.edges.length !== 0) throw new Error('an edge stayed attached to an empty block')
  const empty = notes.filter((note) => note.includes('nothing drawn inside'))
  if (empty.length !== 2) throw new Error('the two edges should each be reported: ' + JSON.stringify(notes))
  // The block itself is not reported again: one defect, one line.
  if (notes.some((note) => note.includes('boundary with nothing inside it'))) {
    throw new Error('the empty block was reported twice: ' + JSON.stringify(notes))
  }
})

test('a block with nothing in it is reported once, on the line that opened it', () => {
  const builder = builderOf({ groups: [group('web', 'Web', [])] })
  const notes = []
  resolveBoundaries(builder, (message) => notes.push(message))
  if (notes.length !== 1) throw new Error('notes: ' + JSON.stringify(notes))
  if (!notes[0].startsWith('line 1:')) throw new Error('wrong line: ' + notes[0])
  if (!notes[0].includes('boundary with nothing inside it')) throw new Error(notes[0])
})

if (failures > 0) {
  console.log('resolve tests failed:', failures)
  process.exit(1)
}
console.log('all resolve tests passed')
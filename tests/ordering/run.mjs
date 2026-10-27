// The ordering stage: how many edges cross, and whether the stage can bring that number down.
//
// A crossing count is only useful if it is the count a reader sees, so the positive cases are the two ways two
// edges between the same rows can meet: opposite order at the two ends (a crossing) and the same order (not one).
// The stage then has to do something about it - median sweeps move a box, greedy switch keeps a swap only when the
// total falls - and the test for that is a layer written in the wrong order on purpose.
import { countCrossings, order } from '../../lib/render/order.js'

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

const chain = (index, path) => ({ index, path })

test('two edges that end in opposite order cross, and two in the same order do not', () => {
  const rows = [['a', 'b'], ['c', 'd']]
  const crossed = countCrossings(rows, [chain(0, ['a', 'd']), chain(1, ['b', 'c'])])
  if (crossed !== 1) throw new Error('crossed: ' + String(crossed))
  const parallel = countCrossings(rows, [chain(0, ['a', 'c']), chain(1, ['b', 'd'])])
  if (parallel !== 0) throw new Error('parallel: ' + String(parallel))
})

test('parallel edges between the same two rows do not cross each other', () => {
  const crossings = countCrossings([['a'], ['b']], [chain(0, ['a', 'b']), chain(1, ['a', 'b'])])
  if (crossings !== 0) throw new Error('crossings: ' + String(crossings))
})

test('a long edge is counted between each pair of rows it crosses', () => {
  // a -> dummy -> c counts once between rows 0 and 1, and the dummy -> c part counts between rows 2 and 3.
  const rows = [['a'], ['d1'], ['d2'], ['c']]
  const crossings = countCrossings(rows, [chain(0, ['a', 'd1', 'd2', 'c'])])
  if (crossings !== 0) throw new Error('crossings: ' + String(crossings))
})

test('greedy switch undoes a layer written in the wrong order', () => {
  // The rows are written so that a meets d and b meets c, which is one crossing; one transposition removes it.
  const ordered = order([['a', 'b'], ['c', 'd']], [chain(0, ['a', 'd']), chain(1, ['b', 'c'])])
  if (ordered.crossings !== 0) throw new Error('crossings after ordering: ' + String(ordered.crossings))
  const top = ordered.layers[0]
  const bottom = ordered.layers[1]
  const topIndex = new Map(top.map((id, index) => [id, index]))
  const bottomIndex = new Map(bottom.map((id, index) => [id, index]))
  const first = topIndex.get('a') - topIndex.get('b')
  const second = bottomIndex.get('d') - bottomIndex.get('c')
  if (first * second < 0) throw new Error('the two edges still cross: ' + JSON.stringify(ordered.layers))
})

test('a drawing that has no crossings is left in the order it was given', () => {
  const ordered = order([['a'], ['b'], ['c']], [chain(0, ['a', 'b']), chain(1, ['b', 'c'])])
  if (ordered.crossings !== 0) throw new Error('crossings: ' + String(ordered.crossings))
  if (JSON.stringify(ordered.layers) !== JSON.stringify([['a'], ['b'], ['c']])) throw new Error('layers: ' + JSON.stringify(ordered.layers))
})

test('the seed order settles a layer that has no neighbours', () => {
  const ordered = order([['b', 'a']], [], new Map([['a', 0], ['b', 1]]))
  if (JSON.stringify(ordered.layers[0]) !== JSON.stringify(['a', 'b'])) throw new Error('layer: ' + JSON.stringify(ordered.layers[0]))
})

test('median ordering pulls a box under the neighbours it belongs to', () => {
  // `left` and `right` are in the top row; their children are written in the opposite order, and the downward median
  // sweep has to put each child under its own parent. There is no swap to make here - the order is decided by the
  // median, not by greedy switch.
  const ordered = order(
    [
      ['left', 'right'],
      ['child-of-right', 'child-of-left'],
    ],
    [chain(0, ['left', 'child-of-left']), chain(1, ['right', 'child-of-right'])],
  )
  if (JSON.stringify(ordered.layers[1]) !== JSON.stringify(['child-of-left', 'child-of-right'])) {
    throw new Error('bottom row: ' + JSON.stringify(ordered.layers[1]))
  }
  if (ordered.crossings !== 0) throw new Error('crossings: ' + String(ordered.crossings))
})

test('the crossing count falls or stays the same, never rises, over the ordering', () => {
  const rows = [
    ['a', 'b', 'c'],
    ['x', 'y', 'z'],
  ]
  const chains = [chain(0, ['a', 'z']), chain(1, ['b', 'y']), chain(2, ['c', 'x'])]
  const before = countCrossings(rows, chains)
  const after = order(rows, chains).crossings
  if (after > before) throw new Error('ordering made it worse: ' + String(before) + ' -> ' + String(after))
  if (after !== 0) throw new Error('the three crossings were not removed: ' + String(after))
})

if (failures > 0) {
  console.log(String.fromCharCode(10) + 'ordering tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all ordering tests passed')

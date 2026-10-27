// The cycle-breaking stage, asserted on the pieces a layered layout depends on: the strongly connected components,
// the condensation it builds from them, and the one ranking per component that makes every reversal consistent.
//
// The near miss matters more than the positive case here. It is easy to write a cycle breaker that turns some back
// edges round and still leaves a cycle, or one that reverses two edges of the same cycle in opposite directions; both
// pass a "the graph changed" test and both break layering. So the cases below check the three properties instead:
// the condensation is acyclic, no component keeps an intra-component edge against its ranking, and the initial state
// never becomes a target.
import { breakCycles } from '../../lib/render/cycle-break.js'

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

const graph = (ids, pairs, init) => ({
  nodes: ids.map((id) => ({ id, width: 80, height: 30 })),
  edges: pairs.map(([from, to], index) => ({ index, from, to })),
  ...(init === undefined ? {} : { init }),
})

/** The condensation must be a DAG: every edge has to point forward in the component numbering. */
const assertCondensationAcyclic = (broken) => {
  const seen = new Set()
  for (const edge of broken.condensation) {
    if (edge.from >= edge.to) throw new Error('condensation edge ' + String(edge.from) + ' -> ' + String(edge.to) + ' points backwards')
    const key = String(edge.from) + '>' + String(edge.to)
    if (seen.has(key)) throw new Error('duplicate condensation edge ' + key)
    seen.add(key)
  }
}

/** Every surviving edge inside a component points from a lower rank to a higher one. */
const assertIntraComponentConsistent = (broken) => {
  for (const edge of broken.edges) {
    if (edge.from === edge.to) continue
    if (broken.componentOf.get(edge.from) !== broken.componentOf.get(edge.to)) continue
    const from = broken.rank.get(edge.from)
    const to = broken.rank.get(edge.to)
    if (from === undefined || to === undefined) throw new Error('an edge names a node with no rank')
    if (from >= to) throw new Error('edge ' + edge.from + ' -> ' + edge.to + ' runs against its component ranking')
  }
}

test('Tarjan finds the cycle as one component and leaves the rest alone', () => {
  const broken = breakCycles(graph(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['c', 'a'], ['b', 'd']]))
  if (broken.components.length !== 2) throw new Error('components: ' + String(broken.components.length))
  const cycle = broken.components.find((component) => component.members.length > 1)
  const single = broken.components.find((component) => component.members.length === 1)
  if (JSON.stringify([...cycle.members].sort()) !== JSON.stringify(['a', 'b', 'c'])) throw new Error('cycle members: ' + JSON.stringify(cycle.members))
  if (JSON.stringify(single.members) !== JSON.stringify(['d'])) throw new Error('single member: ' + JSON.stringify(single.members))
  assertCondensationAcyclic(broken)
})

test('the condensation of a graph with two cycles is acyclic and keeps the join', () => {
  const broken = breakCycles(
    graph(
      ['a', 'b', 'c', 'x', 'y', 'z'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
        ['x', 'y'],
        ['y', 'z'],
        ['z', 'x'],
        ['c', 'x'],
      ],
    ),
  )
  if (broken.components.length !== 2) throw new Error('components: ' + String(broken.components.length))
  if (broken.condensation.length !== 1) throw new Error('condensation: ' + JSON.stringify(broken.condensation))
  assertCondensationAcyclic(broken)
})

test('one ranking per component: every intra-component edge points the same way', () => {
  // Two cycles sharing the edge b-d: a DFS that reverses each back edge it meets is free to choose opposite
  // directions here, and the test is that this one cannot - the ranking is chosen once for the component.
  const broken = breakCycles(
    graph(
      ['a', 'b', 'c', 'd'],
      [
        ['a', 'b'],
        ['b', 'c'],
        ['c', 'a'],
        ['b', 'd'],
        ['d', 'b'],
        ['d', 'a'],
      ],
    ),
  )
  if (broken.components.length !== 1) throw new Error('the graph is one component: ' + String(broken.components.length))
  assertIntraComponentConsistent(broken)
  assertCondensationAcyclic(broken)
})

test('a DAG is left exactly as it was written', () => {
  const pairs = [
    ['a', 'b'],
    ['a', 'c'],
    ['b', 'd'],
    ['c', 'd'],
  ]
  const broken = breakCycles(graph(['a', 'b', 'c', 'd'], pairs))
  if (broken.reversed.size !== 0) throw new Error('reversed: ' + JSON.stringify([...broken.reversed]))
  for (const [index, [from, to]] of pairs.entries()) {
    const edge = broken.edges[index]
    if (edge.from !== from || edge.to !== to) throw new Error('edge ' + String(index) + ' moved')
  }
  assertIntraComponentConsistent(broken)
})

test('the initial state is layer zero, so nothing is left pointing at it', () => {
  const broken = breakCycles(
    graph(
      ['i', 'a', 'b'],
      [
        ['i', 'a'],
        ['a', 'b'],
        ['b', 'i'],
        ['b', 'a'],
      ],
      'i',
    ),
  )
  for (const edge of broken.edges) if (edge.to === 'i') throw new Error('an edge still points at the initial state')
  if (broken.rank.get('i') !== 0) throw new Error('the initial state is not first in its component: ' + String(broken.rank.get('i')))
  if (!broken.reversed.has(2)) throw new Error('the edge into the initial state was not reversed')
  assertIntraComponentConsistent(broken)
})

test('a self loop is left alone, because the painter draws it as a loop', () => {
  const broken = breakCycles(graph(['a'], [['a', 'a']]))
  if (broken.edges[0].from !== 'a' || broken.edges[0].to !== 'a') throw new Error('the self loop moved')
  if (broken.reversed.size !== 0) throw new Error('the self loop was counted as reversed')
})

test('the reversed set names the diagram edges whose drawing direction changed', () => {
  const broken = breakCycles(graph(['a', 'b'], [['a', 'b'], ['b', 'a']]))
  const down = broken.edges.filter((edge) => edge.from === 'a' && edge.to === 'b').length
  if (down !== 2) throw new Error('the two edges do not both point down the ranking: ' + String(down))
  if (!broken.reversed.has(1)) throw new Error('the edge that was reversed is not reported: ' + JSON.stringify([...broken.reversed]))
  if (broken.reversed.has(0)) throw new Error('the edge that already ran downwards was reported as reversed')
})

test('an edge naming a node that does not exist cannot move the components', () => {
  const broken = breakCycles(graph(['a'], [['a', 'ghost'], ['ghost', 'a']]))
  if (broken.components.length !== 1) throw new Error('components: ' + String(broken.components.length))
  if (broken.condensation.length !== 0) throw new Error('a ghost became a component edge')
})

if (failures > 0) {
  console.log(String.fromCharCode(10) + 'cycle break tests failed: ' + String(failures))
  process.exit(1)
}
console.log('all cycle break tests passed')

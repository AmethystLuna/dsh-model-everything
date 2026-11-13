// Reading one arrow line: which end carries the mark, and what kind of edge that makes.
//
// The arrow a source writes decides the direction: `A <|-- B` is B generalising to A, so the edge runs from B and the triangle sits at
// A. The reader had no unit suite while it lived inside the parser - a diagram had to be built to reach it.
import { readArrow } from '../../lib/render/plantuml-reference.js'

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

const read = (line) => {
  const parsed = readArrow(line)
  if (parsed === undefined) throw new Error('not an arrow: ' + line)
  if (typeof parsed === 'string') throw new Error('refused: ' + parsed)
  return parsed
}

test('a plain arrow points from the left name to the right one', () => {
  const arrow = read('a --> b')
  if (arrow.from.id !== 'a' || arrow.to.id !== 'b') throw new Error(JSON.stringify([arrow.from, arrow.to]))
  if (arrow.arrow !== 'association') throw new Error('kind: ' + arrow.arrow)
  if (arrow.dashed) throw new Error('a solid line was read as dashed')
})

test('a label is the text after the colon', () => {
  const arrow = read('order --> stock : retry three times')
  if (arrow.label !== 'retry three times') throw new Error('label: ' + JSON.stringify(arrow.label))
})

test('the mark decides the direction, not the order of the names', () => {
  const generalised = read('Base <|-- Derived')
  if (generalised.from.id !== 'Derived' || generalised.to.id !== 'Base') throw new Error(JSON.stringify([generalised.from, generalised.to]))
  if (generalised.arrow !== 'generalization') throw new Error('kind: ' + generalised.arrow)
  const implemented = read('Port <|.. Adapter')
  if (implemented.arrow !== 'realization') throw new Error('kind: ' + implemented.arrow)
  const composed = read('Whole *-- Part')
  if (composed.from.id !== 'Whole' || composed.to.id !== 'Part') throw new Error('composition: ' + JSON.stringify([composed.from, composed.to]))
  if (composed.arrow !== 'composition') throw new Error('kind: ' + composed.arrow)
  const aggregated = read('Team o-- Member')
  if (aggregated.arrow !== 'aggregation') throw new Error('kind: ' + aggregated.arrow)
})

test('a dotted line is a dependency unless a mark says otherwise', () => {
  const dependency = read('a ..> b')
  if (!dependency.dashed || dependency.arrow !== 'dependency') throw new Error(JSON.stringify(dependency))
  const marked = read('a <|.. b')
  if (marked.arrow !== 'realization') throw new Error('kind: ' + marked.arrow)
})

test('a line with no mark states a connection and no direction', () => {
  const plain = read('a -- b')
  if (plain.arrow !== 'none') throw new Error('kind: ' + plain.arrow)
  if (plain.from.id !== 'a' || plain.to.id !== 'b') throw new Error(JSON.stringify([plain.from, plain.to]))
})

test('an edge marked at both ends is refused with its reason', () => {
  const refused = readArrow('a <--> b')
  if (typeof refused !== 'string') throw new Error('a two-ended mark was accepted')
  if (!refused.includes('both ends')) throw new Error('the reason: ' + refused)
})

test('a line that is not an arrow is not read as one', () => {
  for (const line of ['component a', 'a', '', 'note right of a : text']) {
    if (readArrow(line) !== undefined) throw new Error('read as an arrow: ' + JSON.stringify(line))
  }
})

test('a decoration on an endpoint is not part of its name', () => {
  const arrow = read('a "1" --> "*" b : many')
  if (arrow.from.id !== 'a' || arrow.to.id !== 'b') throw new Error(JSON.stringify([arrow.from, arrow.to]))
  if (arrow.label !== 'many') throw new Error('label: ' + arrow.label)
})

if (failures > 0) {
  console.log('arrow tests failed:', failures)
  process.exit(1)
}
console.log('all arrow tests passed')
// Opening and closing a boundary: what the line states, and what the reader is told about it.
//
// The parser owns the open stack; this decides only what one line says. A block it cannot draw is refused with the form that would have
// been drawn, so a source can be fixed from the report alone.
import { readBoundary } from '../../lib/render/plantuml-boundary.js'

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

const open = (line, ordinal = 1) => {
  const got = readBoundary(line, 4, ordinal, 'line 5: ')
  if (got?.kind !== 'open') throw new Error('not an open: ' + JSON.stringify(got))
  return got
}

test('a closing brace closes, and nothing else does', () => {
  if (readBoundary('}', 0, 1, '')?.kind !== 'close') throw new Error('} did not close')
  for (const line of ['component a', 'package p', 'x }']) {
    if (readBoundary(line, 0, 1, '') !== undefined) throw new Error('answered for: ' + line)
  }
})

test('a named boundary keeps its alias and its words', () => {
  const got = open('package "Orders" as orders {')
  if (got.id !== 'orders' || got.label !== 'Orders') throw new Error(JSON.stringify(got))
  if (got.solid) throw new Error('a package was drawn solid')
  if (got.line !== 5) throw new Error('line: ' + String(got.line))
})

test('a boundary with no name takes the ordinal it is given', () => {
  const got = open('package {', 7)
  if (got.label !== 'package') throw new Error('label: ' + got.label)
  if (got.id !== 'group-7') throw new Error('id: ' + got.id)
})

test('a state block is drawn solid, a package is not', () => {
  if (!open('state Busy {').solid) throw new Error('a state was drawn dashed')
  if (open('node Web {').solid) throw new Error('a node was drawn solid')
})

test('a decoration is reported and not part of the name', () => {
  const got = open('package payments <<layer>> #lightblue {')
  if (got.label !== 'payments') throw new Error('label: ' + got.label)
  if (got.notes.length !== 2) throw new Error('notes: ' + JSON.stringify(got.notes))
})

test('a block this renderer cannot draw is refused with the form that works', () => {
  // `component` is a boundary keyword, so `component a {` is a boundary named `a`; a word the table does not know is the first case.
  const unknown = readBoundary('gadget a {', 0, 1, 'line 1: ')
  if (unknown?.kind !== 'note' || unknown.channel !== 'refused') throw new Error(JSON.stringify(unknown))
  if (!unknown.message.includes('`gadget a` is not a boundary')) throw new Error(unknown.message)
  const shape = readBoundary('usecase u {', 0, 1, 'line 1: ')
  if (shape?.kind !== 'note') throw new Error(JSON.stringify(shape))
  if (!shape.message.includes('a `usecase` block is not a boundary')) throw new Error(shape.message)
})

test('a partition is a boundary, and its alias names it', () => {
  const got = open('partition "Order flow" as of {')
  if (got.id !== 'of' || got.label !== 'Order flow') throw new Error(JSON.stringify(got))
  if (got.solid) throw new Error('a partition was drawn solid')
})

if (failures > 0) {
  console.log('boundary tests failed:', failures)
  process.exit(1)
}
console.log('all boundary tests passed')
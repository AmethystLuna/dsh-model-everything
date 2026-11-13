// What a declaration line states: its elements, and what the reader is told about its decorations.
//
// Four name forms, a decoration rule and one line that cannot be a declaration. Inside the reading loop each of those could only be
// tested by building a diagram; here one line goes in and the elements come out.
import { readDeclaration } from '../../lib/render/plantuml-declaration.js'

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
  const got = readDeclaration(line, 'line 1: ')
  if (got === undefined) throw new Error('not a declaration: ' + line)
  return got
}

test('a plain declaration declares one element with its own name', () => {
  const got = read('component billing')
  if (got.elements.length !== 1) throw new Error('elements: ' + String(got.elements.length))
  const element = got.elements[0]
  // A component is drawn as a rectangle with a mark in the corner: the shape is `rect`, the role is what tells them apart.
  if (element.id !== 'billing' || element.shape !== 'rect') throw new Error(JSON.stringify(element))
})

test('a quoted, bracketed and plain alias each name the id', () => {
  const quoted = read('component "Order service" as orders').elements[0]
  if (quoted.id !== 'orders' || quoted.label !== 'Order service') throw new Error(JSON.stringify(quoted))
  const bracketed = read('component [Order service] as orders').elements[0]
  if (bracketed.id !== 'orders' || bracketed.label !== 'Order service') throw new Error(JSON.stringify(bracketed))
  const plain = read('component Order as orders').elements[0]
  if (plain.id !== 'orders' || plain.label !== 'Order') throw new Error(JSON.stringify(plain))
})

test('a decoration is reported and never folded into the name', () => {
  // This is the bug the rule exists for: a colour after the name stopped the alias matching, so the line became its own element.
  const got = read('component Api <<service>> #lightblue')
  const element = got.elements[0]
  if (element.id !== 'Api') throw new Error('id: ' + element.id)
  if (got.notes.length !== 2) throw new Error('notes: ' + JSON.stringify(got.notes))
  for (const note of got.notes) if (note.channel !== 'ignored') throw new Error('channel: ' + note.channel)
})

test('a line break written as backslash-n becomes a real newline', () => {
  const element = read('component "first\\nsecond" as pair').elements[0]
  if (element.label !== 'first\nsecond') throw new Error(JSON.stringify(element.label))
})

test('a description line is refused rather than folded into the name', () => {
  const got = read('state Busy : entry / go')
  if (got.elements.length !== 0) throw new Error('it declared something')
  if (got.notes[0]?.channel !== 'refused') throw new Error(JSON.stringify(got.notes))
  if (!got.notes[0].message.includes('note')) throw new Error(got.notes[0].message)
})

test('a bare bracketed name is a rectangle with its own words as the label', () => {
  const got = read('[Disk]')
  if (got.elements[0]?.id !== 'Disk' || got.elements[0]?.shape !== 'rect') throw new Error(JSON.stringify(got.elements))
})

test('a line that declares nothing has no answer', () => {
  // A note is a shape the declaration table knows, so a note line is answered here; the pass that places one beside an element runs first.
  for (const line of ['a --> b', '@startuml', 'package p {', 'skinparam monochrome true']) {
    if (readDeclaration(line, '') !== undefined) throw new Error('answered for: ' + line)
  }
})

test('a parenthesised name is syntax, not part of the name', () => {
  // `usecase (Login)` is the notation's own spelling for a use case.
  const bare = read('usecase (Login)').elements[0]
  if (bare.id !== 'Login' || bare.label !== 'Login') throw new Error(JSON.stringify(bare))
  const aliased = read('usecase (Login) as l').elements[0]
  if (aliased.id !== 'l' || aliased.label !== 'Login') throw new Error(JSON.stringify(aliased))
})

test('an abstract class is a class, and the modifier is reported', () => {
  const got = read('abstract class Card')
  if (got.elements[0]?.id !== 'Card') throw new Error(JSON.stringify(got.elements))
  if (got.notes.length !== 1 || got.notes[0].channel !== 'ignored') throw new Error(JSON.stringify(got.notes))
  if (!got.notes[0].message.includes('modifier')) throw new Error(got.notes[0].message)
})

if (failures > 0) {
  console.log('declaration tests failed:', failures)
  process.exit(1)
}
console.log('all declaration tests passed')
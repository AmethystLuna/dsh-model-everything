// Placing a note: the three answers a note line has, and the direction the hidden edge carries.
//
// A note beside a box is a note and a position. The position is expressed as a hidden edge, and the direction it carries is the one
// thing in this module that has to be read from the box's side rather than the reader's.
import { readNote } from '../../lib/render/plantuml-note.js'

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

const note = (line) => readNote(line, 'line 1: ')

test('a note beside a box names the box, its text and its side', () => {
  const got = note('note right of orders : queued behind the payment')
  if (got?.kind !== 'placed') throw new Error(JSON.stringify(got))
  if (got.target.id !== 'orders') throw new Error('target: ' + got.target.id)
  if (got.noteId !== 'note-orders-1') throw new Error('noteId: ' + got.noteId)
  if (got.text !== 'queued behind the payment') throw new Error('text: ' + got.text)
  if (got.hint !== 'right') throw new Error('hint: ' + got.hint)
})

test('a side above or below is a vertical hint', () => {
  if (note('note top of a : x')?.hint !== 'up') throw new Error('top did not become up')
  if (note('note bottom of a : x')?.hint !== 'down') throw new Error('bottom did not become down')
  if (note('note left of a : x')?.hint !== 'left') throw new Error('left changed')
})

test('a note whose box carries a decoration still finds the box', () => {
  // The box is named the way every other endpoint is: its decorations are removed, so a stereotype or a trailing comma is not part of the
  // id. The alias form (`"Order" as orders`) is not read here - a note target does not take it.
  for (const [line, id] of [['note right of payments <<layer>> : x', 'payments'], ['note right of orders, : x', 'orders']]) {
    const got = note(line)
    if (got?.kind !== 'placed' || got.target.id !== id) throw new Error(line + ': ' + JSON.stringify(got))
  }
  const bracketed = note('note right of [Disk] : x')
  if (bracketed?.kind !== 'placed' || bracketed.target.id !== 'Disk') throw new Error(JSON.stringify(bracketed))
})

test('a note with no text on its line is refused, not placed empty', () => {
  const got = note('note right of orders')
  if (got?.kind !== 'refused') throw new Error(JSON.stringify(got))
  if (!got.message.includes('names no text')) throw new Error(got.message)
})

test('a note attached to the last box names no box and says so', () => {
  const got = note('note right: queued')
  if (got?.kind !== 'refused') throw new Error(JSON.stringify(got))
  if (!got.message.includes('names one')) throw new Error(got.message)
})

test('a note over a box is a position this renderer cannot place', () => {
  const got = note('note over orders : x')
  if (got?.kind !== 'refused') throw new Error(JSON.stringify(got))
  if (!got.message.includes('cannot draw')) throw new Error(got.message)
})

test('a line that places no note has no answer', () => {
  for (const line of ['component a', 'a --> b', 'note as N']) {
    if (note(line) !== undefined) throw new Error('answered for: ' + line)
  }
})

test('a note shape is placed the same way and reports its keyword', () => {
  // `hnote` and `rnote` differ from `note` only in the shape drawn, so the placement is honoured and the shape is said.
  for (const keyword of ['hnote', 'rnote']) {
    const got = note(keyword + ' right of orders : queued')
    if (got?.kind !== 'placed') throw new Error(keyword + ': ' + JSON.stringify(got))
    if (got.target.id !== 'orders' || got.text !== 'queued') throw new Error(keyword + ': ' + JSON.stringify(got))
    if (got.shape !== keyword) throw new Error(keyword + ': shape ' + String(got.shape))
  }
  if (note('note right of orders : queued').shape !== undefined) throw new Error('a plain note claimed a shape')
  // Two notes beside one box are two notes: the ordinal is what keeps their ids apart.
  const first = readNote('note right of orders : one', '', 1)
  const second = readNote('note right of orders : two', '', 2)
  if (first?.noteId === second?.noteId) throw new Error('two notes share an id')
})

if (failures > 0) {
  console.log('note tests failed:', failures)
  process.exit(1)
}
console.log('all note tests passed')
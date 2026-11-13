// The blocks whose lines are not diagram source, collected before any line is read.
//
// A note's block is rewritten into the one-line form the line parser already reads, which is the one side effect here; everything else is
// "these lines belong to that block".
import { collectPageBlocks } from '../../lib/render/plantuml-page-blocks.js'

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

test('a legend block is collected and its lines are skipped', () => {
  const lines = ['@startuml', 'legend', 'first', 'second', 'end legend', 'component a', '@enduml']
  const got = collectPageBlocks(lines)
  if (JSON.stringify(got.blocks.legend) !== JSON.stringify(['first', 'second'])) throw new Error(JSON.stringify(got.blocks.legend))
  if (!got.skip.has(3) || !got.skip.has(4)) throw new Error('the body was not skipped: ' + [...got.skip].join(','))
  if (got.notes.length !== 0) throw new Error('notes: ' + JSON.stringify(got.notes))
})

test('page text collects under the field its keyword names', () => {
  const lines = ['header', 'internal', 'end header', 'caption', 'figure one', 'end caption', 'component a']
  const got = collectPageBlocks(lines)
  if (JSON.stringify(got.blocks.header) !== JSON.stringify(['internal'])) throw new Error(JSON.stringify(got.blocks.header))
  if (JSON.stringify(got.blocks.sourceCaption) !== JSON.stringify(['figure one'])) throw new Error(JSON.stringify(got.blocks.sourceCaption))
})

test('a block title keeps its lines, joined', () => {
  const lines = ['title', 'first', 'second', 'end title', 'component a']
  const got = collectPageBlocks(lines)
  if (got.blocks.title !== 'first\nsecond') throw new Error(JSON.stringify(got.blocks.title))
})

test('a note block is rewritten into the one-line form the line parser reads', () => {
  const lines = ['@startuml', 'note right of a', 'queued', 'end note', 'component a']
  const got = collectPageBlocks(lines)
  if (got.skip.has(1)) throw new Error('a closed note was skipped as if it never closed')
  if (lines[1] !== 'note right of a : queued') throw new Error('rewritten line: ' + String(lines[1]))
})

test('a block that never closes is reported and its body is still skipped', () => {
  const lines = ['legend', 'first', 'second']
  const got = collectPageBlocks(lines)
  if (got.notes.length !== 1) throw new Error('notes: ' + JSON.stringify(got.notes))
  if (!got.notes[0].message.includes('never closed')) throw new Error(got.notes[0].message)
  if (!got.skip.has(2)) throw new Error('an unclosed block let its body through')
})

test('a note that never closes is one sentence, on its own line', () => {
  const lines = ['note right of a', 'queued']
  const got = collectPageBlocks(lines)
  if (got.notes.length !== 1) throw new Error('notes: ' + JSON.stringify(got.notes))
  if (!got.notes[0].message.includes('names no text of its own')) throw new Error(got.notes[0].message)
  if (!got.notes[0].message.startsWith('line 1:')) throw new Error('wrong line: ' + got.notes[0].message)
})

test('a legend that asks for a corner is honoured, and one that asks for another is told', () => {
  const bottom = collectPageBlocks(['legend bottom', 'x', 'end legend'])
  if (bottom.notes.length !== 0) throw new Error('bottom was refused: ' + JSON.stringify(bottom.notes))
  const right = collectPageBlocks(['legend right', 'x', 'end legend'])
  if (right.notes.length !== 1 || right.notes[0].channel !== 'ignored') throw new Error(JSON.stringify(right.notes))
  if (!right.notes[0].message.includes('legend under the drawing')) throw new Error(right.notes[0].message)
})

if (failures > 0) {
  console.log('page-block tests failed:', failures)
  process.exit(1)
}
console.log('all page-block tests passed')
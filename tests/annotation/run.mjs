// The annotation module: the text a note becomes, and the page it is put into.
//
// This module had no suite of its own - it was reached only through the client and drawing suites - and it is the one
// place where a note is turned into a message. What it decides is small and testable without a browser: the block's
// shape, which element is the composer, what a write reports, and what a blank note means.
import {
  annotationBlock, annotationMessage, findComposer, pageCensus, fillComposer, submitComposer,
  pushNote, pushBlock, prependBlock, composerRect, sessionFromLocation, withoutEmptyQuestion,
} from '../../lib/annotation.js'

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

/** A document that answers the selectors a case cares about. */
const doc = (map, options = {}) => ({
  querySelector(selector) { return selector in map ? map[selector] : null },
  querySelectorAll(selector) {
    if (options.counts !== undefined) return { length: options.counts[selector] ?? 0 }
    return { length: selector in map ? 1 : 0 }
  },
})

const field = (value = '') => ({ value, tagName: 'TEXTAREA', focus() {}, dispatchEvent() { return true } })

test('a block says how many items, which drawing, and what each one marked', () => {
  const block = annotationBlock([
    { nodeId: 'n1', note: 'too many boxes' },
    { nodeId: 'n2', label: 'The queue', note: '' },
  ])
  if (!block.includes('Diagram annotations - 2 items')) throw new Error('no count: ' + block.slice(0, 60))
  if (!block.includes('Please answer each item separately')) throw new Error('no instruction')
  if (!block.includes('node n1 - too many boxes')) throw new Error('the first note is missing')
  // A blank note is not dropped: 'marked, no note' is a different message from silence.
  if (!block.includes('The queue (n2) - (marked, no note)')) throw new Error('a blank note was dropped: ' + block)
})

test('one item is one item, and a caption is stated once', () => {
  const block = annotationMessage({ nodeId: 'n1', note: 'x', caption: 'Fig 2' })
  if (!block.includes('1 item')) throw new Error('the singular is wrong: ' + block.slice(0, 40))
  if (!block.includes('Drawing: Fig 2')) throw new Error('the caption is missing')
  const uncaptioned = annotationMessage({ nodeId: 'n1', note: 'x', caption: '   ' })
  if (uncaptioned.includes('Drawing:')) throw new Error('a blank caption was printed')
})

test('the composer is the marked writing surface, never the drawing board', () => {
  const marked = field('hi')
  if (findComposer(doc({ '[data-focus-flow] textarea': marked })) !== marked) throw new Error('the marked textarea was not found')
  // A wrapper carrying the mark, with the surface inside it.
  const inner = field('inner')
  const wrapper = { querySelector: (selector) => (selector === 'textarea, [contenteditable="true"]' ? inner : null) }
  if (findComposer(doc({ '[data-focus-flow]': wrapper })) !== inner) throw new Error('the wrapper was not unwrapped')
  if (findComposer(undefined) !== undefined) throw new Error('no document answered an element')
  if (findComposer(doc({})) !== undefined) throw new Error('an empty page answered an element')
})

test('a write appends above a half-written draft, and reports what it did', () => {
  const box = field('half a message')
  const page = doc({ '[data-focus-flow] textarea': box })
  if (fillComposer(page, 'the annotation') !== 'filled') throw new Error('the write did not report filled')
  if (box.value !== 'half a message\n\nthe annotation') throw new Error('value: ' + JSON.stringify(box.value))
  const empty = field('   ')
  fillComposer(doc({ '[data-focus-flow] textarea': empty }), 'the annotation')
  if (empty.value !== 'the annotation') throw new Error('a blank box was not replaced: ' + JSON.stringify(empty.value))
  if (fillComposer(doc({}), 'x') !== 'no-composer') throw new Error('a missing composer did not report no-composer')
})

test('a note with nothing marked says nothing, and a missing box says so in words', () => {
  if (pushNote(doc({}), null, 'x', 'c', false) !== '') throw new Error('a null pick produced a sentence')
  const page = doc({ '[data-focus-flow] textarea': field('') })
  if (pushNote(page, { id: 'n1' }, 'note', 'cap', false) !== '已放入输入框') throw new Error('the not-sent sentence is wrong')
  if (!pushNote(doc({}), { id: 'n1' }, 'note', 'cap', false).includes('没找到输入框')) throw new Error('a missing box did not say so')
  if (pushBlock(doc({}), [], 'cap', false) !== '') throw new Error('an empty block produced a sentence')
  if (!pushBlock(page, [{ nodeId: 'n1', note: 'a' }, { nodeId: 'n2', note: 'b' }], 'cap', false).includes('2 条图注')) throw new Error('the block did not count its items')
  if (!prependBlock(doc({}), [{ nodeId: 'n1' }], 'cap').includes('没找到输入框')) throw new Error('prepend did not report a missing box')
})

test('a prepended block goes above the reader s draft, and an empty box takes it as the message', () => {
  const box = field('my own words')
  const page = doc({ '[data-focus-flow] textarea': box })
  prependBlock(page, [{ nodeId: 'n1', note: 'x' }], 'cap')
  if (!box.value.startsWith('Diagram annotations')) throw new Error('the block is not first: ' + box.value.slice(0, 40))
  if (!box.value.endsWith('my own words')) throw new Error('the draft was lost: ' + box.value.slice(-30))
  if (!prependBlock(doc({}), [], 'cap').includes('') === true) throw new Error('an empty list produced a sentence')
})

test('the rect is the writing surface, not the wrapper the mark sits on', () => {
  const surface = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 30 }) }
  const wrapper = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 90 }), querySelector: () => surface }
  const rect = composerRect(doc({ '[data-focus-flow]': wrapper }))
  if (rect === undefined) throw new Error('no rect')
  if (rect.width !== 200 || rect.top !== 20) throw new Error('the wrapper was measured: ' + JSON.stringify(rect))
  if (composerRect(doc({})) !== undefined) throw new Error('a page with no composer produced a rect')
})

test('the session is read from the address, and a page with none says so', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000'
  if (sessionFromLocation({ pathname: '/s/session-' + uuid }) !== 'session-' + uuid) throw new Error('the minted id was not read')
  if (sessionFromLocation({ search: '?id=' + uuid }) !== uuid) throw new Error('the bare uuid was not read')
  if (sessionFromLocation({ search: '?session=abc-1' }) !== 'abc-1') throw new Error('the parameter form was not read')
  if (sessionFromLocation({ pathname: '/nothing' }) !== undefined) throw new Error('an address with no id produced one')
  if (sessionFromLocation(undefined) !== undefined) throw new Error('no location produced an id')
})

test('the question line is removed only when it is the last thing', () => {
  if (withoutEmptyQuestion('a\n\nQuestion:') !== 'a') throw new Error('the trailing question was kept')
  if (withoutEmptyQuestion('Question:\nanswered') !== 'Question:\nanswered') throw new Error('a question with an answer was removed')
})

test('a census counts the page without reading what the reader typed', () => {
  const page = doc({}, { counts: { textarea: 2, '[contenteditable="true"]': 1 } })
  const census = pageCensus(page)
  if (!census.includes('textarea=2') || !census.includes('editable=1')) throw new Error('census: ' + census)
  if (pageCensus(undefined) !== 'no document') throw new Error('no document was not reported')
})

if (failures > 0) {
  console.log('annotation tests failed:', failures)
  process.exit(1)
}
console.log('all annotation tests passed')
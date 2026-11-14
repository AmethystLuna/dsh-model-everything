// The annotation module, second half: the rich-text composer and the contenteditable path.
//
// A page with no browser still has `globalThis.Event`; a page with a rich editor has `execCommand`. Both are faked
// here, because the branch they decide - insertHTML, then insertText per line, then a plain assignment - is what a
// reader's draft survives.
import { fillComposer, submitComposer, pushNote, prependBlock } from '../../lib/annotation.js'

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

const page = (element) => ({ querySelector: (selector) => (typeof element === 'function' ? element(selector) : element), querySelectorAll: () => ({ length: 0 }) })

test('a contenteditable takes the block through insertHTML, with its angle brackets escaped', () => {
  const calls = []
  const editable = { textContent: 'draft', focus() {}, dispatchEvent() { return true }, querySelector: () => null }
  const pageWithEditor = page(editable)
  const original = globalThis.document
  globalThis.document = { execCommand(command, showUi, value) { calls.push([command, value]); return true } }
  try {
    const placed = fillComposer(pageWithEditor, 'a <b> & c')
    if (placed !== 'filled') throw new Error('the write did not report filled')
  } finally {
    globalThis.document = original
  }
  const inserted = calls.find(([command]) => command === 'insertHTML')
  if (inserted === undefined) throw new Error('insertHTML was not used: ' + JSON.stringify(calls))
  if (!inserted[1].includes('&lt;b&gt;') || !inserted[1].includes('&amp;')) throw new Error('the text was not escaped: ' + inserted[1])
})

test('a document with no insertHTML falls back to one insertText per line', () => {
  const calls = []
  const editable = { textContent: '', focus() {}, dispatchEvent() { return true }, querySelector: () => null }
  const original = globalThis.document
  globalThis.document = {
    execCommand(command, showUi, value) {
      calls.push([command, value])
      return command !== 'insertHTML'
    },
  }
  try {
    fillComposer(page(editable), 'one\ntwo')
  } finally {
    globalThis.document = original
  }
  const text = calls.filter(([command]) => command === 'insertText').map(([, value]) => value)
  if (text.join('|') !== 'one|two') throw new Error('the lines were not inserted separately: ' + JSON.stringify(calls))
  if (!calls.some(([command]) => command === 'insertParagraph')) throw new Error('no paragraph between the lines')
})

test('with no editing command at all the block is assigned to the element', () => {
  // The measured fallback: a page that has a contenteditable but no execCommand keeps the text, at the cost of the
  // editor's own model - which is why it is last.
  const editable = { textContent: 'draft', focus() {}, dispatchEvent() { return true }, querySelector: () => null }
  const original = globalThis.document
  globalThis.document = undefined
  try {
    fillComposer(page(editable), 'block')
  } finally {
    globalThis.document = original
  }
  if (!String(editable.textContent).includes('block')) throw new Error('the block was not assigned: ' + String(editable.textContent))
  if (!String(editable.textContent).startsWith('draft')) throw new Error('the draft was lost: ' + String(editable.textContent))
})

test('a keydown is dispatched only where the page can build one', () => {
  const seen = []
  const box = { value: 'x', tagName: 'TEXTAREA', dispatchEvent(event) { seen.push(event); return true } }
  const original = globalThis.KeyboardEvent
  try {
    globalThis.KeyboardEvent = undefined
    if (submitComposer(page(box)) !== false) throw new Error('a page without KeyboardEvent promised a send')
    globalThis.KeyboardEvent = class { constructor(type, init) { this.type = type; this.key = init.key } }
    if (submitComposer(page(box)) !== true) throw new Error('a page with KeyboardEvent did not send')
    const key = seen.find((event) => event?.type === 'keydown')
    if (key === undefined || key.key !== 'Enter') throw new Error('the key was not Enter: ' + JSON.stringify(seen))
  } finally {
    globalThis.KeyboardEvent = original
  }
})

test('a write on a page whose event constructor throws still reports filled', () => {
  // `new Event` is not available everywhere; the text is what matters, not the notification.
  const box = { value: '', tagName: 'TEXTAREA', focus() {}, dispatchEvent() { return true } }
  const original = globalThis.Event
  globalThis.Event = class { constructor() { throw new Error('no Event here') } }
  try {
    if (fillComposer(page(box), 'text') !== 'filled') throw new Error('the write did not report filled')
  } finally {
    globalThis.Event = original
  }
  if (box.value !== 'text') throw new Error('value: ' + JSON.stringify(box.value))
})

test('a note is sent when the page can send it, and says so when it cannot', () => {
  const box = { value: '', tagName: 'TEXTAREA', focus() {}, dispatchEvent() { return true } }
  const original = globalThis.KeyboardEvent
  globalThis.KeyboardEvent = class { constructor() {} }
  try {
    if (pushNote(page(box), { id: 'n1' }, 'note', 'cap', true) !== '已发送') throw new Error('a sendable page did not send')
    globalThis.KeyboardEvent = undefined
    const second = { value: '', tagName: 'TEXTAREA', focus() {}, dispatchEvent() { return true } }
    const sentence = pushNote(page(second), { id: 'n1' }, 'note', 'cap', true)
    if (!sentence.includes('按一次回车发送')) throw new Error('an unsendable page promised a send: ' + sentence)
  } finally {
    globalThis.KeyboardEvent = original
  }
})

test('prepend on a rich editor goes through the same write and reports the count', () => {
  const editable = { textContent: '', focus() {}, dispatchEvent() { return true }, querySelector: () => null }
  const original = globalThis.document
  globalThis.document = { execCommand() { return true } }
  try {
    const sentence = prependBlock(page(editable), [{ nodeId: 'n1', note: 'x' }], 'cap')
    if (!sentence.includes('1 条图注')) throw new Error('sentence: ' + sentence)
  } finally {
    globalThis.document = original
  }
})

if (failures > 0) {
  console.log('annotation-editor tests failed:', failures)
  process.exit(1)
}
console.log('all annotation-editor tests passed')
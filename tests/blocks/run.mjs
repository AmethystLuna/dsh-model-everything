// Walking the source for blocks that are not diagram lines.
//
// The collector decides one thing: which lines the parser must not read. What a block means - a legend's text, a note that gets
// rewritten, page text - is the definition's business, so the cases here are about the walk.
import { collectBlocks } from '../../lib/render/blocks.js'

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

const collect = (lines, options = {}) => {
  const skip = new Set()
  const seen = []
  collectBlocks(lines, skip, {
    open: (line) => (line === 'open' ? { text: [] } : undefined),
    closes: (line) => line === 'end',
    text: (state, line) => state.text.push(line),
    close: (state) => seen.push(state.text.join('+')),
    ...options,
  })
  return { skip, seen }
}

test('a block\'s body and its closing line are skipped, and its text is gathered', () => {
  const { skip, seen } = collect(['before', 'open', 'one', 'two', 'end', 'after'])
  if (JSON.stringify(seen) !== JSON.stringify(['one+two'])) throw new Error('gathered: ' + JSON.stringify(seen))
  if (JSON.stringify([...skip].sort((a, b) => a - b)) !== JSON.stringify([2, 3, 4])) {
    throw new Error('skipped: ' + JSON.stringify([...skip]))
  }
})

test('the opening line is skipped only when the definition asks', () => {
  const keepless = collect(['open', 'one', 'end'])
  if (keepless.skip.has(0)) throw new Error('the opener was skipped unasked')
  const withOpen = collect(['open', 'one', 'end'], { skipOpening: true })
  if (!withOpen.skip.has(0)) throw new Error('the opener was not skipped when asked')
})

test('blank lines inside a block are skipped and not gathered', () => {
  const { skip, seen } = collect(['open', '', 'one', 'end'])
  if (JSON.stringify(seen) !== JSON.stringify(['one'])) throw new Error('gathered: ' + JSON.stringify(seen))
  if (!skip.has(1)) throw new Error('a blank body line was left readable')
})

test('two blocks in one source are both gathered', () => {
  const { seen } = collect(['open', 'one', 'end', 'open', 'two', 'end'])
  if (JSON.stringify(seen) !== JSON.stringify(['one', 'two'])) throw new Error('gathered: ' + JSON.stringify(seen))
})

test('a block that is never closed swallows its lines and runs no close action', () => {
  const { skip, seen } = collect(['open', 'one', 'two'])
  if (seen.length !== 0) throw new Error('an unclosed block ran a close action')
  if (JSON.stringify([...skip].sort((a, b) => a - b)) !== JSON.stringify([1, 2])) {
    throw new Error('skipped: ' + JSON.stringify([...skip]))
  }
})

test('the close action may rewrite the opening line', () => {
  const lines = ['open', 'one', 'two', 'end']
  const skip = new Set()
  collectBlocks(lines, skip, {
    open: (line, index) => (line === 'open' ? { index, text: [] } : undefined),
    closes: (line) => line === 'end',
    text: (state, line) => state.text.push(line),
    close: (state, source, at) => { source[at] = state.text.join(' ') },
  })
  if (lines[0] !== 'one two') throw new Error('the opener was not rewritten: ' + lines[0])
  if (skip.has(0)) throw new Error('a rewritten opener must stay readable')
})

if (failures > 0) {
  console.log('blocks tests failed:', failures)
  process.exit(1)
}
console.log('all blocks tests passed')
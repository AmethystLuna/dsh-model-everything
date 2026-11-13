// A label that does not fit has to wrap, and the box has to grow for it.
//
// The failure this guards is text drawn past the edge of its own box: the drawing still renders, still has the right number of shapes and still
// clears the boxes, so nothing else here notices. `measure` is the decision, so the suite checks it directly and then checks that a rendered box
// carries exactly the lines it decided on.
import { MAX_LINE_CHARS, MAX_NODE_WIDTH, TEXT_PADDING, measure, textWidth, wrapLine } from '../../lib/render/text.js'
import { render } from '../../lib/render/index.js'

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

const LONG = 'One very long label that certainly will not fit on a single line inside a box'

const boxOf = (source) => render({ source }).canvas.shapes.find((shape) => shape.kind === 'box')

test('a short label stays on one line', () => {
  const measured = measure('Short')
  if (measured.lines.length !== 1) throw new Error('lines: ' + JSON.stringify(measured.lines))
  if (measured.lines[0] !== 'Short') throw new Error('the label was rewritten: ' + measured.lines[0])
})

test('a long label wraps, and no line exceeds the wrap limit', () => {
  const measured = measure(LONG)
  if (measured.lines.length < 2) throw new Error('a long label stayed on one line')
  for (const line of measured.lines) {
    if (line.length > MAX_LINE_CHARS) throw new Error('a line is longer than the limit: ' + String(line.length) + ' - ' + line)
  }
  // Wrapping may not drop words: every word of the label is still there, in order.
  if (measured.lines.join(' ').replace(/\s+/g, ' ') !== LONG) throw new Error('wrapping changed the text: ' + measured.lines.join(' | '))
})

test('the box is wide enough for its longest line', () => {
  for (const label of ['Short', LONG, 'A single quite long wordthatkeepsgoingonandonandonandon']) {
    const measured = measure(label)
    const longest = measured.lines.reduce((max, line) => Math.max(max, line.length), 0)
    const needed = textWidth('x'.repeat(longest)) + TEXT_PADDING * 2
    if (measured.width + 0.01 < Math.min(needed, MAX_NODE_WIDTH)) {
      throw new Error(JSON.stringify(label).slice(0, 30) + ': width ' + String(measured.width) + ' for a line needing ' + String(needed))
    }
    if (measured.width > MAX_NODE_WIDTH) throw new Error('the box is wider than the cap: ' + String(measured.width))
  }
})

test('the box grows with the number of lines', () => {
  const short = measure('Short')
  const long = measure(LONG)
  if (long.height <= short.height) throw new Error('heights: ' + String(short.height) + ' and ' + String(long.height))
})

test('a rendered box carries the lines the measurement decided on', () => {
  const box = boxOf('graph TD\n  a[' + LONG + ']')
  if (box === undefined) throw new Error('no box was drawn')
  const measured = measure(LONG)
  if (JSON.stringify(box.lines) !== JSON.stringify(measured.lines)) throw new Error('lines: ' + JSON.stringify(box.lines))
  if (Math.abs(box.height - measured.height) > 0.01) throw new Error('height ' + String(box.height) + ' against ' + String(measured.height))
})

test('wrapLine leaves a line that already fits alone', () => {
  // The control: a wrapper that split everything would pass the cases above.
  const words = wrapLine('fits easily')
  if (words.length !== 1 || words[0] !== 'fits easily') throw new Error('a fitting line was split: ' + JSON.stringify(words))
})

if (failures > 0) {
  console.log('text-wrap tests failed:', failures)
  process.exit(1)
}
console.log('all text-wrap tests passed')
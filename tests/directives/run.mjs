// Which lines are not diagram source, and what the reader is told about each.
//
// These eight branches lived in the middle of the reading loop, so the only test they could have was a whole diagram. Here one line goes
// in and one answer comes out: drawn (no answer), dropped with a reason, or refused.
import { isTogetherOpener, readDirective } from '../../lib/render/plantuml-directives.js'
import { readPageLine } from '../../lib/render/plantuml-page.js'

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

const answer = (line) => readDirective(line, 'line 1: ')

test('a preprocessor directive is dropped with a reason', () => {
  for (const line of ['!define FOO 1', '!theme plain', '!pragma verbose', '!function f']) {
    const got = answer(line)
    if (got?.channel !== 'ignored') throw new Error(line + ': ' + JSON.stringify(got))
    if (!got.message.includes('preprocessor directive')) throw new Error(line + ': ' + got.message)
  }
})

test('an include is refused: the file it names is never read', () => {
  const got = answer('!include common.puml')
  if (got?.channel !== 'refused') throw new Error(JSON.stringify(got))
  if (!got.message.includes('would be missing')) throw new Error(got.message)
})

test('a layout control keeps its own reason, not the preprocessor one', () => {
  const pragma = answer('!pragma layout smetana')
  if (pragma?.channel !== 'ignored' || !pragma.message.includes('layout control')) throw new Error(JSON.stringify(pragma))
  const direction = answer('top to bottom direction')
  if (direction?.channel !== 'ignored' || !direction.message.includes('layout control')) throw new Error(JSON.stringify(direction))
})

test('hide and show say there is nothing to hide', () => {
  for (const line of ['hide empty members', 'show stereotype']) {
    const got = answer(line)
    if (got?.channel !== 'ignored' || !got.message.includes('no compartments')) throw new Error(line + ': ' + JSON.stringify(got))
  }
})

test('allowmixing and a bare together say what they would have done', () => {
  const mixing = answer('allowmixing')
  if (mixing?.channel !== 'ignored' || !mixing.message.includes('mixing diagram families')) throw new Error(JSON.stringify(mixing))
  const together = answer('together')
  if (together?.channel !== 'ignored' || !together.message.includes('names no boxes')) throw new Error(JSON.stringify(together))
})

test('a line that is diagram source has no answer', () => {
  for (const line of ['component a', 'a --> b', 'package p {', '@startuml', 'title x']) {
    if (answer(line) !== undefined) throw new Error('answered for source: ' + line)
  }
})

test('the opener of a together block is recognised, and nothing else is', () => {
  for (const line of ['together {']) {
    if (!isTogetherOpener(line)) throw new Error('missed: ' + line)
  }
  for (const line of ['together', 'component a', 'together{ x }']) {
    if (isTogetherOpener(line)) throw new Error('recognised as an opener: ' + line)
  }
})

const page = (line) => readPageLine(line, 'line 1: ')

test('a title names the drawing, and page text sets its field', () => {
  const title = page('title Architecture, in one line')
  if (title?.kind !== 'title' || title.text !== 'Architecture, in one line') throw new Error(JSON.stringify(title))
  for (const [line, field] of [['header internal', 'header'], ['footer revised 2', 'footer'], ['caption figure one', 'sourceCaption']]) {
    const got = page(line)
    if (got?.kind !== 'pageText' || got.field !== field) throw new Error(line + ': ' + JSON.stringify(got))
  }
})

test('page text with no words is refused', () => {
  const got = page('header ""')
  if (got?.kind !== 'note' || got.channel !== 'refused') throw new Error(JSON.stringify(got))
  if (!got.message.includes('names no text')) throw new Error(got.message)
})

test('a delivery size is honoured inside its range and refused outside', () => {
  const doubled = page('scale 2')
  if (doubled?.kind !== 'scale' || doubled.factor !== 2) throw new Error(JSON.stringify(doubled))
  const tooBig = page('scale 20')
  if (tooBig?.kind !== 'note' || !tooBig.message.includes('0.5 to 8')) throw new Error(JSON.stringify(tooBig))
  const bySize = page('scale 200 width')
  if (bySize?.kind !== 'note' || !bySize.message.includes('`scale 2` is the form')) throw new Error(JSON.stringify(bySize))
})

test('a background colour is paper, and a named colour is refused', () => {
  const painted = page('skinparam backgroundColor #eef4ff')
  if (painted?.kind !== 'background' || painted.value !== '#eef4ff') throw new Error(JSON.stringify(painted))
  const named = page('skinparam backgroundColor blue')
  if (named?.kind !== 'note' || !named.message.includes('#rgb')) throw new Error(JSON.stringify(named))
})

test('a skinparam that is already satisfied says so, and another is styling', () => {
  const ortho = page('skinparam linetype ortho')
  if (ortho?.kind !== 'note' || !ortho.message.includes('already')) throw new Error(JSON.stringify(ortho))
  const styled = page('skinparam monochrome true')
  if (styled?.kind !== 'note' || !styled.message.includes('styling this renderer does not have')) throw new Error(JSON.stringify(styled))
})

test('a line that is not a page line has no answer', () => {
  for (const line of ['component a', 'a --> b', '!include x.puml']) {
    if (page(line) !== undefined) throw new Error('answered for: ' + line)
  }
})

if (failures > 0) {
  console.log('directive tests failed:', failures)
  process.exit(1)
}
console.log('all directive tests passed')
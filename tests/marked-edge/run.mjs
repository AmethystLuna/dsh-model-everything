// Edges that carry more than an arrow: a direction, a hidden marker, and a machine's start.
//
// Each states a constraint rather than a connection. The hidden form is tested before the direction form on purpose: a form that matches
// neither becomes a declaration of an element named after the whole line, which is this renderer's worst answer.
import { readMarked } from '../../lib/render/plantuml-marked-edge.js'

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
  const got = readMarked(line)
  if (got === undefined) throw new Error('not a marked line: ' + line)
  return got
}

test('a direction says where the far box goes, and keeps the label', () => {
  const down = read('a -down-> b : uses')
  if (down.kind !== 'edge') throw new Error('kind: ' + down.kind)
  if (down.hint !== 'down' || down.label !== 'uses') throw new Error(JSON.stringify(down))
  if (down.from.id !== 'a' || down.to.id !== 'b') throw new Error(JSON.stringify([down.from, down.to]))
  for (const side of ['up', 'left', 'right']) {
    const got = read('a -' + side + '-> b')
    if (got.hint !== side) throw new Error(side + ' became ' + String(got.hint))
  }
})

test('a hidden edge ranks two boxes and is never drawn', () => {
  const got = read('a -[hidden]-> b')
  if (got.kind !== 'edge' || got.invisible !== true) throw new Error(JSON.stringify(got))
  if (got.hint !== undefined) throw new Error('the hidden form took a direction')
})

test('a hidden edge is read as hidden, not as a direction with a bracketed name', () => {
  // The two forms overlap: `-[hidden]->` also looks like `-` + a bracketed token + `->`.
  const got = read('a -[hidden]-> "Some Box"')
  if (got.invisible !== true) throw new Error(JSON.stringify(got))
  if (got.to.id === '[hidden]') throw new Error('the marker became an element')
})

test('a start marker names the state the machine begins in', () => {
  const got = read('[*] --> pending')
  if (got.kind !== 'start' || got.target.id !== 'pending') throw new Error(JSON.stringify(got))
})

test('a machine that is only a start and an end is drawn as nothing', () => {
  if (read('[*] --> [*]').kind !== 'selfLoop') throw new Error('not read as the empty machine')
})

test('a plain arrow is not a marked line', () => {
  for (const line of ['a --> b', 'component a', 'note right of a : x']) {
    if (readMarked(line) !== undefined) throw new Error('answered for: ' + line)
  }
})

test('a style in brackets is reported, and the arrow is still an edge', () => {
  // Without this, `a -[#blue]-> b` matches no edge form and is declared as one element named after the whole line.
  const got = read('a -[#blue]-> b : uses')
  if (got.kind !== 'edge') throw new Error('kind: ' + got.kind)
  if (got.from.id !== 'a' || got.to.id !== 'b') throw new Error(JSON.stringify([got.from, got.to]))
  if (got.style !== '#blue') throw new Error('style: ' + String(got.style))
  if (got.label !== 'uses') throw new Error('label: ' + got.label)
  if (got.invisible !== undefined) throw new Error('a styled edge was read as hidden')
})

if (failures > 0) {
  console.log('marked-edge tests failed:', failures)
  process.exit(1)
}
console.log('all marked-edge tests passed')
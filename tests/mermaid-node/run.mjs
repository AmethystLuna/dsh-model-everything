// One Mermaid node token: its id, its label and the shape it asked for.
//
// The delimiters nest, so the order they are tried in decides the answer: a matcher that took `([Text])` as a round box left `[Text]` as the
// label. Every shape below is one line of the manual, and the label must come out without its delimiters.
import { readNode } from '../../lib/render/mermaid-node.js'

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

const read = (token) => {
  const got = readNode(token)
  if (got === undefined) throw new Error('not a node: ' + token)
  return got
}

test('each delimiter pair is one shape, and the label loses its delimiters', () => {
  const cases = [
    ['a[Text]', 'a', 'Text', 'rect'],
    ['a(Round)', 'a', 'Round', 'stadium'],
    ['a([Stadium])', 'a', 'Stadium', 'stadium'],
    ['a[[Sub]]', 'a', 'Sub', 'subroutine'],
    ['a[(Cyl)]', 'a', 'Cyl', 'cylinder'],
    ['a((Circle))', 'a', 'Circle', 'circle'],
    ['a{Diamond}', 'a', 'Diamond', 'diamond'],
    ['a{{Hex}}', 'a', 'Hex', 'hexagon'],
    ['a>Flag]', 'a', 'Flag', 'rect'],
    ['a[/Para/]', 'a', 'Para', 'rect'],
    ['a[\\Trap\\]', 'a', 'Trap', 'rect'],
  ]
  for (const [token, id, label, shape] of cases) {
    const got = read(token)
    if (got.id !== id) throw new Error(token + ': id ' + got.id)
    if (got.label !== label) throw new Error(token + ': label ' + JSON.stringify(got.label))
    if (got.shape !== shape) throw new Error(token + ': shape ' + String(got.shape))
  }
})

test('a token with no delimiters is an id alone', () => {
  const got = read('billing')
  if (got.id !== 'billing') throw new Error(got.id)
  if (got.label !== undefined) throw new Error('a label appeared: ' + String(got.label))
  if (got.shape !== undefined) throw new Error('a shape appeared: ' + String(got.shape))
})

test('a quoted label loses its quotes', () => {
  const got = read('a["Two words"]')
  if (got.label !== 'Two words') throw new Error(JSON.stringify(got.label))
})

test('a token that is not a node has no answer', () => {
  for (const token of ['', '--> b', '1bad[Text]', 'a[unclosed']) {
    if (readNode(token) !== undefined) throw new Error('answered for: ' + JSON.stringify(token))
  }
})

test('the diamond and the hexagon keep their own shapes', () => {
  // Both are braces; only the doubled pair is a hexagon.
  if (read('a{x}').shape !== 'diamond') throw new Error('single braces are not a diamond')
  if (read('a{{x}}').shape !== 'hexagon') throw new Error('double braces are not a hexagon')
})

if (failures > 0) {
  console.log('mermaid-node tests failed:', failures)
  process.exit(1)
}
console.log('all mermaid-node tests passed')
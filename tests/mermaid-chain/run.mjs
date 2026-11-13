// A Mermaid line that states several connections: a chain, or a group of endpoints joined by `&`.
//
// Read as one line these states no connection between two nodes, and the whole line was refused - three boxes lost because the source
// wrote one line for them.
import { readChain } from '../../lib/render/mermaid-chain.js'

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

const links = (line) => {
  const got = readChain(line)
  if (got === undefined) throw new Error('not a chain: ' + line)
  return got.map((link) => [link.from, link.to, link.arrow, link.label ?? ''])
}

test('a chain is one connection per pair, in order', () => {
  if (JSON.stringify(links('a --> b --> c')) !== JSON.stringify([['a', 'b', '-->', ''], ['b', 'c', '-->', '']])) {
    throw new Error(JSON.stringify(links('a --> b --> c')))
  }
})

test('several sources are one connection each', () => {
  const got = links('a & b --> c')
  if (JSON.stringify(got) !== JSON.stringify([['a', 'c', '-->', ''], ['b', 'c', '-->', '']])) throw new Error(JSON.stringify(got))
})

test('several targets are one connection each', () => {
  const got = links('a --> b & c')
  if (JSON.stringify(got) !== JSON.stringify([['a', 'b', '-->', ''], ['a', 'c', '-->', '']])) throw new Error(JSON.stringify(got))
})

test('a pipe label belongs to the arrow it follows', () => {
  const got = links('a -->|one| b -->|two| c')
  if (JSON.stringify(got) !== JSON.stringify([['a', 'b', '-->', 'one'], ['b', 'c', '-->', 'two']])) throw new Error(JSON.stringify(got))
})

test('the arrow kind is carried, not flattened', () => {
  const got = links('a -.-> b -.-> c')
  if (got[0]?.[2] !== '-.->' || got[1]?.[2] !== '-.->') throw new Error(JSON.stringify(got))
  const thick = links('a ==> b ==> c')
  if (thick[0]?.[2] !== '==>') throw new Error(JSON.stringify(thick))
})

test('one connection is not a chain, so the caller keeps it', () => {
  for (const line of ['a --> b', 'a -->|x| b', 'a[Text] --> b']) {
    if (readChain(line) !== undefined) throw new Error('answered for: ' + line)
  }
})

test('an ampersand inside a label is text, not a separator', () => {
  // The escape case that caught this: `A & B` in a label became two boxes and lost the label.
  const got = links('a["Tom & Jerry"] --> b')
  if (got.length !== 1) throw new Error(JSON.stringify(got))
  if (got[0]?.[0] !== 'a["Tom & Jerry"]') throw new Error(JSON.stringify(got))
})

if (failures > 0) {
  console.log('mermaid-chain tests failed:', failures)
  process.exit(1)
}
console.log('all mermaid-chain tests passed')
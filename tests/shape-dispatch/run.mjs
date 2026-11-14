// A shape the union names is a shape the writer draws, and a shape it does not name is a compile error.
//
// The writer's last branch used to be `default`, so a rectangle, a node with no shape, and any value the union does not
// name all landed there and were drawn as a rounded rectangle with nothing said about it. `dropped` counts only nodes that
// never reached the painter, so a typo'd shape would draw, count as drawn, and pass. The union's members are listed now and
// the branch after them narrows to `never`.
import { readFileSync } from 'node:fs'

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

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const TYPES = readFileSync(repo + 'src/render/model.ts', 'utf8').replace(/\r\n/g, '\n')
const WRITER = readFileSync(repo + 'src/render/svg.ts', 'utf8').replace(/\r\n/g, '\n')

const union = (() => {
  const block = /export type NodeShape =([\s\S]*?)\n\n/.exec(TYPES)
  if (block === null) throw new Error('the NodeShape union is not where it was')
  return [...block[1].matchAll(/'([a-z]+)'/g)].map((match) => match[1])
})()

const cases = (() => {
  const box = WRITER.slice(WRITER.indexOf('  box: (shape, colours) => {'))
  const body = box.slice(0, box.indexOf('\n  },', 0))
  return [...body.matchAll(/case '([a-z]+)':/g)].map((match) => match[1])
})()

test('the union was read, so the checks below mean something', () => {
  if (union.length < 10) throw new Error('only ' + String(union.length) + ' shapes were read')
  if (cases.length < 10) throw new Error('only ' + String(cases.length) + ' cases were read')
})

test('every shape the union names has its own case', () => {
  const missing = union.filter((shape) => !cases.includes(shape))
  if (missing.length > 0) throw new Error('drawn by the fallback, not by a case: ' + missing.join(', '))
})

test('a node with no shape is the rectangle, named as such', () => {
  // The other half of the old fallback: a source that declares no shape still has to draw.
  if (!WRITER.includes('case undefined:')) throw new Error('no case for a node the source gave no shape')
})

test('the branch after the cases cannot be reached without a compile error', () => {
  const narrows = /const unhandled: never = shape\.shape/.test(WRITER)
  if (!narrows) throw new Error('the fallback does not narrow to never, so a new shape would draw silently')
})

if (failures > 0) {
  console.log('shape-dispatch tests failed:', failures)
  process.exit(1)
}
console.log('all shape-dispatch tests passed')
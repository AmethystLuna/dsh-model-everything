// The routing map is generated from the shipped catalog, and it drifted once already: the skill
// added after it was written did not appear in it, because nothing regenerated it and nothing
// compared. A generated artifact with no drift test is a snapshot that quietly becomes false.
//
// Documents, not code: this checks that the map still describes the catalog, and that the section
// which assigns the text - the part that was actually used to rewrite the descriptions - still
// agrees with what the descriptions say.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
let failures = 0
const test = (name, fn) => {
  try {
    fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', String(error.message).slice(0, 240))
  }
}

test('the routing map is the one the catalog produces now', () => {
  const committed = readFileSync(repo + 'docs/routing-map.md', 'utf8')
  const fresh = execFileSync(process.execPath, [repo + 'docs/tools/generate-routing-map.mjs'], { encoding: 'utf8', timeout: 300_000 })
  if (committed.trim() !== fresh.trim()) {
    throw new Error('the map drifted. Run `node docs/tools/generate-routing-map.mjs --write` and read the diff: the catalog moved, and the map is the record of how the text is allocated.')
  }
})

test('every shipped skill appears in the map', () => {
  const map = readFileSync(repo + 'docs/routing-map.md', 'utf8')
  const skills = readdirSync(repo + 'skills', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  const missing = skills.filter((skill) => !map.includes(skill))
  if (missing.length > 0) throw new Error('the map does not mention: ' + missing.join(', '))
})

test('the map uses the syntax the renderer accepts', () => {
  // What mermaid's mindmap grammar accepts, per its own documentation: a bare `root((text))` and plain
  // text after the indent, with shapes only in the `id((text))` form. There is NO backtick form - a
  // backtick label is a parse error, which is exactly what a renderer reported at line 15 of this map
  // after an earlier "fix" wrapped the labels in backticks.
  //
  // So the rule is: no backticks, and no parenthesis, bracket or arrow inside a label, because those are
  // what the parser reads as syntax. Spell the character out instead - a corner is cheap, a broken
  // diagram is not.
  const text = readFileSync(repo + 'docs/routing-map.md', 'utf8')
  const block = /```mermaid\n([\s\S]*?)```/.exec(text)
  if (block === null) throw new Error('the map has no mermaid block')
  const lines = block[1].split('\n').filter((line) => line.trim() !== '' && line.trim() !== 'mindmap')
  if (lines.length === 0) throw new Error('the map carries no nodes; this check would pass vacuously')

  const backticked = lines.filter((line) => line.includes('`'))
  if (backticked.length > 0) {
    throw new Error(String(backticked.length) + ' node(s) use backticks, which a mindmap node does not accept: ' + backticked[0].trim().slice(0, 60))
  }
  const flowchart = lines.filter((line) => /\["/.test(line))
  if (flowchart.length > 0) {
    throw new Error(String(flowchart.length) + ' node(s) use the flowchart form id["label"]; a mindmap node is plain text: ' + flowchart[0].trim().slice(0, 60))
  }
  const roots = lines.filter((line) => line.includes('root('))
  if (roots.length !== 1) throw new Error('expected exactly one root, found ' + String(roots.length))
  if (!/root\(\([^()]*\)\)\s*$/.test(roots[0].trim())) throw new Error('the root must be the bare root shape: ' + roots[0].trim())

  const risky = lines.filter((line) => line.trim().startsWith('root(') ? false : /[[\]{}()]|-->|->/.test(line))
  if (risky.length > 0) {
    throw new Error('a label carries a character the parser reads as syntax: ' + risky.slice(0, 3).map((line) => line.trim()).join(' | '))
  }
})

test('the map states the catalog budget it is written against', () => {
  const map = readFileSync(repo + 'docs/routing-map.md', 'utf8')
  // The budget is the constraint the whole allocation rests on, so the map has to carry it.
  if (!/500/.test(map)) throw new Error('the map does not state the catalog budget')
})

if (failures > 0) {
  console.log('routing map tests failed:', failures)
  process.exit(1)
}
console.log('all routing map tests passed')

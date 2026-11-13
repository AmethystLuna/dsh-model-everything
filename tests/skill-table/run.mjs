// The skill's notation table is a claim about the parser, so the parser is what checks it.
//
// It has drifted twice: `state { }` was listed twice in one cell, and `file`/`card`/`frame` were drawn in one column and
// refused in the other. A reader routing on that table would have got both answers wrong.
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
const skill = readFileSync(repo + 'skills/model-everything-diagram/SKILL.md', 'utf8')
const parser = readFileSync(repo + 'src/render/from-plantuml.ts', 'utf8')

const rows = ['PlantUML elements', 'PlantUML boundaries', 'PlantUML edges', 'PlantUML page and layout']

const cell = (label) => {
  const line = skill.split('\n').find((entry) => entry.startsWith('| ' + label + ' |'))
  if (line === undefined) throw new Error('no row for ' + label)
  // A table cell can carry an escaped pipe (`-->\\|text\\|`), so the split has to respect it or the columns shift.
  const parts = line.split(/(?<!\\)\|/).map((part) => part.trim())
  return { drawn: parts[2] ?? '', refused: parts[3] ?? '' }
}

const symbols = (text) => [...text.matchAll(/`([a-z]+)`/g)].map((match) => match[1])
/** Any backticked token, camel case included: `sequenceDiagram` is a keyword as much as `cloud` is. */
const tokens = (text) => [...text.matchAll(/`([A-Za-z][\w-]*)`/g)].map((match) => match[1])

// The parser's own words: the shapes it draws, the names it refuses, and the sequence statements it refuses.
const shapeNames = new Set([...parser.matchAll(/^\s{2}([a-z]+): '[a-z]+',$/gm)].map((match) => match[1]))
const refusedNames = new Set([...parser.matchAll(/^\s{2}([a-z]+): '(?:an? )/gm)].map((match) => match[1]))
const fragmentBlock = /const FRAGMENT = new Set\(\[([^\]]*)\]\)/.exec(parser)?.[1] ?? ''
const fragmentNames = new Set([...fragmentBlock.matchAll(/'([a-z]+)'/g)].map((match) => match[1]))

test('the parser lists were read, so the checks below mean something', () => {
  if (shapeNames.size < 10) throw new Error('shapes: ' + String(shapeNames.size))
  if (refusedNames.size < 2) throw new Error('refusals: ' + String(refusedNames.size))
  if (fragmentNames.size < 5) throw new Error('fragments: ' + String(fragmentNames.size))
})

test('every element the table claims to draw is one the parser knows', () => {
  for (const name of symbols(cell('PlantUML elements').drawn)) {
    if (!shapeNames.has(name)) throw new Error('the skill draws `' + name + '`, the parser does not')
  }
})

test('every element the table refuses is one the parser refuses', () => {
  for (const name of symbols(cell('PlantUML elements').refused)) {
    if (shapeNames.has(name)) throw new Error('`' + name + '` is claimed drawn and refused')
    if (!refusedNames.has(name) && !fragmentNames.has(name)) {
      throw new Error('the skill refuses `' + name + '`, the parser has no rule for it')
    }
  }
})

test('no keyword appears twice in one cell', () => {
  for (const label of rows) {
    const row = cell(label)
    for (const side of [row.drawn, row.refused]) {
      const seen = new Set()
      for (const name of symbols(side)) {
        if (seen.has(name)) throw new Error(label + ': `' + name + '` twice')
        seen.add(name)
      }
    }
  }
})

test('a keyword is never claimed both drawn and refused in one row', () => {
  for (const label of rows) {
    const row = cell(label)
    const drawn = new Set(symbols(row.drawn))
    for (const name of symbols(row.refused)) {
      if (drawn.has(name)) throw new Error(label + ': `' + name + '` is in both columns')
    }
  }
})

// The table says an element is drawn or refused; this makes the renderer say it too. A keyword that reads correctly in the table and
// not in the renderer teaches a reader the wrong thing twice - once here, once when the drawing refuses the line.
test('every keyword the table names behaves the way the table says', async () => {
  const { render } = await import('../../lib/render/index.js')
  const row = cell('PlantUML elements')
  const failuresHere = []
  for (const name of symbols(row.drawn)) {
    const source = ['@startuml', name + ' Sample', '@enduml'].join('\n')
    const drawn = render({ source }, {}, { scheme: 'default' })
    if (drawn.diagram.nodes.length === 0 || drawn.refused.length > 0) {
      failuresHere.push('`' + name + '` is claimed drawn but draws ' + String(drawn.diagram.nodes.length) + ' node(s) and refuses ' + String(drawn.refused.length))
    }
  }
  for (const name of symbols(row.refused)) {
    const source = ['@startuml', name + ' Sample', '@enduml'].join('\n')
    const refused = render({ source }, {}, { scheme: 'default' })
    if (refused.refused.length === 0) failuresHere.push('`' + name + '` is claimed refused but the line was not refused')
  }
  if (failuresHere.length > 0) throw new Error(failuresHere.join(' | '))
})

// The Mermaid row is prose, so the same questions are asked of the tokens that carry a behaviour: a refused family is refused, and a
// drawn edge kind draws an edge.
test('every Mermaid token the table names behaves the way the table says', async () => {
  const { render } = await import('../../lib/render/index.js')
  const row = cell('Mermaid')
  const failuresHere = []
  const families = tokens(row.refused).filter((name) => /diagram|chart|graph/i.test(name))
  if (families.length === 0) throw new Error('no diagram families were read from the table')
  for (const family of families) {
    const source = family === 'gantt' || family === 'pie' || family === 'journey' || family === 'mindmap' || family === 'timeline' || family === 'quadrantChart' || family === 'gitGraph'
      ? family
      : family + '\n  a --> b'
    const refused = render({ source, notation: 'mermaid' }, {}, { scheme: 'default' })
    if (refused.refused.length === 0) failuresHere.push('`' + family + '` is claimed refused but the source was not refused')
  }
  const edges = { '-->': 'arrow', '---': 'line', '-.->': 'dotted' }
  for (const edge of Object.keys(edges)) {
    const drawn = render({ source: ['flowchart TD', 'a ' + edge + ' b'].join('\n'), notation: 'mermaid' }, {}, { scheme: 'default' })
    if (drawn.diagram.edges.length !== 1) failuresHere.push('`' + edge + '` is claimed drawn but drew ' + String(drawn.diagram.edges.length) + ' edge(s)')
  }
  if (failuresHere.length > 0) throw new Error(failuresHere.join(' | '))
})

if (failures > 0) {
  console.log('skill table tests failed:', failures)
  process.exit(1)
}
console.log('all skill table tests passed')
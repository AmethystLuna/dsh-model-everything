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
  const parts = line.split('|').map((part) => part.trim())
  return { drawn: parts[2] ?? '', refused: parts[3] ?? '' }
}

const symbols = (text) => [...text.matchAll(/`([a-z]+)`/g)].map((match) => match[1])

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

if (failures > 0) {
  console.log('skill table tests failed:', failures)
  process.exit(1)
}
console.log('all skill table tests passed')
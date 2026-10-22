// The routing table, and the map that publishes it.
//
// One table answers "what does this tool own, and which tool takes the case beside it". It is read twice:
// by the card payload a UI shows, and by the toolset map generator. A test that only checked the table's
// shape would let the map and the table disagree again - which is how the map came to quote a magnitude
// for the tool descriptions that was half the measured one. So the suite also reads the generated map and
// requires every route to appear in it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { ROUTES, routeFor, siblingTools } from '../../lib/routing.js'
import { reportCard } from '../../lib/presentation.js'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const map = readFileSync(join(repo, 'docs', 'toolset', 'mindmap.mmd'), 'utf8')

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

test('every route says what it owns and where the adjacent case goes', () => {
  for (const [tool, route] of Object.entries(ROUTES)) {
    if (typeof route.owns !== 'string' || route.owns.length < 20) throw new Error(tool + ': owns is not a sentence')
    if (typeof route.notFor.when !== 'string' || route.notFor.when.length < 10) throw new Error(tool + ': notFor.when is not a condition')
    if (!/^[a-z_]+$/.test(route.notFor.tool)) throw new Error(tool + ': notFor.tool is not a tool name')
  }
})

test('no tool routes to itself', () => {
  for (const [tool, route] of Object.entries(ROUTES)) {
    if (route.notFor.tool === tool) throw new Error(tool + ' names itself as its own neighbour')
  }
})

test('every sibling a route names is itself a routed tool', () => {
  for (const sibling of siblingTools()) {
    if (routeFor(sibling) === undefined) throw new Error('a route points at ' + sibling + ', which has no route of its own')
  }
})

test('every route appears in the generated map', () => {
  for (const [tool, route] of Object.entries(ROUTES)) {
    if (!map.includes(tool + ': ' + route.owns)) throw new Error(tool + ' is missing from the map (stale map, or the generator was not run)')
    if (!map.includes('that is ' + route.notFor.tool)) throw new Error(tool + "'s neighbour is missing from the map")
  }
})

test('the card carries the route, from the table rather than from a second copy', () => {
  const card = reportCard({ verdict: 'pass', findings: [] }, 'uml_structure_verify')
  if (card.route === undefined) throw new Error('the card has no route for a tool that has one')
  if (card.route.instead !== ROUTES.uml_structure_verify.notFor.tool) throw new Error('the card disagrees with the table')
})

test('a tool without a route still produces a card', () => {
  const card = reportCard({ verdict: 'pass', findings: [] }, 'not_a_tool')
  if (card.route !== undefined) throw new Error('a route appeared for a tool the table does not list')
  if (card.verdict !== 'pass') throw new Error('the rest of the card must survive a missing route')
})

if (failures > 0) {
  console.log('routing tests failed:', failures)
  process.exit(1)
}
console.log('all routing tests passed')

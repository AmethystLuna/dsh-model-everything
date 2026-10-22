// The routing table's edges, turned into cases that can be scored.
//
// The structural half runs here and needs no model: it checks that the corpus covers the table rather than
// a wish-list, and that every case names its near miss - a case with no near miss measures whether a model
// can read, not whether it can route.
//
// The scored half is run by hand, because this plugin never calls a model:
//
//   node tests/tool-routing/run.mjs --print-prompt   # one prompt holding every case
//   node tests/tool-routing/run.mjs --decisions a.json
//
// `a.json` maps a case index to the tool the model chose. Scoring is exact: the expected tool, and the
// near miss named besides it is a misroute even when the right tool was also considered.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { ROUTES, routedTools } from '../../lib/routing.js'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const corpus = JSON.parse(readFileSync(join(here, 'cases.json'), 'utf8'))

let failures = 0
function check(name, body) {
  try {
    body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

function toolDescription(name) {
  // The shipped descriptions, read from the built plugin: a corpus written against a stale description is
  // measuring text that no model will ever see.
  const modules = ['automaton-tool', 'compose-tool', 'concurrency-tool', 'data-tool', 'design-tool', 'edit-tool', 'export-tool', 'report-diff-tool', 'structure-tool', 'uml-tool', 'tool']
  return async () => {
    for (const file of modules) {
      const mod = await import('../../lib/' + file + '.js')
      for (const value of Object.values(mod)) {
        if (value !== null && typeof value === 'object' && value.name === name) return value.description
      }
    }
    return undefined
  }
}

check('every case names a tool the routing table covers', () => {
  for (const [index, entry] of corpus.cases.entries()) {
    if (ROUTES[entry.expect] === undefined) throw new Error('case ' + String(index) + ' expects ' + entry.expect + ', which has no route')
    if (ROUTES[entry.mustNot] === undefined) throw new Error('case ' + String(index) + ' names a near miss with no route: ' + entry.mustNot)
  }
})

check('every case names a near miss other than its answer', () => {
  for (const entry of corpus.cases) {
    if (entry.mustNot === entry.expect) throw new Error(entry.expect + ' is its own near miss')
    if (typeof entry.why !== 'string' || entry.why.length < 10) throw new Error(entry.expect + ': a case without a reason cannot be reviewed when it fails')
  }
})

check('every routed tool is the answer to at least one case', () => {
  const covered = new Set(corpus.cases.map((entry) => entry.expect))
  const missing = routedTools().filter((tool) => !covered.has(tool))
  if (missing.length > 0) throw new Error('no case expects: ' + missing.join(', '))
})

check('every route has a case where the two tools could both be argued for', () => {
  // A clean one-to-one corpus can be answered by elimination. The ambiguous case is what forces a reading
  // of the descriptions: both tools fit, and only the wording decides.
  for (const [tool, route] of Object.entries(ROUTES)) {
    const ambiguous = corpus.cases.some((entry) => entry.expect === tool && entry.mustNot === route.notFor.tool && entry.ambiguous === true)
    if (!ambiguous) throw new Error(tool + ' has no ambiguous case against ' + route.notFor.tool)
  }
})

check('an ambiguous case says which phrase decides it', () => {
  for (const entry of corpus.cases) {
    if (entry.ambiguous !== true) continue
    if (typeof entry.why !== 'string' || entry.why.length < 20) throw new Error('ambiguous case for ' + entry.expect + ' does not say what decides it')
  }
})

check("every route's own near miss is a case's near miss", () => {
  for (const [tool, route] of Object.entries(ROUTES)) {
    const used = corpus.cases.some((entry) => entry.expect === tool && entry.mustNot === route.notFor.tool)
    if (!used) throw new Error(tool + ' routes to ' + route.notFor.tool + ', but no case puts the two side by side')
  }
})

const decisionsFlag = process.argv.indexOf('--decisions')
if (decisionsFlag !== -1) {
  const file = process.argv[decisionsFlag + 1]
  if (file === undefined) {
    console.log('FAIL --decisions needs a file of {index: tool}')
    process.exit(1)
  }
  const answers = JSON.parse(readFileSync(file, 'utf8'))
  let wrong = 0
  for (const [index, entry] of corpus.cases.entries()) {
    const answer = answers[String(index)]
    const verdict = answer === entry.expect ? 'ok' : 'MISS'
    if (verdict === 'MISS') {
      wrong += 1
      console.log(verdict, String(index), 'expected ' + entry.expect + ', got ' + String(answer) + ' — ' + entry.why)
    }
  }
  console.log('routed correctly: ' + String(corpus.cases.length - wrong) + ' of ' + String(corpus.cases.length))
  if (wrong > 0) process.exit(1)
  process.exit(0)
}

if (process.argv.includes('--print-prompt')) {
  const parts = ['You have the tools below. For each request, answer with exactly one tool name and nothing else, one per line, numbered.', '']
  for (const [index, entry] of corpus.cases.entries()) {
    parts.push(String(index) + '. ' + entry.prompt)
  }
  parts.push('', 'Tools:')
  const names = [...new Set(corpus.cases.flatMap((entry) => [entry.expect, entry.mustNot]))].sort()
  for (const name of names) {
    const describe = toolDescription(name)
    const description = await describe()
    parts.push('', name + ': ' + (description ?? '(description not found)'))
  }
  console.log(parts.join('\n'))
  process.exit(failures > 0 ? 1 : 0)
}

if (failures > 0) {
  console.log('tool-routing tests failed:', failures)
  process.exit(1)
}
console.log('all tool-routing structural checks passed')

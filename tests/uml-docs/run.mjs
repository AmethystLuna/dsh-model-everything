// The skill's account of what the engine can draw and read, against the engine.
//
// The skill said Mermaid covers four families and PlantUML eleven, and the table says both can also draw a use case diagram, and Mermaid a
// class diagram - a reader was told a family it can use was unavailable. A list of families in prose is a copy of the table, and the copy is
// what goes stale. These checks hold the parts that have to stay true.
import { readFileSync } from 'node:fs'
import { UML_FAMILIES, umlCapability, umlNotationSupport } from '../../lib/uml-syntax.js'
import { parseUml } from '../../lib/uml.js'

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const skill = readFileSync(repo + 'skills/model-everything-uml/SKILL.md', 'utf8')

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

test('every family the skill names is a family the engine has', () => {
  const ids = new Set(UML_FAMILIES.map((family) => family.id))
  for (const match of skill.matchAll(/`([a-z][a-z-]*)`/g)) {
    const token = match[1]
    // Only tokens whose last word is a family's are checked: the skill also names codes, actions, skill names and file paths.
    if (!/(state|activity|sequence|class|object|package|component|deployment|profile|communication|timing|overview|structure|case)$/.test(token)) continue
    if (ids.has(token)) continue
    if (token === 'use-case' || token === 'interaction-overview' || token === 'composite-structure') continue
    if (/^[a-z]+-[a-z]+$/.test(token) && !ids.has(token)) throw new Error('the skill names `' + token + '`, which is not a family')
  }
})

test('the two refusals the skill promises are the two the engine gives', () => {
  // PlantUML activity, and Mermaid for the structure families.
  const plantumlActivity = umlCapability('plantuml', 'activity', 'render')
  if (plantumlActivity.ok) throw new Error('plantuml activity renders')
  if (!String(plantumlActivity.message).toLowerCase().includes('activity')) throw new Error('the reason: ' + plantumlActivity.message)
  for (const family of ['component', 'package', 'deployment', 'object', 'composite-structure', 'profile', 'communication', 'timing']) {
    const decision = umlCapability('mermaid', family, 'render')
    if (decision.ok) throw new Error('mermaid draws a ' + family + ' diagram')
  }
})

test('a family the skill says is drawn in a notation really is', () => {
  // The two the old list left out: a use case diagram in either notation, and a class diagram in Mermaid.
  for (const [notation, family] of [['plantuml', 'use-case'], ['mermaid', 'use-case'], ['mermaid', 'class']]) {
    const decision = umlCapability(notation, family, 'render')
    if (!decision.ok) throw new Error(notation + ' cannot draw a ' + family + ' diagram, and the skill says it can')
    if (umlNotationSupport(notation, family).fidelity === 'none') throw new Error(notation + '/' + family + ' is marked unrepresentable')
  }
})

test('the round trip the skill promises for two families holds', () => {
  const samples = {
    'composite-structure': '@startuml\ncomponent c {\n  port p\n}\n@enduml',
    communication: '@startuml\nobject a\nobject b\na -> b : 1: hi\n@enduml',
  }
  for (const [family, source] of Object.entries(samples)) {
    const first = parseUml(source, 'plantuml')
    if (first.family !== family) throw new Error(family + ' parsed as ' + first.family)
    if (umlCapability('plantuml', family, 'parse').warning === undefined) throw new Error(family + ' parsed with no approximation warning')
  }
})

test('every refusal the skill names is a refusal the engine performs', () => {
  const refused = {
    sequence: ['mermaid', 'sequenceDiagram\nA->>B: hi'],
    profile: ['plantuml', '@startuml\nclass A <<stereotype>>\n@enduml'],

  }
  // An interaction overview is refused when it is asked for; a plain Mermaid flowchart is read as an activity diagram first, which is what the
  // skill says now.
  const overview = umlCapability('mermaid', 'interaction-overview', 'parse')
  if (overview.ok) throw new Error('an interaction overview parses')
  if (overview.errorCode !== 'UML_NOT_A_STATE_DIAGRAM') throw new Error('its code: ' + String(overview.errorCode))

  for (const [family, [notation, source]] of Object.entries(refused)) {
    let error;
    try {
      parseUml(source, notation)
    } catch (caught) {
      error = caught
    }
    if (error === undefined) throw new Error(family + ' parsed, and the skill says it cannot')
  }
})

if (failures > 0) {
  console.log('uml-docs tests failed:', failures)
  process.exit(1)
}
console.log('all uml-docs tests passed')
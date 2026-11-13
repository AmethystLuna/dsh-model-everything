// The family table is the documentation of what this engine can do, so every claim in it has to be reachable.
//
// The table said a use case diagram is parseable and declares `usecase` and `actor`; no scan looked for those keywords, so every use case
// written with its own keyword was read as a state machine and refused. That is what this suite is for: one minimal source per family,
// and the family the engine says it is.
import { UML_FAMILIES, detectUmlFamily } from '../../lib/uml-syntax.js'
import { parseUml } from '../../lib/uml.js'

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

/** One minimal source per family, written in the notation that family's entry calls faithful. */
const SAMPLES = {
  state: ['plantuml', '@startuml\nstate a\na --> b\n@enduml'],
  activity: ['mermaid', 'flowchart TD\na --> b'],
  'use-case': ['plantuml', '@startuml\nusecase Login\nusecase Logout\nLogin --> Logout\n@enduml'],
  class: ['mermaid', 'classDiagram\nclass A\nA <|-- B'],
  object: ['plantuml', '@startuml\nobject o\n@enduml'],
  package: ['plantuml', '@startuml\npackage p\n@enduml'],
  component: ['plantuml', '@startuml\ncomponent c\n@enduml'],
  deployment: ['plantuml', '@startuml\nnode n\n@enduml'],
  communication: ['plantuml', '@startuml\nobject a\nobject b\na -> b : 1: hi\n@enduml'],
  timing: ['plantuml', '@startuml\nrobust "a"\n@0\na is idle\n@enduml'],
  'composite-structure': ['plantuml', '@startuml\ncomponent c {\n  port p\n}\n@enduml'],
}

test('every family with a faithful notation is detected from a minimal source', () => {
  for (const family of UML_FAMILIES) {
    const sample = SAMPLES[family.id]
    if (sample === undefined) continue
    const [notation, source] = sample
    const detected = detectUmlFamily(source, notation).family
    if (detected !== family.id) throw new Error(family.id + ' was detected as ' + detected)
  }
})

test('a family the table calls parseable parses from that source', () => {
  for (const family of UML_FAMILIES) {
    if (!family.parseable) continue
    const sample = SAMPLES[family.id]
    if (sample === undefined) continue
    const [notation, source] = sample
    const parsed = parseUml(source, notation)
    if (parsed.family !== family.id) throw new Error(family.id + ' parsed as ' + parsed.family)
  }
})

test('a family the table calls unparseable refuses with its documented code', () => {
  for (const family of UML_FAMILIES) {
    if (family.parseable) continue
    const sample = SAMPLES[family.id]
    if (sample === undefined) continue
    const [notation, source] = sample
    let refused;
    try {
      parseUml(source, notation)
    } catch (error) {
      refused = error
    }
    if (refused === undefined) throw new Error(family.id + ' parsed, and the table says it cannot')
    const expected = family.parseRefusalCode ?? 'UML_NOT_A_STATE_DIAGRAM'
    if (refused.errorCode !== expected) throw new Error(family.id + ': refused with ' + String(refused.errorCode) + ', not ' + expected)
  }
})

if (failures > 0) {
  console.log('uml-family tests failed:', failures)
  process.exit(1)
}
console.log('all uml-family tests passed')
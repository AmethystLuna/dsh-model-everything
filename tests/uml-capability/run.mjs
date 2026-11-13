// What the engine decides for a (notation, family, action) triple has to follow the table, because the table is what the tool description and
// the skills tell a reader. A cell the table calls unrepresentable must be refused both ways; a faithful cell must draw without a warning;
// an approximation must say what it is approximating.
import { UML_FAMILIES, umlCapability, umlNotationSupport } from '../../lib/uml-syntax.js'

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

const NOTATIONS = ['mermaid', 'plantuml']

test('a cell the table calls unrepresentable refuses both actions', () => {
  for (const family of UML_FAMILIES) {
    for (const notation of NOTATIONS) {
      if (umlNotationSupport(notation, family.id).fidelity !== 'none') continue
      for (const action of ['render', 'parse']) {
        const decision = umlCapability(notation, family.id, action)
        if (decision.ok) throw new Error(notation + '/' + family.id + ' ' + action + ' was allowed')
        if (decision.errorCode !== 'UML_VIEW_UNREPRESENTABLE') throw new Error(notation + '/' + family.id + ': ' + String(decision.errorCode))
      }
    }
  }
})

test('a faithful cell draws without a warning', () => {
  for (const family of UML_FAMILIES) {
    for (const notation of NOTATIONS) {
      if (umlNotationSupport(notation, family.id).fidelity !== 'faithful') continue
      const decision = umlCapability(notation, family.id, 'render')
      if (!decision.ok) throw new Error(notation + '/' + family.id + ' refused to render')
      if (decision.warning !== undefined) throw new Error(notation + '/' + family.id + ' warned: ' + decision.warning.slice(0, 60))
    }
  }
})

test('an approximate cell says what it is approximating', () => {
  for (const family of UML_FAMILIES) {
    for (const notation of NOTATIONS) {
      if (umlNotationSupport(notation, family.id).fidelity !== 'approximate') continue
      const decision = umlCapability(notation, family.id, 'render')
      if (!decision.ok) throw new Error(notation + '/' + family.id + ' refused to render an approximation')
      if (decision.warning === undefined) throw new Error(notation + '/' + family.id + ' drew an approximation with no warning')
      if (!decision.warning.includes('UML_RENDER_APPROXIMATE_VIEW')) throw new Error(notation + '/' + family.id + ': ' + decision.warning.slice(0, 40))
      // The warning has to name the notation, or a reader cannot tell which view is the approximation.
      if (!decision.warning.toLowerCase().includes(notation)) throw new Error(notation + '/' + family.id + ' warning does not name the notation')
    }
  }
})

test('a family the table cannot read refuses with its documented code, in either notation', () => {
  for (const family of UML_FAMILIES) {
    if (family.parseable) continue
    for (const notation of NOTATIONS) {
      // A cell the notation cannot draw is refused before the family question is asked.
      if (umlNotationSupport(notation, family.id).fidelity === 'none') continue
      const decision = umlCapability(notation, family.id, 'parse')
      if (decision.ok) throw new Error(notation + '/' + family.id + ' parsed')
      const expected = family.parseRefusalCode ?? 'UML_NOT_A_STATE_DIAGRAM'
      if (decision.errorCode !== expected) throw new Error(notation + '/' + family.id + ': ' + String(decision.errorCode) + ', not ' + expected)
    }
  }
})

test('an approximation is readable only where the family says so', () => {
  for (const family of UML_FAMILIES) {
    if (!family.parseable) continue
    for (const notation of NOTATIONS) {
      if (umlNotationSupport(notation, family.id).fidelity !== 'approximate') continue
      const decision = umlCapability(notation, family.id, 'parse')
      if (family.parseThroughApproximation === true) {
        if (!decision.ok) throw new Error(notation + '/' + family.id + ' refused a readable approximation')
        if (decision.warning === undefined || !decision.warning.includes('UML_PARSE_APPROXIMATE_VIEW')) {
          throw new Error(notation + '/' + family.id + ' read an approximation without saying so')
        }
      } else if (decision.ok) {
        throw new Error(notation + '/' + family.id + ' read an approximation the family does not claim to read')
      }
    }
  }
})

if (failures > 0) {
  console.log('uml-capability tests failed:', failures)
  process.exit(1)
}
console.log('all uml-capability tests passed')
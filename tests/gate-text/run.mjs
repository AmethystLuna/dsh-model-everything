// The injected routing message: the first text a session reads, and the one that must not name anything that is not there.
//
// Two failures matter. A row naming a skill that was renamed sends the session to a skill nobody ships, and a tool named in the list that is not
// registered does the same for the tool. Both read as authoritative because the message is injected, not asked for.
import { renderGateText, shippedSkills } from '../../lib/gate.js'
import { ROUTES } from '../../lib/routing.js'

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

const TEXT = renderGateText()
const SKILLS = shippedSkills()

test('the message was rendered from shipped skills, so the checks below mean something', () => {
  if (SKILLS.length < 2) throw new Error('the gate found ' + String(SKILLS.length) + ' skill(s) on disk')
  if (TEXT.length === 0) throw new Error('the message is empty')
})

test('every skill that ships has a row, and every row names a skill that ships', () => {
  const rows = [...TEXT.matchAll(/^\| (.+?) \| `([a-z-]+)` \|$/gm)].map((match) => match[2])
  if (rows.length === 0) throw new Error('the message has no routing table')
  for (const skill of SKILLS) if (!rows.includes(skill)) throw new Error(skill + ' ships and has no row')
  for (const row of rows) if (!SKILLS.includes(row)) throw new Error('a row names ' + row + ', which does not ship')
})

test('every tool name in the message is a registered route', () => {
  // A tool name is lowercase words joined by underscores; the field names the message also quotes (`verdict`, `errorCode`) are not.
  const names = [...new Set([...TEXT.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)].map((match) => match[1]))]
  if (names.length === 0) throw new Error('the message names no tool')
  const known = new Set(Object.keys(ROUTES))
  for (const name of names) if (!known.has(name)) throw new Error('the message names ' + name + ', which is not a registered tool')
})

test('the message says how to read a report, and what to do when a tool refuses', () => {
  if (!/gate on `verdict`, never on `ok`/.test(TEXT)) throw new Error('the reading rule is gone')
  if (!/errorCode/.test(TEXT)) throw new Error('the message does not say what a refusal carries')
})

test('the message names the entry skill as the route when no row applies', () => {
  if (!/`model-everything` first/.test(TEXT)) throw new Error('the entry route is gone')
})

if (failures > 0) {
  console.log('gate-text tests failed:', failures)
  process.exit(1)
}
console.log('all gate-text tests passed')
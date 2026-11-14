// Every code this plugin can answer with is a code some test names.
//
// A finding code is part of the report contract: a caller routes on it, and a code no test mentions is a code nobody has
// seen fire. This suite is the inventory, not the behaviour - the domain suites decide what each code means - and it fails
// when a code is added without a case, or removed while a case still names it.
//
// A code that cannot be reached from the public API is pinned by its shadow instead, and listed below with the reason. That
// list is deliberately short: it is where a reader looks to see which codes are asserted indirectly.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

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

/**
 * Codes pinned by the condition that shadows them rather than by a direct case. Each entry says which suite pins it and why
 * the code itself cannot fire.
 */
const SHADOWED = {
  // The interaction-overview validator refuses a model with no initial node, so the review never sees one; `tests/uml`
  // asserts the validator's message instead of the finding.
  UML069_OVERVIEW_NO_INITIAL: 'the validator refuses the model before the review runs (`tests/uml`)',
}

const walk = (directory, extension) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full, extension)
    return entry.name.endsWith(extension) ? [full] : []
  })

const SOURCES = walk(join(repo, 'src'), '.ts')
const TESTS = [...walk(join(repo, 'tests'), '.mjs'), ...walk(join(repo, 'tools'), '.mjs')]

test('the sources and the tests were read, so the inventory below means something', () => {
  if (SOURCES.length < 40) throw new Error('only ' + String(SOURCES.length) + ' source file(s)')
  if (TESTS.length < 40) throw new Error('only ' + String(TESTS.length) + ' test file(s)')
})

const NAMES = /'([A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,})'/g
const declared = new Map()
for (const file of SOURCES) {
  for (const match of readFileSync(file, 'utf8').matchAll(NAMES)) {
    const where = declared.get(match[1]) ?? []
    const path = relative(repo, file).replace(/\\/g, '/')
    if (!where.includes(path)) where.push(path)
    declared.set(match[1], where)
  }
}
const testText = TESTS.map((file) => readFileSync(file, 'utf8')).join('\n')

test('every code the plugin can answer with is a code a test names', () => {
  const unnamed = [...declared.keys()].sort().filter((code) => !testText.includes(code) && SHADOWED[code] === undefined)
  if (unnamed.length > 0) {
    throw new Error('no test names: ' + unnamed.map((code) => code + ' (' + (declared.get(code) ?? []).join(',') + ')').join('; '))
  }
})

test('a shadowed code says which suite pins it', () => {
  // The list is a claim about coverage; an entry whose suite does not name the code is a stale excuse.
  for (const [code, reason] of Object.entries(SHADOWED)) {
    const suite = /tests\/([a-z-]+)/.exec(reason)?.[1]
    if (suite === undefined) throw new Error(code + ' names no suite: ' + reason)
    const file = join(repo, 'tests', suite, 'run.mjs')
    const text = readFileSync(file, 'utf8')
    const prefix = code.split('_')[0]
    if (!text.includes(code) && !text.includes(prefix)) throw new Error(suite + ' does not mention ' + prefix)
  }
})

if (failures > 0) {
  console.log('code-inventory tests failed:', failures)
  process.exit(1)
}
console.log('all code-inventory tests passed')
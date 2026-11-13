// The examples are documentation that says "run them as they are" - which is a claim, not a comment.
//
// They are deliberately not fixtures: a suite reads its own fixtures, and an example may be edited to show a different result. What cannot be
// edited away is that the file parses, that the README's own links point at files that exist, and that the two examples whose names promise a
// finding still produce it.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runVerification, validateModel } from '../../lib/engine.js'
import { runDataVerification, validateDataModel } from '../../lib/data-engine.js'

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
const examples = join(repo, 'examples')
const read = (name) => JSON.parse(readFileSync(join(examples, name), 'utf8'))
const files = readdirSync(examples).filter((name) => name.endsWith('.json'))

test('the directory holds examples, so the cases below have something to read', () => {
  if (files.length < 4) throw new Error('only ' + String(files.length) + ' example file(s)')
})

test('every example validates as the thing it is', () => {
  for (const name of files) {
    const model = read(name)
    const result = Array.isArray(model.entities) ? validateDataModel(model) : validateModel(model)
    if (!result.ok) throw new Error(name + ': ' + String(result.errors).slice(0, 100))
  }
})

test('every example the README names exists', () => {
  const readme = readFileSync(join(examples, 'README.md'), 'utf8')
  const named = [...new Set([...readme.matchAll(/`([\w.-]+\.json)`/g)].map((match) => match[1]))]
  if (named.length === 0) throw new Error('the README names no example')
  for (const name of named) if (!existsSync(join(examples, name))) throw new Error('the README names ' + name + ', which does not exist')
})

test('the over-budget example still goes over budget', () => {
  // Its name is the promise: it exists to show a mission path breaking the budget invariant.
  const report = runVerification(read('control-dispatcher.overbudget.json'))
  const codes = [...new Set((report.checks ?? []).flatMap((check) => (check.findings ?? []).map((finding) => finding.code)))]
  if (!codes.includes('A12_BUDGET_OVER')) throw new Error('no A12 in ' + codes.join(','))
})

test('the dispatcher example keeps its lock and unlock in balance', () => {
  // The README says A4 checks that balance; an A4 finding here would mean the example demonstrates the opposite of what it is for.
  const report = runVerification(read('control-dispatcher.json'))
  const codes = [...new Set((report.checks ?? []).flatMap((check) => (check.findings ?? []).map((finding) => finding.code)))]
  const a4 = codes.filter((code) => code.startsWith('A4_'))
  if (a4.length > 0) throw new Error('the example reports ' + a4.join(','))
})

test('the before/after pairs run and produce a report', () => {
  const pairs = [['order-state-machine.before.json', 'order-state-machine.after.json'], ['user-migration.before.json', 'user-migration.after.json']]
  for (const [before, after] of pairs) {
    const b = read(before)
    const a = read(after)
    const report = Array.isArray(a.entities) ? runDataVerification(a, { beforeModel: b }) : runVerification(a, { beforeModel: b })
    if (report.verdict === undefined) throw new Error(before + ' -> ' + after + ': no verdict')
    if ((report.nextSteps ?? []).length === 0) throw new Error(before + ' -> ' + after + ': no next step')
  }
})

if (failures > 0) {
  console.log('examples tests failed:', failures)
  process.exit(1)
}
console.log('all examples tests passed')
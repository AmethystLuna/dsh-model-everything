// Reading a model from a file: the four refusals a caller can meet, and the one success.
//
// The path is the largest argument these tools take, and it arrives as a string from a tool call, so every way it can be
// wrong reaches this module. Each refusal says which argument and what to do, because "invalid input" is not something a
// model can act on.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readJsonFile, oneOf } from '../../lib/model-file.js'

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

const scratch = mkdtempSync(join(tmpdir(), 'dme-model-file-'))
const file = (name, text) => {
  const path = join(scratch, name)
  writeFileSync(path, text)
  return path
}

/** The refusal, or undefined when the call answered. */
const refusal = (run) => {
  try {
    run()
    return undefined
  } catch (error) {
    return error
  }
}

test('a well-formed file is read, whatever its formatting', () => {
  // A BOM, tabs and blank lines all parse: the file is edited by hand as often as it is written.
  const bom = file('bom.json', '\uFEFF{\n\t"a": 1\n}\n')
  const value = readJsonFile(bom, 'modelPath', 'CODE')
  if (value.a !== 1) throw new Error('the BOM stopped the parse: ' + JSON.stringify(value))
})

test('a path that is not a path is refused before the filesystem is asked', () => {
  for (const bad of ['', '   ', null, 5, []]) {
    const refused = refusal(() => readJsonFile(bad, 'modelPath', 'CODE'))
    if (refused === undefined) throw new Error('accepted ' + JSON.stringify(bad))
    if (refused.errorCode !== 'CODE') throw new Error('code: ' + String(refused.errorCode))
    if (!/non-empty path/.test(refused.message)) throw new Error('message: ' + refused.message)
  }
})

test('a file that cannot be read says which argument and why', () => {
  const refused = refusal(() => readJsonFile(join(scratch, 'missing.json'), 'modelPath', 'CODE'))
  if (refused === undefined) throw new Error('a missing file was accepted')
  if (!/modelPath could not be read/.test(refused.message)) throw new Error('message: ' + refused.message)
  if (!/resolves against the process working directory/.test(refused.message)) throw new Error('the message does not say where a relative path lands')
})

test('a file that is not JSON is refused as JSON, not as unreadable', () => {
  const broken = file('broken.json', '{ nope')
  const refused = refusal(() => readJsonFile(broken, 'modelPath', 'CODE'))
  if (refused === undefined) throw new Error('invalid JSON was accepted')
  if (!/is not valid JSON/.test(refused.message)) throw new Error('message: ' + refused.message)
})

test('exactly one of the inline value and the path, with a sentence for each way it is wrong', () => {
  const path = file('one.json', '{"a":2}')
  if (oneOf(undefined, path, 'model', 'modelPath', 'CODE').a !== 2) throw new Error('the file was not read')
  if (oneOf({ a: 1 }, undefined, 'model', 'modelPath', 'CODE').a !== 1) throw new Error('the inline value was not used')
  const both = refusal(() => oneOf({ a: 1 }, path, 'model', 'modelPath', 'CODE'))
  if (both === undefined || !/not both/.test(both.message)) throw new Error('both arguments were accepted')
  const neither = refusal(() => oneOf(undefined, undefined, 'model', 'modelPath', 'CODE'))
  if (neither === undefined || !/has to come from somewhere/.test(neither.message)) throw new Error('neither argument was refused')
})

rmSync(scratch, { recursive: true, force: true })

if (failures > 0) {
  console.log('model-file tests failed:', failures)
  process.exit(1)
}
console.log('all model-file tests passed')
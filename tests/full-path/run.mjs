// The combined smoke path: one run that touches every family end to end.
//
// `tests/full-suite.mjs` is the runner, not a suite - the registry forbids listing it as one, so the gate cannot run it directly. This suite runs it
// as a subprocess and requires its own summary, which keeps the smoke path from rotting into a command nobody has executed since it was written.
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

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

const runFull = () => {
  try {
    return { code: 0, output: execFileSync(process.execPath, [join(repo, 'tests', 'full-suite.mjs')], { cwd: repo, encoding: 'utf8' }) }
  } catch (error) {
    const failure = error
    return { code: failure.status ?? 1, output: String(failure.stdout ?? '') + String(failure.stderr ?? '') }
  }
}

const run = runFull()

test('the combined path exits zero', () => {
  if (run.code !== 0) throw new Error('exit ' + String(run.code) + ': ' + run.output.slice(-300))
})

test('the combined path reports its own summary', () => {
  const summary = /FULL TEST SUMMARY:\s*(\d+) passed,\s*(\d+) failed/.exec(run.output)
  if (summary === null) throw new Error('no summary line: ' + run.output.slice(-200))
  if (Number(summary[2]) !== 0) throw new Error(summary[2] + ' failed')
  if (Number(summary[1]) < 20) throw new Error('only ' + summary[1] + ' checks ran')
})

test('the path covers more than one family', () => {
  // A path that silently lost a family would still exit zero; the names it prints are what shows each one ran.
  for (const marker of ['SM ', 'CMP ', 'DM ']) {
    if (!run.output.includes(marker)) throw new Error('nothing from the ' + JSON.stringify(marker) + ' family ran')
  }
})

if (failures > 0) {
  console.log('full-path tests failed:', failures)
  process.exit(1)
}
console.log('all full-path tests passed')
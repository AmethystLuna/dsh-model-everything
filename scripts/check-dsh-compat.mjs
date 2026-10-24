/**
 * Is the compatibility table older than the dsh that ships today?
 *
 * Dependabot keeps the dev dependencies current but deliberately does not touch the
 * `@deepseek-ai/*` entries in `peerDependencies`: those are the compatibility claim this repository makes
 * one dsh release at a time, and a range bump there would declare support for a release nothing has
 * verified. That leaves one hole - nothing notices a new dsh release - and it is the hole that let 0.4.0
 * ship a table that stopped at `0.2.1-rc.2` while `0.2.1-rc.3` was current.
 *
 * This script answers the question CI can answer without judgement: which published dsh versions are not
 * in `dsh.compatibility.dshReleases`? It prints one line per version and exits 1 when the table is behind,
 * so a scheduled workflow can open an issue instead of waiting for someone to remember.
 *
 * Usage: node scripts/check-dsh-compat.mjs [--json]
 */
import { readFileSync } from 'node:fs'

const REGISTRY = 'https://registry.npmjs.org/@deepseek-ai%2Fdsh'

/** Semantic-ish compare for dsh's version shapes: `0.2.1-rc.3` is above `0.2.1-alpha.5`. */
function compare(left, right) {
  const parse = (version) => {
    const [core, pre = ''] = version.split('-', 2)
    const [major, minor, patch] = core.split('.').map(Number)
    return { major, minor, patch, pre }
  }
  const a = parse(left)
  const b = parse(right)
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key]
  }
  if (a.pre === b.pre) return 0
  if (a.pre === '') return 1
  if (b.pre === '') return -1
  // prerelease identifiers sort segment by segment; a numeric segment is below an alphanumeric one
  const as = a.pre.split('.')
  const bs = b.pre.split('.')
  for (let index = 0; index < Math.max(as.length, bs.length); index += 1) {
    const one = as[index]
    const two = bs[index]
    if (one === undefined) return -1
    if (two === undefined) return 1
    const oneNumeric = /^\d+$/.test(one)
    const twoNumeric = /^\d+$/.test(two)
    if (oneNumeric && twoNumeric && Number(one) !== Number(two)) return Number(one) - Number(two)
    if (oneNumeric !== twoNumeric) return oneNumeric ? -1 : 1
    if (one !== two) return one < two ? -1 : 1
  }
  return 0
}

const json = process.argv.includes('--json')
const declared = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const table = declared.dsh?.compatibility?.dshReleases ?? {}

const response = await fetch(REGISTRY, { headers: { accept: 'application/vnd.npm.install-v1+json' } })
if (!response.ok) {
  console.error('could not read the registry: HTTP ' + String(response.status))
  process.exit(2)
}
const published = Object.keys((await response.json()).versions ?? {})

const unmeasured = published.filter((version) => table[version] === undefined).sort(compare)
const newestTable = Object.keys(table).sort(compare).at(-1) ?? '(none)'
const newestPublished = published.sort(compare).at(-1) ?? '(none)'

// A version older than the newest measured one is history, not work: only a version at or above it needs
// a round. That keeps a stale backfill out of the issue.
const actionable = unmeasured.filter((version) => compare(version, newestTable) > 0)
const history = unmeasured.length - actionable.length

if (json) {
  console.log(JSON.stringify({ newestPublished, newestTable, actionable, olderUnmeasured: history }, null, 2))
} else {
  console.log('newest published dsh: ' + newestPublished)
  console.log('newest measured in dsh.compatibility.dshReleases: ' + newestTable)
  for (const version of actionable) console.log('  needs a round: ' + version)
  if (history > 0) console.log('  (' + String(history) + ' older releases are deliberately not measured)')
}

// `exitCode` rather than `exit()`: calling exit while fetch is still closing its socket crashes the
// process on Windows, which reports a failure the table does not have.
process.exitCode = actionable.length > 0 ? 1 : 0

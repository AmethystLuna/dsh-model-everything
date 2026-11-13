// The npm package: what actually leaves, and whether the paths the manifest promises are in it.
//
// `exports` is a promise to a consumer - a subpath that resolves to nothing fails at their import, not here. So the tarball is listed and every
// target is looked for in it, rather than trusting the glob in `files`.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
const pkg = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'))

const packed = () => {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json'], { cwd: repo, encoding: 'utf8', shell: true })
  const parsed = JSON.parse(output)
  return new Set(parsed[0].files.map((entry) => String(entry.path)))
}

const files = packed()

test('the two files the loader reads are in the package', () => {
  for (const file of ['lib/index.js', 'lib/client.js']) {
    if (!files.has(file)) throw new Error(file + ' is not packed')
  }
})

test('every path the exports map promises is in the package', () => {
  const targets = []
  const walk = (value) => {
    if (typeof value === 'string') { targets.push(value); return }
    if (value !== null && typeof value === 'object') for (const inner of Object.values(value)) walk(inner)
  }
  walk(pkg.exports ?? {})
  if (targets.length === 0) throw new Error('the manifest declares no exports')
  const packedPaths = [...files]
  const asPattern = (path) => {
    const parts = path.split('*').map((part) => part.split('').map((character) => '\\^$.*+?()[]{}|'.includes(character) ? '\\' + character : character).join(''))
    return new RegExp('^' + parts.join('.*') + '$')
  }
  for (const target of targets) {
    const path = String(target).replace(/^\.\//, '')
    if (path.includes('*')) {
      const pattern = asPattern(path)
      if (!packedPaths.some((candidate) => pattern.test(candidate))) {
        throw new Error('exports pattern ' + path + ' matches nothing in the package')
      }
      continue
    }
    if (!files.has(path)) throw new Error('exports names ' + path + ', which is not packed')
  }
})

test('the suites do not ship', () => {
  const shipped = [...files].filter((path) => path.startsWith('tests/'))
  if (shipped.length > 0) throw new Error('the tarball carries ' + String(shipped.length) + ' test file(s)')
})

test('every shipped skill keeps its SKILL.md', () => {
  const skills = [...files].filter((path) => path.startsWith('skills/') && path.endsWith('/SKILL.md'))
  if (skills.length === 0) throw new Error('no SKILL.md is packed')
  const directories = new Set(skills.map((path) => path.split('/')[1]))
  for (const directory of directories) {
    if (!files.has('skills/' + directory + '/SKILL.md')) throw new Error(directory + ' ships without a SKILL.md')
  }
})

test('the package carries its licence and its readme', () => {
  for (const file of ['README.md', 'LICENSE']) {
    if (!files.has(file)) throw new Error(file + ' is not packed')
  }
})

if (failures > 0) {
  console.log('packaging tests failed:', failures)
  process.exit(1)
}
console.log('all packaging tests passed')
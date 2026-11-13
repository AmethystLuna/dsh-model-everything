// Every path a shipped document names exists, and every command it names is one the package has.
//
// A dead link or a renamed script costs a reader the same as a wrong sentence, and neither shows up in a test that only reads the sentence. These
// three checks are structural: the markdown links resolve, `npm run <name>` is a script in package.json, and `node <path>` is a file.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

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

const markdown = (base) => {
  if (!existsSync(base)) return []
  return readdirSync(base, { withFileTypes: true }).flatMap((entry) => {
    const full = join(base, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : markdown(full)
    return entry.name.endsWith('.md') ? [full] : []
  })
}

const DOCS = [
  ...markdown(join(repo, 'skills')),
  ...markdown(join(repo, 'docs')),
  ...['README.md', 'README.en-US.md', 'AGENTS.md', 'RELEASE.md', 'DSH-COMPATIBILITY.md'].map((name) => join(repo, name)).filter((file) => existsSync(file)),
]

test('the documents were read, so the checks below mean something', () => {
  if (DOCS.length < 20) throw new Error('only ' + String(DOCS.length) + ' documents were found')
})

test('every markdown link resolves', () => {
  const missing = []
  for (const file of DOCS) {
    for (const match of readFileSync(file, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = match[1]
      if (/^(https?:|mailto:|#)/.test(target)) continue
      const path = resolve(dirname(file), target.split('#')[0])
      if (!existsSync(path)) missing.push(relative(repo, file) + ' -> ' + target)
    }
  }
  if (missing.length > 0) throw new Error(missing.slice(0, 3).join(' | '))
})

test('every `npm run` a document names is a script the package has', () => {
  const scripts = new Set(Object.keys(JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).scripts ?? {}))
  const unknown = []
  for (const file of DOCS) {
    for (const match of readFileSync(file, 'utf8').matchAll(/npm run ([a-z:\-]+)/g)) {
      if (!scripts.has(match[1])) unknown.push(relative(repo, file) + ' -> npm run ' + match[1])
    }
  }
  if (unknown.length > 0) throw new Error(unknown.slice(0, 3).join(' | '))
})

test('every `node <path>` a document names is a file', () => {
  const missing = []
  for (const file of DOCS) {
    for (const match of readFileSync(file, 'utf8').matchAll(/node ([a-zA-Z0-9_./-]+\.mjs)/g)) {
      if (!existsSync(join(repo, match[1]))) missing.push(relative(repo, file) + ' -> node ' + match[1])
    }
  }
  if (missing.length > 0) throw new Error(missing.slice(0, 3).join(' | '))
})

if (failures > 0) {
  console.log('docs-paths tests failed:', failures)
  process.exit(1)
}
console.log('all docs-paths tests passed')
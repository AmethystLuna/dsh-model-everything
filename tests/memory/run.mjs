// Memory gate: the two-level index stays complete, every topic carries its frontmatter,
// and nothing lands in the memory that should not be committed (local absolute paths,
// scratch directories, file:// links, or links that leave the memory tree).
//
// The categories are derived from disk (INDEX-*.md), never from a hardcoded list, so a
// new category is added by adding its index and its row in MEMORY.md.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const memoryRoot = fileURLToPath(new URL('../../.github/memory/', import.meta.url))

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

const files = walk(memoryRoot)
const relative = (full) => full.slice(memoryRoot.length).split('\\').join('/')
const indexes = files.filter((f) => /^INDEX-[^/]+\.md$/.test(relative(f)))
const topics = files.filter((f) => !relative(f).startsWith('INDEX-') && relative(f) !== 'MEMORY.md')

check('the memory root, its indexes and at least one topic exist', () => {
  if (!files.some((f) => relative(f) === 'MEMORY.md')) throw new Error('MEMORY.md is missing')
  if (indexes.length === 0) throw new Error('no INDEX-*.md; the categories are derived from these')
  if (topics.length === 0) throw new Error('no topic file under the memory root')
})

const indexText = indexes.map((f) => readFileSync(f, 'utf8')).join('\n')
const rootText = readFileSync(join(memoryRoot, 'MEMORY.md'), 'utf8')

check('every topic is listed in a category index', () => {
  const missing = topics.filter((f) => !indexText.includes(relative(f).split('/').pop()))
  if (missing.length > 0) throw new Error('topic files no index row points at: ' + missing.map(relative).join(', '))
})

check('every category index is named in the memory root', () => {
  const missing = indexes.filter((f) => !rootText.includes(relative(f)))
  if (missing.length > 0) throw new Error('index files the root does not name: ' + missing.map(relative).join(', '))
})

// A link in the memory may point at any file in this repository: the release runbook, a
// skill, a source file. What it may not do is leave the repository or dangle.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

check('every link in the memory resolves inside the repository', () => {
  const broken = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1]
      if (target.startsWith('https://')) continue
      if (/^[a-z]+:/i.test(target)) { broken.push(relative(file) + ' -> ' + target); continue }
      const resolved = resolve(join(file, '..', target))
      if (!resolved.startsWith(repoRoot)) {
        broken.push(relative(file) + ' -> ' + target + ' (outside the repository)')
        continue
      }
      try {
        if (!statSync(resolved).isFile()) broken.push(relative(file) + ' -> ' + target)
      } catch {
        broken.push(relative(file) + ' -> ' + target)
      }
    }
  }
  if (broken.length > 0) throw new Error('links that do not resolve: ' + broken.join('; '))
})

check('every file carries frontmatter with a name and a description', () => {
  const bad = []
  // Line endings are a checkout setting, not a property of the memory: with
  // `core.autocrlf=true` a fresh Windows checkout writes CRLF and a gate that insisted
  // on LF would fail on a tree nobody had edited.
  const normalized = (text) => text.replace(/\r\n/g, '\n')
  for (const file of files) {
    const text = normalized(readFileSync(file, 'utf8'))
    if (!text.startsWith('---\n')) { bad.push(relative(file) + ' (no frontmatter)'); continue }
    const end = text.indexOf('\n---', 3)
    const front = end < 0 ? '' : text.slice(0, end)
    if (!/^name: /m.test(front)) bad.push(relative(file) + ' (no name)')
    if (!/^description: /m.test(front)) bad.push(relative(file) + ' (no description)')
    if (!/^metadata:\s*$/m.test(front) || !/^\s+type: /m.test(front)) bad.push(relative(file) + ' (no metadata.type)')
  }
  if (bad.length > 0) throw new Error(bad.join(', '))
})

check('a category index names each of its topics with a when-to-read column', () => {
  const bad = []
  for (const file of indexes) {
    const text = readFileSync(file, 'utf8')
    const rows = text.split('\n').filter((line) => line.startsWith('| [') && line.includes(']('))
    if (rows.length === 0) { bad.push(relative(file) + ' (no topic rows)'); continue }
    for (const row of rows) {
      if (row.split('|').length < 5) bad.push(relative(file) + ' row without a when-to-read column: ' + row.slice(0, 60))
    }
  }
  if (bad.length > 0) throw new Error(bad.join(', '))
})

check('the memory carries nothing that must not be committed', () => {
  const forbidden = [
    [/(?<![A-Za-z])[A-Za-z]:\\/, 'a Windows absolute path'],
    [/(?<![A-Za-z])[A-Za-z]:\//, 'a Windows absolute path'],
    [/file:\/\//, 'a file:// URL'],
    [/\/Users\/|\/home\/[a-z]/, 'a POSIX home path'],
    [/\.dshstore|scrat ch|scratch\//i, 'a scratch directory'],
    [/\bghp_[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9]{20,}\b/, 'a credential-shaped token'],
    [/[\w.+-]+@[\w-]+\.(?:com|org|net|io|cn|dev|edu|gov)\b/, 'an email address'],
  ]
  const hits = []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const [pattern, label] of forbidden) {
      if (pattern.test(text)) hits.push(relative(file) + ': ' + label)
    }
  }
  if (hits.length > 0) throw new Error(hits.join('; '))
})

if (failures > 0) { console.log('memory gate failed:', failures); process.exit(1) }
console.log('all memory gate checks passed')

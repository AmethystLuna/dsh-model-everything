// The principles index has one job: every entry has to quote a file that actually says it.
//
// A principle attributed to the wrong place is worse than an unrecorded one, because a reader stops
// looking. The generator already refuses to write a bad quote; this keeps it that way, and checks the
// two properties a generator cannot see - that the document is reachable, and that it does not drift
// into becoming a second copy of the rules.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
let failures = 0
const test = (name, fn) => {
  try {
    fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', String(error.message).slice(0, 260))
  }
}

test('the principles index is the one the repository produces now', () => {
  const before = readFileSync(repo + 'docs/principles.md', 'utf8')
  execFileSync(process.execPath, [repo + 'docs/principles/generate.mjs'], { encoding: 'utf8', timeout: 300_000 })
  const after = readFileSync(repo + 'docs/principles.md', 'utf8')
  if (before !== after) throw new Error('the index drifted from the files it quotes. Regenerate and read the diff: a source moved, or a quote no longer matches.')
})

test('every quoted source exists and really contains the quote', () => {
  const index = readFileSync(repo + 'docs/principles.md', 'utf8')
  // Each section carries its quote as a blockquote followed by the file it came from.
  const sections = [...index.matchAll(/^> (.+)\n>\n> — \[`([^`]+)`\]/gm)]
  if (sections.length === 0) throw new Error('the index carries no quoted principle; this check would pass vacuously')
  for (const [, quote, source] of sections) {
    const path = source.replace(/^\.\.\//, '')
    if (!existsSync(repo + path)) throw new Error('a principle quotes ' + path + ', which does not exist')
    const text = readFileSync(repo + path, 'utf8')
    // The quote may be normalised for whitespace by the generator, so compare on collapsed text.
    const normalised = (value) => value.replace(/\s+/g, ' ').replace(/\*\*/g, '').trim()
    if (!normalised(text).includes(normalised(quote))) {
      throw new Error(path + ' no longer contains the quoted words: ' + quote.slice(0, 60))
    }
  }
})

test('the index is reachable from where a reader starts', () => {
  // AGENTS.md is the single source for how to work here, and the checklist is where a change begins.
  // A principle index nobody links to is a document nobody reads.
  for (const entry of ['AGENTS.md', 'docs/feature-checklist.md']) {
    const text = readFileSync(repo + entry, 'utf8')
    if (!text.includes('principles')) throw new Error(entry + ' does not point at the principles index')
  }
})

test('the index points at the rules instead of restating them', () => {
  const index = readFileSync(repo + 'docs/principles.md', 'utf8')
  // The procedure lives in AGENTS.md and tests/AGENTS.md; the index names them rather than copying them.
  for (const home of ['../AGENTS.md', '../tests/AGENTS.md']) {
    if (!index.includes(home)) throw new Error('the index does not point at ' + home)
  }
  if (!index.includes('feature-checklist.md')) throw new Error('the index does not connect to the checklist')
})

if (failures > 0) {
  console.log('principles tests failed:', failures)
  process.exit(1)
}
console.log('all principles tests passed')

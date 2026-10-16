// A Chinese sibling of a guide is a translation, and a translation can silently drop things. This
// checks that it did not: the numbers, the field names, the links.
//
// The first run of the suite this belongs to is what enforces "translate the prose, never the
// identifiers" - a translated field name would name nothing.
import { existsSync, readFileSync, readdirSync } from 'node:fs'

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

/** The pairs the repository is expected to keep in step, with the language each side is written in. */
const PAIRS = [
  { source: 'docs/report-reading/guide.md', translated: 'docs/report-reading/guide.zh-CN.md' },
  { source: 'CONTRIBUTING.md', translated: 'docs/contributing/guide.zh-CN.md' },
]

const headings = (text) => [...text.matchAll(/^#{1,4} .+$/gm)].map((match) => match[0])
const identifiers = (text) => new Set([...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]))
const links = (text) => new Set([...text.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1]))
const tables = (text) => [...text.matchAll(/^\|/gm)].length

test('every guide with a translation has the same headings', () => {
  for (const pair of PAIRS) {
    if (!existsSync(repo + pair.translated)) throw new Error(pair.translated + ' does not exist')
    const source = headings(readFileSync(repo + pair.source, 'utf8'))
    const translated = headings(readFileSync(repo + pair.translated, 'utf8'))
    if (source.length !== translated.length) {
      throw new Error(pair.translated + ' has ' + String(translated.length) + ' headings against ' + String(source.length) + ' in its source')
    }
    // The section ORDER has to match, so a reader of either can navigate by position.
    const order = source.map((heading, index) => (translated[index].startsWith('#'.repeat(heading.match(/^#+/)[0].length)) ? undefined : index)).filter((index) => index !== undefined)
    if (order.length > 0) throw new Error('the heading levels differ at position(s) ' + order.join(', '))
    if (tables(readFileSync(repo + pair.translated, 'utf8')) !== tables(readFileSync(repo + pair.source, 'utf8'))) {
      throw new Error('the table row count differs: a translation is not a place to lose a table')
    }
  }
})

/**
 * Whether a backticked span is an IDENTIFIER or a phrase the source happened to wrap in backticks.
 *
 * An identifier - a field, a code, a command, a path - has to survive translation character for
 * character, and translating one would name nothing. A phrase like " and " or " runs the combined
 * path. " is prose that happens to sit inside backticks, and a translation necessarily changes it.
 * The distinction is mechanical: an identifier has no spaces around its edges and is not a sentence.
 */
const isIdentifier = (span) => span.trim() === span && !/[.!?]\s*$/.test(span) && /[A-Za-z0-9_[\]./:-]/.test(span) && !/\s{2,}/.test(span.trim())

test('a translation keeps every identifier verbatim', () => {
  for (const pair of PAIRS) {
    const source = [...new Set([...identifiers(readFileSync(repo + pair.source, 'utf8'))].filter(isIdentifier))]
    const translated = identifiers(readFileSync(repo + pair.translated, 'utf8'))
    const missing = source.filter((identifier) => !translated.has(identifier))
    if (missing.length > 0) throw new Error(pair.translated + ' is missing identifier(s): ' + missing.slice(0, 8).join(', '))
  }
})

test('a translation adds no identifier the source does not have', () => {
  for (const pair of PAIRS) {
    const source = identifiers(readFileSync(repo + pair.source, 'utf8'))
    const translated = [...identifiers(readFileSync(repo + pair.translated, 'utf8'))].filter(isIdentifier)
    // An invented identifier is how a translation starts describing something that does not exist.
    const added = translated.filter((identifier) => !source.has(identifier))
    if (added.length > 0) throw new Error(pair.translated + ' names something its source does not: ' + added.slice(0, 8).join(', '))
  }
})

test('a translation links only to files that resolve', () => {
  for (const pair of PAIRS) {
    const text = readFileSync(repo + pair.translated, 'utf8')
    const dir = pair.translated.slice(0, pair.translated.lastIndexOf('/'))
    for (const target of links(text)) {
      if (target.startsWith('http') || target.startsWith('#')) continue
      const path = target.split('#')[0]
      if (!existsSync(repo + dir + '/' + path) && !existsSync(repo + path)) {
        throw new Error(pair.translated + ' links ' + target + ', which does not resolve')
      }
    }
  }
})

test('the translated side is actually translated', () => {
  for (const pair of PAIRS) {
    const text = readFileSync(repo + pair.translated, 'utf8')
    const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
    const share = text.length === 0 ? 0 : cjk / text.length
    // A "translation" that is a copy would pass every other check here.
    if (share < 0.15) throw new Error(pair.translated + ' is only ' + String(Math.round(share * 100)) + '% Chinese; it looks like a copy rather than a translation')
    // And prose, not just headings: the longest run of Latin words without CJK should be short.
    const runs = [...text.matchAll(/[A-Za-z][A-Za-z ,;:'"()\-]{120,}/g)]
    if (runs.length > 0) throw new Error(pair.translated + ' carries ' + String(runs.length) + ' untranslated paragraph(s): ' + runs[0][0].slice(0, 60))
  }
})

test('the language policy is written down and reachable', () => {
  // The policy was drift before it was a decision: the skills are English, the memory is Chinese, and
  // nobody had chosen either. It is recorded now, and the record has to be reachable from the tree it
  // governs, or the next contributor guesses again.
  const policy = 'docs/README.md'
  if (!existsSync(repo + policy)) throw new Error('there is no recorded policy at ' + policy)
  const text = readFileSync(repo + policy, 'utf8')
  for (const side of ['skills/**', 'docs/**', 'README.md', 'CONTRIBUTING.md']) {
    if (!text.includes(side)) throw new Error('the policy does not say which language ' + side + ' is written in')
  }
  // And it must name the pairs, so a reader can find both halves.
  for (const pair of PAIRS) {
    if (!text.includes(pair.translated.split('/').pop())) throw new Error('the policy does not name ' + pair.translated)
  }
})

test('every Chinese sibling has an English source, and is registered against it', () => {
  // A translation with no source is a document that nothing compares, which is the drift this whole
  // suite exists to prevent. The source is not always the sibling file: the contribution guide's
  // English half is `CONTRIBUTING.md` at the repository root, where a contributor looks for it, while
  // its translation sits under `docs/` with the rest of the maintainer-facing prose.
  //
  // The registry is the authority rather than a name match, because two guides can share a file name -
  // an earlier version of this check paired `docs/contributing/guide.zh-CN.md` with
  // `docs/report-reading/guide.md` and called it a match.
  const found = []
  const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const path = dir + '/' + entry.name
      if (entry.isDirectory()) { walk(path, out); continue }
      if (entry.name.endsWith('.md')) out.push(path.replaceAll('\\', '/'))
    }
    return out
  }
  const rel = (path) => path.replaceAll('\\', '/').replace(repo.replaceAll('\\', '/'), '').replace(/^\/+/, '')
  const allMarkdown = walk(repo).map(rel)
  for (const path of allMarkdown) {
    if (path.endsWith('.zh-CN.md')) found.push(path)
  }
  if (found.length === 0) throw new Error('no Chinese sibling found; this check would pass vacuously')
  for (const translated of found) {
    const declared = PAIRS.find((pair) => pair.translated === translated)
    if (declared === undefined) throw new Error(translated + ' is not in the registry, so nothing checks its content')
    if (!allMarkdown.includes(declared.source)) throw new Error(translated + ' is registered against ' + declared.source + ', which does not exist')
  }
  // And the other direction: a registered pair whose translation was deleted is a broken registry.
  for (const pair of PAIRS) {
    if (!found.includes(pair.translated)) throw new Error('the registry lists ' + pair.translated + ', which is not on disk')
  }
})

if (failures > 0) {
  console.log('translation tests failed:', failures)
  process.exit(1)
}
console.log('all translation tests passed')

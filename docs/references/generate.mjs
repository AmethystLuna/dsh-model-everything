// docs/references.md, assembled from the citation sentences in the provenance tables.
//
// Extracted rather than rewritten, and that is the whole point: a hand-copied bibliography drifts
// from the text it is a bibliography of, and the audit that produced this file is the evidence - a
// first scan turned "MIT Press (2008)" into "Press 2008" and "Addison-Wesley (2002)" into
// "Wesley (2002)", which are fragments of a work rather than the work.
//
// The grouping is written here, because a bibliography is read by subject; the entries are not.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Resolved from this file, never from a hardcoded checkout: the absolute path this used to
// carry was the only thing in the repository that described one particular machine, and it
// made the generator unrunnable anywhere else.
const repo = fileURLToPath(new URL('../../', import.meta.url)).replaceAll('\\', '/').replace(/\/?$/, '/')

/** Where the citations live. Listed, because a new provenance table is a deliberate act. */
const SOURCES = [
  { path: 'skills/model-everything/references/logic-verification-guide.md', group: 'verification' },
  { path: 'skills/model-everything-datamodel/references/data-model-guide.md', group: 'data' },
  { path: 'skills/model-everything-structure/references/structure-review-guide.md', group: 'structure' },
  { path: 'skills/model-everything-design/SKILL.md', group: 'structure' },
  { path: '.github/memory/design/design-review.md', group: 'structure' },
]

const GROUPS = {
  verification: 'Verification, model checking and concurrency',
  data: 'Data models and constraints',
  structure: 'Graph theory behind the structural reviews',
}

/**
 * A citation as a reader wants it. The forms differ by file - one names the venue after the year, one
 * before it, one is a bare author-year inline - so the patterns cover each, and the results are
 * deduplicated by the work's title afterwards.
 */
const PATTERNS = [
  // Author(s), *Title*, Venue (Year)
  /[A-Z][A-Za-z]+(?:\s*(?:&|and|,)\s*[A-Z][A-Za-z]+)*,\s*\*[^*]+\*,\s*[^.|()]{2,60}\((?:19|20)\d{2}\)/g,
  // Author(s), *Title*, Venue YEAR  (no parentheses, as the data guide writes it)
  /[A-Z][A-Za-z]+(?:\s*(?:&|and|,)\s*[A-Z][A-Za-z]+)*,\s*\*[^*]+\*,\s*[^.|,()]{2,60}?\s(?:19|20)\d{2}/g,
  // Author, *Title* (Year)
  /[A-Z][A-Za-z]+(?:\s*(?:&|and)\s*[A-Z][A-Za-z]+)*,\s*\*[^*]+\*\s*\(\d{4}\)/g,
  // Author, *Title* - a trailing clause names the work without a year, and the year is stated nearby
  /[A-Z][A-Za-z]+,\s*\*[^*]{8,90}\*/g,
  // Garey & Johnson, *Computers and Intractability* - two authors before the title
  /[A-Z][A-Za-z]+(?:\s*(?:&|and)\s*[A-Z][A-Za-z]+)+,\s*\*[^*]{8,90}\*/g,
  // Author & Author (Year) - including the inline lists, separated by a semicolon
  /[A-Z][A-Za-z]+(?:\s*(?:&|and)\s*[A-Z][A-Za-z]+)+\s*\((?:19|20)\d{2}\)/g,
  /[A-Z][A-Za-z]+(?:\s*(?:&|and)\s*[A-Z][A-Za-z]+)+\s+(?:19|20)\d{2}/g,
]

/**
 * The key a citation is filed under.
 *
 * One work is spelled several ways across these files: "Clarke & Emerson 1981" and "Clarke & Emerson,
 * *Design and Synthesis of Synchronization Skeletons Using Branching-Time Temporal Logic*, LNCS 131
 * (1981)" are the same paper. The title identifies it when there is one; when there is not, a set of
 * surnames plus a year is unique in a bibliography this small. Keying on the best available identity
 * makes both spellings land on one entry, without a second merge pass.
 */
const workKey = (citation) => {
  const title = /\*([^*]+)\*/.exec(citation)
  if (title !== null) return title[1].toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
  const year = /\b((?:19|20)\d{2})\b/.exec(citation)
  if (year === null) return citation.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  const names = [...citation.split('*')[0].matchAll(/\b([A-Z][a-z]{2,})\b/g)].map((match) => match[1].toLowerCase())
  if (names.length === 0) return citation.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
  return [...new Set(names)].sort().join('+') + '@' + year[1]
}

// Every citation, first, with where it came from. Nothing is merged in this pass: merging while
// collecting is what produced a duplicated entry and a chain of patches around it.
const raw = []
for (const source of SOURCES) {
  const text = readFileSync(repo + source.path, 'utf8')
  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const citation = match[0].replace(/\s+/g, ' ').replace(/\s+([,.)])/g, '$1').trim()
      if (citation.length < 14) continue
      // A fragment: a venue or a publisher on its own is not a work.
      if (/^(?:MIT )?(?:Press|Wesley|Wiley|Springer|ACM|IEEE)\b/.test(citation)) continue
      raw.push({ group: source.group, citation, hasYear: /\b(?:19|20)\d{2}\b/.test(citation), source: source.path })
    }
  }
}

/** The surnames a citation names, which is what a bare author-year shares with the full one. */
const surnames = (citation) => [...citation.split('*')[0].matchAll(/\b([A-Z][a-z]{2,})\b/g)].map((match) => match[1])

/** The year a citation names, if it names one. */
const yearOf = (citation) => /\b((?:19|20)\d{2})\b/.exec(citation)?.[1]

// Second pass: one entry per work, per group. A work is the title when there is one, and the surnames
// plus the year when there is not - and a bare author-year is folded into the full entry it names,
// rather than listed as a second, thinner line.
const byGroup = new Map()
for (const item of raw) {
  if (!byGroup.has(item.group)) byGroup.set(item.group, new Map())
  const group = byGroup.get(item.group)
  const key = workKey(item.citation)
  const existing = group.get(key)
  const better = existing === undefined
    || (item.hasYear && !existing.hasYear)
    || (item.hasYear === existing.hasYear && item.citation.length > existing.citation.length)
  if (better) group.set(key, { citation: item.citation, hasYear: item.hasYear, citedBy: new Set([...(existing?.citedBy ?? []), item.source]) })
  else existing.citedBy.add(item.source)
}

// Fold a title-less entry into the titled entry for the same work, within its group.
for (const group of byGroup.values()) {
  const titled = [...group.values()].filter((entry) => /\*[^*]+\*/.test(entry.citation))
  for (const [key, entry] of [...group.entries()]) {
    if (/\*[^*]+\*/.test(entry.citation)) continue
    const names = surnames(entry.citation)
    const year = yearOf(entry.citation)
    if (names.length === 0 || year === undefined) continue
    const target = titled.find((other) => names.every((name) => surnames(other.citation).includes(name)) && other.citation.includes(year))
    if (target === undefined) continue
    for (const source of entry.citedBy) target.citedBy.add(source)
    group.delete(key)
  }
}

const lines = []
lines.push('# References')
lines.push('')
lines.push('The published work behind the checks, and the work behind the checks that have none.')
lines.push('')
lines.push('Every entry below was extracted from a `Provenance` section in this repository, and the file that')
lines.push('cites it is named with it, so a claim can be checked where it is made. The extraction is generated:')
lines.push('`docs/references/generate.mjs`. Nothing here is transcribed by hand, because a hand-copied')
lines.push('bibliography drifts from the text it belongs to.')
lines.push('')
lines.push('## The distinction this list exists to make')
lines.push('')
lines.push('A **published method** has a definition and a body of work behind it, so a finding computed from it')
lines.push('means what that work says it means. An **engineering convention** is this repository\'s own rule: it')
lines.push('catches something real, nothing outside defines it, and it may change without the literature moving.')
lines.push('')
lines.push('Most of the shipped checks are conventions. That is not a weakness — a convention stated as one is')
lines.push('more honest than a convention dressed as a citation — but a reader deciding how much weight to put')
lines.push('on a finding has to know which one they are holding.')
lines.push('')

for (const [key, title] of Object.entries(GROUPS)) {
  const group = byGroup.get(key)
  lines.push('## ' + title)
  lines.push('')
  if (group === undefined || group.size === 0) {
    lines.push('- (no citation recorded)')
    lines.push('')
    continue
  }
  for (const entry of [...group.values()].sort((a, b) => a.citation.localeCompare(b.citation))) {
    lines.push('- ' + entry.citation)
    lines.push('  <br>cited by ' + [...entry.citedBy].sort().join(', '))
  }
  lines.push('')
}

lines.push('## External checkers this plugin translates into')
lines.push('')
lines.push('These are not cited as method sources; they are tools the exporter writes input for, so a stronger')
lines.push('engine can decide what this one approximates. Naming them here keeps the export story in one place.')
lines.push('')
lines.push('- UPPAAL — timed automata')
lines.push('- TLA+ / TLC — temporal logic of actions')
lines.push('- PRISM — probabilistic model checking')
lines.push('- SPIN / Promela — explicit-state model checking')
lines.push('')
lines.push('## What has no published source')
lines.push('')
lines.push('Checks this repository defines itself, listed so that the absence is visible rather than implied.')
lines.push('The full table, per check, is in each domain\'s reference file.')
lines.push('')
lines.push('- paired-operation symmetry, resource-failure injection, declared-tick deadlines and budget')
lines.push('  checks in the verification engine, and the composition checks');
lines.push('- the data engine\'s invariant kinds beyond the relational ones Codd and Date define');
lines.push('- the design review\'s responsibility, interface-segregation and contract checks built on the')
lines.push('  published principles they measure');
lines.push('- the structural layer rules, which are a convention about declared partitions');

const text = lines.join('\n') + '\n'
mkdirSync(repo + 'docs/references', { recursive: true })
writeFileSync(repo + 'docs/references.md', text)

const total = [...byGroup.values()].reduce((sum, group) => sum + group.size, 0)
console.log('citations extracted: ' + String(total))
for (const [key, group] of byGroup) console.log('  ' + GROUPS[key].padEnd(48) + String(group.size))
console.log('')
console.log('written: docs/references.md (' + String(text.length) + ' chars)')

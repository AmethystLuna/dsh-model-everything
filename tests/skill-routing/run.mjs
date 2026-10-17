// Skill-routing evaluation: does the catalog send a user's request to the skill that
// answers it?
//
// The plugin cannot run this by itself - it registers tools and skills, it never calls a
// model - so this is an evaluator, not a gate inside the engine. It has two halves:
//
//   1. a structural check that always runs, and that ships: every case names a skill that
//      exists, every expected skill exists, every skill is covered by at least one trigger
//      and appears as some other case's near miss, and - the point of the whole exercise -
//      the words a case relies on survive in the catalog's *visible* budget, because the
//      model never sees the tail of an over-long description;
//   2. a scorer for a model's answer, so a routing change can be measured instead of
//      argued about.
//
// Usage:
//   node tests/skill-routing/run.mjs                     # the structural check
//   node tests/skill-routing/run.mjs --print-prompt      # the prompt to give a model
//   node tests/skill-routing/run.mjs --decisions d.json  # score { "<case index>": "<skill>" }
//
// The prompt asks for one JSON object per case, so a run is reproducible: the same corpus
// and the same catalog produce the same question.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const skillsRoot = fileURLToPath(new URL('../../skills/', import.meta.url))
const corpusPath = fileURLToPath(new URL('./corpus.json', import.meta.url))
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'))

/** dsh-tool-skill: DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH (catalogDescriptionMaxLength). */
const CATALOG_DESCRIPTION_MAX_LENGTH = corpus.catalogBudget ?? 500

/** The projection dsh-tool-skill applies before rendering a catalog line. */
function catalogDescription(value) {
  const normalized = value.replaceAll(/\s+/g, ' ').trim()
  return normalized.length <= CATALOG_DESCRIPTION_MAX_LENGTH
    ? normalized
    : normalized.slice(0, CATALOG_DESCRIPTION_MAX_LENGTH - 3) + '...'
}

/** Every shipped skill's catalog entry, exactly as the model would see it. */
function catalog() {
  const entries = []
  for (const name of readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
    const text = readFileSync(join(skillsRoot, name, 'SKILL.md'), 'utf8')
    // Line endings are a checkout setting, not a property of the skill: with
    // `core.autocrlf=true` a Windows checkout writes CRLF, and a reader that insisted on LF
    // would report every skill as missing its frontmatter.
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
    if (match === null) throw new Error(name + ' has no frontmatter')
    const description = /^description:\s*"([\s\S]*?)"\s*$/m.exec(match[1])
    if (description === null) throw new Error(name + ' has no quoted description')
    entries.push({ name, description: description[1], visible: catalogDescription(description[1]) })
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name))
}

const entries = catalog()
const shipped = new Set(entries.map((entry) => entry.name))
const byName = new Map(entries.map((entry) => [entry.name, entry]))

/** Every case, flattened, so the prompt and the scorer agree on the numbering. */
const flat = corpus.cases.flatMap((group) => [
  ...group.triggers.map((testCase) => ({ ...testCase, kind: 'trigger', group: group.skill })),
  ...group.nearMisses.map((testCase) => ({ ...testCase, kind: 'near miss', group: group.skill })),
])

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

// ------------------------------------------------------------- structural checks --

check('every case names a skill that ships', () => {
  const missing = new Set()
  for (const testCase of flat) {
    for (const name of [testCase.group, testCase.expected]) if (!shipped.has(name)) missing.add(name)
  }
  if (missing.size > 0) throw new Error('unknown skill(s): ' + [...missing].join(', '))
})

check('every shipped skill is a trigger somewhere, and a near miss somewhere else', () => {
  const triggered = new Set(corpus.cases.map((group) => group.skill))
  const missed = [...shipped].filter((name) => !triggered.has(name))
  if (missed.length > 0) throw new Error('no trigger case for: ' + missed.join(', '))
  const asNearMiss = new Set(flat.filter((testCase) => testCase.kind === 'near miss').map((testCase) => testCase.expected))
  const undefended = [...shipped].filter((name) => !asNearMiss.has(name) && name !== 'model-everything')
  if (undefended.length > 0) throw new Error('no near miss that must reach: ' + undefended.join(', '))
})

check('a trigger case never expects the group it is filed under to lose', () => {
  const wrong = flat.filter((testCase) => testCase.kind === 'trigger' && testCase.expected !== testCase.group)
  if (wrong.length > 0) throw new Error('trigger cases expecting another skill: ' + wrong.map((testCase) => testCase.utterance).join(' | '))
})

/** The skill that answers a request naming no domain: it is the route by elimination. */
const ENTRY_SKILL = 'model-everything'

/**
 * Words that name no domain, in two groups:
 *
 *  - grammar and function words, which say nothing about what is being asked;
 *  - the verbs a request uses to ask for work rather than to name what is worked on. Each of
 *    these opens at least one catalog line ("Use when reviewing ...", "Use when drawing ..."),
 *    so any request phrased as a request matches on the verb alone.
 *
 * Without this list the check below is vacuous, which it was: it required one substring hit,
 * and `"review"` inside `"Use when reviewing ..."` satisfied any request that asked for a
 * review - so a description that had lost its decisive word still passed.
 */
const NON_DOMAIN_WORDS = new Set(
  (
    'a an and the this that these those of to in on for with by as at from or if then than so but not no nor per via about against above below after before between during through into over under up down out off again further once now new old one two three four five six seven eight nine ten ' +
    'is are was were be been being it its have has had do does did done can could should would will may might must there here what which who whom when where why how all any some each every both more most other such only own same very just also our we us my me you your i yours theirs they them ' +
    'review reviews reviewing reviewed draw draws drawing drawn render renders rendering rendered write writes writing written check checks checking checked verify verifies verifying verified look looks looking see sees show shows showing tell tells telling give gives giving audit audits auditing audited describe describes describing list lists listing confirm confirms confirming use uses using need needs want wants think knows know say says said claim claims claimed promise promises promised find finds finding spot spots spotting'
  ).split(' ').filter(Boolean),
)

/** The words of a request that name something, so a catalog line could plausibly answer one. */
function domainWords(utterance) {
  const words = utterance.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []
  return [...new Set(words)].filter((word) => !NON_DOMAIN_WORDS.has(word))
}

/**
 * A five-letter stem: long enough to tell two words apart, short enough to survive an ending.
 * Whole words only, so `"plan"` is not satisfied by `"PlantUML"`.
 */
function stem(word) {
  return word.length >= 5 ? word.slice(0, 5) : word
}

// The one that makes the corpus mean something: a request that expects a domain skill has to
// name something that skill's catalog line names, or the catalog has nothing to route on.
//
// The entry skill is exempt, and the reason is not convenience: it is the route by elimination.
// "the plan promises the retry is idempotent" names no domain, which is exactly why the core
// skill is the answer, and a catalog line that named every such word would name everything.
check("a domain-skill case names a word that skill's catalog line names", () => {
  const unrouteable = []
  const seen = new Set()
  for (const testCase of flat) {
    if (testCase.expected === ENTRY_SKILL) continue
    // One utterance can be filed as a trigger and as another group's near miss: it is one
    // question, and it is reported once.
    const key = testCase.utterance + '|' + testCase.expected
    if (seen.has(key)) continue
    seen.add(key)
    const target = byName.get(testCase.expected)
    if (target === undefined) continue // the missing-skill check owns that case
    const named = new Set((target.visible.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []).map(stem))
    const words = domainWords(testCase.utterance)
    if (!words.some((word) => named.has(stem(word)))) {
      unrouteable.push('"' + testCase.utterance + '" names nothing in ' + testCase.expected + "'s catalog line (looked for: " + words.join(', ') + ')')
    }
  }
  if (unrouteable.length > 0) throw new Error(unrouteable.join(' | '))
})

check('no description is cut off in the catalog', () => {
  const truncated = entries.filter((entry) => entry.visible !== entry.description.replaceAll(/\s+/g, ' ').trim())
  if (truncated.length > 0) {
    throw new Error(truncated.map((entry) => entry.name + ' (' + entry.description.length + ' chars)').join(', ') + ' exceed the ' + String(CATALOG_DESCRIPTION_MAX_LENGTH) + '-character catalog budget')
  }
})

check('the corpus never expects one utterance to reach two different skills', () => {
  // The same sentence may appear as a trigger in one group and as a near miss in another -
  // that is the point of a near miss, and both must name the same skill. What cannot happen
  // is the corpus asking for two different answers to one question.
  const seen = new Map()
  for (const testCase of flat) {
    const previous = seen.get(testCase.utterance)
    if (previous !== undefined && previous !== testCase.expected) {
      throw new Error('"' + testCase.utterance + '" is expected to reach both ' + previous + ' and ' + testCase.expected)
    }
    seen.set(testCase.utterance, testCase.expected)
  }
})

// ------------------------------------------------------------------- the scorer --

/** Score `{ "<case index>": "<skill>" }` against the corpus. */
function score(decisions) {
  const perSkill = new Map()
  const wrong = []
  let correct = 0
  flat.forEach((testCase, index) => {
    const answer = decisions[String(index)]
    const entry = perSkill.get(testCase.group) ?? { right: 0, total: 0 }
    entry.total += 1
    if (answer === testCase.expected) {
      entry.right += 1
      correct += 1
    } else {
      wrong.push({
        index,
        kind: testCase.kind,
        utterance: testCase.utterance,
        expected: testCase.expected,
        got: answer ?? '(no answer)',
      })
    }
    perSkill.set(testCase.group, entry)
  })
  return { correct, total: flat.length, perSkill, wrong }
}

function printPrompt() {
  const lines = [
    'You are routing a request. Below is the skill catalog exactly as a model sees it, then a list of user requests.',
    'For each request, answer with the name of the single skill that should be loaded, or "none" if no skill applies.',
    'Answer with one JSON object: {"0": "<skill>", "1": "<skill>", ...} and nothing else.',
    '',
    'CATALOG',
  ]
  for (const entry of entries) lines.push('- ' + entry.name + ': ' + entry.visible)
  lines.push('', 'REQUESTS')
  flat.forEach((testCase, index) => lines.push(String(index) + '. ' + testCase.utterance))
  console.log(lines.join('\n'))
}

const decisionsFlag = process.argv.indexOf('--decisions')
if (process.argv.includes('--print-prompt')) {
  printPrompt()
} else if (decisionsFlag !== -1) {
  const file = process.argv[decisionsFlag + 1]
  if (file === undefined) {
    console.log('FAIL --decisions needs a file path')
    process.exit(1)
  }
  const decisions = JSON.parse(readFileSync(file, 'utf8'))
  const result = score(decisions)
  const percent = Math.round((result.correct / result.total) * 100)
  console.log('routing: ' + String(result.correct) + '/' + String(result.total) + ' (' + String(percent) + '%)')
  for (const [skill, entry] of result.perSkill) {
    console.log('  ' + skill.padEnd(32) + String(entry.right) + '/' + String(entry.total))
  }
  if (result.wrong.length > 0) {
    console.log('misrouted:')
    for (const miss of result.wrong) {
      console.log('  [' + miss.kind + '] "' + miss.utterance + '"')
      console.log('      expected ' + miss.expected + ', got ' + miss.got)
    }
  }
  process.exit(0)
}

if (failures > 0) {
  console.log('skill routing checks failed:', failures)
  process.exit(1)
}
console.log('all skill routing checks passed (' + String(flat.length) + ' cases over ' + String(entries.length) + ' skills)')

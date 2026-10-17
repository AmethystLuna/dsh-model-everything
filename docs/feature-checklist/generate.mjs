// docs/feature-checklist.md, assembled from the repository rather than from memory.
//
// Why generated: a checklist is the first document to go stale when a gate is added, and this
// repository has added several gates in one session. Each row below is measured - the path is checked
// to exist, the suite is read from disk, the step is read from package.json - so no row can describe a
// file that is not there or a check that does not run.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Resolved from this file, never from a hardcoded checkout: the absolute path this used to
// carry was the only thing in the repository that described one particular machine, and it
// made the generator unrunnable anywhere else.
const repo = fileURLToPath(new URL('../../', import.meta.url)).replaceAll('\\', '/').replace(/\/?$/, '/')
const pkg = JSON.parse(readFileSync(repo + 'package.json', 'utf8'))

/** The tests that actually run, in order, from the chain CI invokes. */
const chain = pkg.scripts['test:engine'].split(' && ').map((step) => step.replace('node ', '')).filter((step) => step.startsWith('tests/'))

/** What each suite is for, taken from its own checks rather than described by me. */
const suiteChecks = new Map()
for (const step of chain) {
  const suite = step.split('/')[1]
  const text = readFileSync(repo + step, 'utf8')
  // Either quote style: a check name carrying an apostrophe ("that skill's catalog line") is
  // written with double quotes, and a counter that read only single quotes silently lost it -
  // the checklist then said the suite had one check fewer than it does.
  //
  // An awaited call is still a check, and `await check(...)` is how an asynchronous one is
  // written: without the prefix the gate suite counted zero, which reads as "this suite
  // guards nothing".
  const checks = [...text.matchAll(/^(?:await\s+)?(?:check|test)\((['"])(.+?)\1/gm)].map((match) => match[2])
  suiteChecks.set(suite, checks)
}

/**
 * A thing a feature can add, and everything that has to move with it.
 *
 * `touches` are paths that must exist; `guarded` are suites whose checks fail when the pairing is
 * broken. Both are verified below, so a stale row is a failed generation rather than a wrong document.
 */
const ARTIFACTS = [
  {
    id: 'skill',
    what: 'A skill (or a change to one)',
    touches: ['skills/<name>/SKILL.md', 'tests/skill-routing/corpus.json'],
    guarded: ['catalog', 'skills', 'skill-routing', 'routing-map'],
    steps: [
      'The frontmatter `description` is the catalog row: it opens with "Use when", names the sibling that owns the adjacent case, and states what the skill does NOT do.',
      'It has to fit 500 characters, and the triggers have to be inside the first 497 - the rest is truncated away before the model sees it.',
      'Add a routing case: several utterances that must reach it, and near misses that must reach a sibling instead.',
      'Regenerate `docs/routing-map.md`; the row budget is why that map exists.',
    ],
  },
  {
    id: 'tool',
    what: 'A tool',
    touches: ['src/<name>-tool.ts', 'src/index.ts'],
    guarded: ['tool-boundary', 'catalog', 'documentation'],
    steps: [
      'One job per tool, and the description says when to reach for it - the tool schema is the only per-turn surface with no character ceiling.',
      'It names the sibling that owns the adjacent case, and states what it does not prove.',
      'Register it in `src/index.ts`, and add it to the fixture that checks every tool is wired.',
      'Add a tool-boundary case: a bad argument produces a coded refusal, not a raw throw.',
    ],
  },
  {
    id: 'code',
    what: 'A finding code',
    touches: ['src/<engine>.ts'],
    guarded: ['negatives', 'contracts'],
    steps: [
      'One code per case in the owning suite, and no other error beside it - assert WHICH check carries it.',
      'The nearest case that must NOT produce it goes in `tests/negatives`.',
      'If the code cannot be reached from the public API, pin the condition that shadows it instead of skipping it.',
      'A code that changes a verdict is violation level; a useful but non-decisive one is signal level.',
      'Record it in the domain reference file\'s code table.',
    ],
  },
  {
    id: 'schema',
    what: 'A report schema or a new field in one',
    touches: ['src/engine.ts'],
    guarded: ['contracts', 'documentation', 'report-reading', 'translation'],
    steps: [
      'Add it to `REPORT_SCHEMAS` with a versioned name.',
      'Record the new answer in `tests/contracts` - a changed report is a changed contract.',
      'If the reading order changes, say so in the report-reading guide and its reference.',
      'Update the README pair together: `README.md` and `README.en-US.md` move in one commit.',
    ],
  },
  {
    id: 'family',
    what: 'A UML diagram family',
    touches: ['src/uml-<family>.ts', 'src/uml-syntax.ts'],
    guarded: ['uml', 'catalog'],
    steps: [
      'A family is an engine-table entry plus a module: render, parse, review, and the capability decision.',
      'Say what the notation can faithfully carry and what it approximates - the fidelity claim is part of the family.',
      'Round-trip it: render, parse back, and require the model to survive.',
      'No tool schema changes: the family table is what keeps the tool surface closed for modification.',
    ],
  },
  {
    id: 'map',
    what: 'A generated map or measured document',
    touches: ['docs/<area>/generate-*.mjs'],
    guarded: ['documentation'],
    steps: [
      'Generate it from the real corpus, never hand-draw it.',
      'Self-check the output and refuse to write a malformed one.',
      'Add a drift test that regenerates and compares, or the map becomes a snapshot that quietly goes false.',
      'Write the prose from the map, not beside it.',
    ],
  },
  {
    id: 'doc',
    what: 'A documentation change',
    touches: ['docs/README.md'],
    guarded: ['documentation', 'translation'],
    steps: [
      'A claim about the repository gets a check that re-measures it: counts, links, gates, citations.',
      'A Chinese sibling keeps every identifier verbatim; only the prose is translated.',
      'The README pair moves together, and every relative link resolves.',
      'Say where the fact lives; do not copy it into a second place.',
    ],
  },
  {
    id: 'decision',
    what: 'A decision, or a rejection of one',
    touches: ['.github/memory/MEMORY.md'],
    guarded: ['memory'],
    steps: [
      'Add a topic file under the right category and a row in that category\'s index.',
      'Write what a future reader needs to ACT on, not a transcript: what was decided, what it replaced, and what made the alternative fail.',
      'Name what the decision costs, if it costs something.',
    ],
  },
]

// ------------------------------------------------------------------------ verify every row --

const problems = []
for (const artifact of ARTIFACTS) {
  for (const path of artifact.touches) {
    // A `<name>` placeholder is a path the author creates, so only literal paths are checked.
    if (path.includes('<')) continue
    if (!existsSync(repo + path)) problems.push(artifact.id + ': ' + path + ' does not exist')
  }
  for (const suite of artifact.guarded) {
    if (!suiteChecks.has(suite)) problems.push(artifact.id + ': suite ' + suite + ' is not in the chain')
  }
}
if (problems.length > 0) {
  console.log('NOT WRITTEN; the checklist would describe something that is not there:')
  for (const problem of problems) console.log('  - ' + problem)
  process.exit(1)
}

console.log('=== verified ===')
console.log('  ' + String(ARTIFACTS.length) + ' artifact kinds')
console.log('  ' + String(chain.length) + ' suites in the chain, each read from disk')
const totalChecks = [...suiteChecks.values()].reduce((sum, checks) => sum + checks.length, 0)
console.log('  ' + String(totalChecks) + ' checks a change has to keep green')

// ---------------------------------------------------------------------------------- write --

const lines = []
lines.push('# Adding a feature: the checklist')
lines.push('')
lines.push('Everything that has to move when a capability is added, derived from this repository rather than')
lines.push('remembered. `docs/feature-checklist/generate.mjs` assembles it and `tests/feature-checklist` fails')
lines.push('when a row describes a file that is not there or a check that does not run.')
lines.push('')
lines.push('The rules themselves live where they are enforced - [AGENTS.md](../AGENTS.md),')
lines.push('[tests/AGENTS.md](../tests/AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md), [RELEASE.md](../RELEASE.md).')
lines.push('This is the order to do them in, not a second copy of them.')
lines.push('')
lines.push('The reasons behind the rows are in [principles.md](principles.md): what this repository believes,')
lines.push('where each belief is stated, and what it cost to learn. When a row here and a principle disagree,')
lines.push('the principle wins and this checklist is what should change.')
lines.push('')
lines.push('## Before writing code')
lines.push('')
lines.push('1. **Decide which of the two shapes it is.** A claim about a method cites a source; a claim about')
lines.push('   behaviour is reproducible. If both, the behaviour comes first.')
lines.push('2. **Find the surface it belongs on.** A trigger belongs in a tool description, which is the only')
lines.push('   per-turn surface with no ceiling. The catalog row truncates at 500 characters, and the longest')
lines.push('   row here is already 493.')
lines.push('3. **Say what it does not do.** Every capability in this repository states its non-goal beside its')
lines.push('   scope claim.')
lines.push('')
lines.push('## What to touch, by what you are adding')
lines.push('')

for (const artifact of ARTIFACTS) {
  lines.push('### ' + artifact.what)
  lines.push('')
  lines.push('| | |')
  lines.push('|---|---|')
  lines.push('| Files | ' + artifact.touches.map((path) => '`' + path + '`').join(', ') + ' |')
  lines.push('| Kept honest by | ' + artifact.guarded.map((suite) => '`tests/' + suite + '`').join(', ') + ' |')
  lines.push('')
  for (const step of artifact.steps) lines.push('- ' + step)
  lines.push('')
}

lines.push('## Before committing')
lines.push('')
lines.push('The chain CI runs, in order. Node 20 and Node 22 both.')
lines.push('')
lines.push('```bash')
for (const step of chain) lines.push('node ' + step)
lines.push('```')
lines.push('')
lines.push('And the gates around it:')
lines.push('')
lines.push('- `npm run typecheck`')
lines.push('- `npm run build`, then `git diff --exit-code -- lib` - the build output is committed, so it moves in the same commit as `src/`')
lines.push('- `npm run lint:md`')
lines.push('- `npm run bump -- --check` and `npm run bump -- --audit` when the version moves')
lines.push('')
lines.push('## The suites, and what each one holds')
lines.push('')
lines.push('| Suite | Checked | Holds |')
lines.push('|---|---|---|')
for (const step of chain) {
  const suite = step.split('/')[1]
  const checks = suiteChecks.get(suite) ?? []
  const example = (checks[0] ?? '(read the file)').replace(/\|/g, '/')
  lines.push('| `' + suite + '` | ' + String(checks.length) + ' | ' + example.slice(0, 96) + ' |')
}
lines.push('')
lines.push('## When the change is a fix, not a feature')
lines.push('')
lines.push('The same rows apply, with one addition: a fix needs a case that goes RED without it. Break the')
lines.push('engine on purpose in a scratch copy and require the suite to notice - and check that the mutated')
lines.push('file still parses, because a syntax error reads as a passing test.')
lines.push('')

const text = lines.join('\n')
writeFileSync(repo + 'docs/feature-checklist.md', text)
console.log('')
console.log('written: docs/feature-checklist.md (' + String(text.length) + ' chars)')

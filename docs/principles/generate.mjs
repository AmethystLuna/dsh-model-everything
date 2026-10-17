// docs/principles.md, assembled from a registry whose every entry is verified against the file it
// cites: the file exists, and the quoted words are in it.
//
// Why this document rather than a copy of the rules: all twenty principles turned out to be recorded
// already, but spread over fifteen files with no index. A reader asking "what does this repository
// believe" had nowhere to start, and the answer they reconstructed would be their own.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const repo = 'F:/workspace/dsh-plugins/dsh-model-everything/'

/**
 * One principle: what it says, where it is stated, and why this repository holds it.
 *
 * `quote` is checked to appear in `source` verbatim. `because` is the part a reader cannot get from the
 * rule alone - usually a real defect that produced it.
 */
const PRINCIPLES = [
  {
    id: 'closed-shape',
    title: 'A malformed input becomes a coded report, never a raw throw',
    source: 'AGENTS.md',
    quote: 'Reports are contracts.',
    because: 'A throw carries no route for the model: no code, no verdict, nothing to branch on. The closed shape is what makes every refusal answerable.',
    enforced: 'tests/tool-boundary',
  },
  {
    id: 'algebraic-degeneracy',
    title: 'Valid JSON with invalid logic is refused with its reason',
    source: 'skills/model-everything/references/dsh-model-schema.md',
    quote: 'A vacuous check is worse than a rejected one',
    because: '`{ all: [] }` is vacuously true, so accepting it reports a positive all-clear over nothing. A misspelled state id can never be reached, so the invariant can never fail.',
    enforced: 'tests/engine',
  },
  {
    id: 'prevent-by-mathematics',
    title: 'What mathematics can prevent, do not wait to discover by hitting it',
    source: '.github/memory/design/robustness-audit.md',
    quote: '能用数学挡住的异常，就不要靠撞上才发现；而「异常处理」本身也是建模的审查结果。',
    gloss: "An anomaly that mathematics can prevent should not be discovered by running into it, and handling an anomaly is itself a review result about the model.",
    because: 'Three layers, in the order they apply: a closed shape (malformed input becomes a coded report), algebraic degeneracy (valid JSON with invalid logic is refused with its reason), and decidability (whether the model can be decided at all is computed, not discovered by running out of budget). Handling an anomaly is itself a review result about the model, which is why `S6_UNBOUNDED_VARIABLE` is an accusation against the model and not a note about the search.',
    enforced: 'tests/engine, tests/tool-boundary, tests/baseline',
  },
  {
    id: 'false-positive-worse',
    title: 'A mathematical criterion\'s false positive costs more than its false negative',
    source: '.github/memory/design/robustness-audit.md',
    quote: '数学判据的假阳性比假阴性更伤，因为它指控一个正确的模型。',
    gloss: "A mathematical criterion false positive costs more than its false negative, because it accuses a model that is correct.",
    because: 'The first decidability criterion reported monotone cycles on unreachable islands - defects the analysis invented rather than found. So the criterion is narrowed on purpose: only `inc`/`dec` monotonicity, `set` neither proves nor breaks, only cycles reachable from the initial state.',
    enforced: 'tests/engine',
  },
  {
    id: 'decidability',
    title: 'An answer comes from the model, not from a budget that ran out',
    source: '.github/memory/design/robustness-audit.md',
    quote: '是**模型的性质，不是预算的性质**',
    gloss: "It is a property of the model, not of the budget.",
    because: 'Raising a limit is not a fix. An unbounded reachable set makes every limit undeciding, so the defect is reported as the model property it is.',
    enforced: 'tests/engine (`S6_UNBOUNDED_VARIABLE`)',
  },
  {
    id: 'no-verdict-on-principles',
    title: 'A report never says whether a design conforms to a principle',
    source: 'AGENTS.md',
    quote: 'Say what it does not prove.',
    because: 'It says the design contradicted its own declaration, or states a structural fact. A judged verdict dressed as a measurement is the thing this plugin exists not to be.',
    enforced: 'tests/design-engine, tests/structure',
  },
  {
    id: 'not-a-pass',
    title: 'A skip is not a pass, and a truncated search is not a pass',
    source: 'README.en-US.md',
    quote: 'A truncated search is not a pass',
    because: 'A cap that reads as a positive answer is a false green, and it is the failure a reader cannot detect from the outside.',
    enforced: 'tests/report-view, tests/engine',
  },
  {
    id: 'measure-dont-assert',
    title: 'A claim about the repository is measured, not asserted',
    source: 'AGENTS.md',
    quote: 'Compatibility is measured, never assumed.',
    because: 'Every count, gate and citation in these documents is re-measured by a test. A claim kept by hand drifts silently, and drift is only visible against the source.',
    enforced: 'tests/documentation, tests/contributing, tests/usage',
  },
  {
    id: 'single-source',
    title: 'A fact lives in one place; everything else points at it',
    source: 'AGENTS.md',
    quote: 'There is no second',
    because: 'A second copy is a second thing to update, and the copy nobody maintains is the one a reader finds first.',
    enforced: 'tests/feature-checklist (this document points instead of restating)',
  },
  {
    id: 'generate-from-corpus',
    title: 'A map or a document is generated from the real corpus',
    source: 'AGENTS.md',
    quote: 'No dangling pointers.',
    because: 'A hand-drawn map claims a shape the engines may not produce. Generating it also makes the numbers in the prose measurable, which is how several of them were corrected.',
    enforced: 'tests/routing-map, tests/report-reading, tests/usage, tests/feature-checklist',
  },
  {
    id: 'mindmap-first',
    title: 'A document is written from a mind map, not beside one',
    source: '.github/memory/history/open-work.md',
    quote: '所有文档类内容的更新，都必须先有思维导图作为行文结构的指导',
    gloss: "Every documentation update must first have a mind map to guide its structure, and only then be written.",
    because: 'A user instruction, and it earned its place: the maps changed what was written rather than restating it, and twice they exposed a number the prose had wrong.',
    enforced: 'the five generated maps under docs/',
  },
  {
    id: 'no-brittle-counts',
    title: 'No brittle counts, in shipped text or in a test name',
    source: 'AGENTS.md',
    quote: 'No brittle counts.',
    because: 'A count goes stale the day something is added, and a test name carrying one fails for a reason that has nothing to do with the behaviour it tests.',
    enforced: 'tests/skills, tests/catalog',
  },
  {
    id: 'a-case-that-cannot-fail',
    title: 'A case that cannot fail is not a case',
    source: 'CONTRIBUTING.md',
    quote: 'A case that cannot fail is not a case',
    because: 'A suite once asserted that each finding code CAN appear, which an engine reporting every code unconditionally also passes.',
    enforced: 'tests/negatives, tests/contracts',
  },
  {
    id: 'mutation-check',
    title: 'A new check is mutation-tested before it is trusted',
    source: 'tests/AGENTS.md',
    quote: 'a mutation that does not parse proves nothing',
    because: 'A test that never goes red is decoration. And a mutated file with a syntax error passes silently, because the suite cannot tell a broken engine from a quiet one.',
    enforced: 'the practice behind tests/engine, tests/design-engine, tests/skills',
  },
  {
    id: 'two-shapes',
    title: 'A method proposal and a behaviour report need different things',
    source: 'CONTRIBUTING.md',
    quote: 'file the behaviour first',
    because: 'A method proposal is easier to judge once the behaviour it would change is agreed and reproducible.',
    enforced: '.github/ISSUE_TEMPLATE, tests/contributing',
  },
  {
    id: 'evidence-oriented-errors',
    title: 'A refusal says what would have been accepted',
    source: 'AGENTS.md',
    quote: 'No dangling pointers.',
    because: 'A model holding the wrong tool is most likely to change its mind at that moment. A refusal that only reports failure wastes the one opening it gets.',
    enforced: 'tests/uml, tests/tool-boundary',
  },
  {
    id: 'disclose-nongoal',
    title: 'Every capability states its non-goal beside its scope claim',
    source: 'AGENTS.md',
    quote: 'Say what it does not prove.',
    because: 'A reader who does not know the boundary will read a clean result as covering more than it does.',
    enforced: 'tests/catalog, tests/skills',
  },
  {
    id: 'routing-by-prefix',
    title: 'A finding code carries its domain in the prefix',
    source: 'AGENTS.md',
    quote: 'Reports are contracts.',
    because: 'The prefix routes a reader before the message is read, so a code names which reference file explains it.',
    enforced: 'tests/contracts',
  },
  {
    id: 'skill-is-for-the-model',
    title: 'A skill body is for a model to do a task, not to maintain the repository',
    source: 'tests/skills/run.mjs',
    quote: 'repository-maintenance content',
    because: 'The model reads a skill to act. A generator name or a suite path in there spends context on something its reader cannot use.',
    enforced: 'tests/skills',
  },
  {
    id: 'translate-prose-not-identifiers',
    title: 'Translate the prose, never the identifiers',
    source: 'docs/README.md',
    quote: '散文用中文，标识符逐字保持英文。',
    gloss: 'Prose in Chinese; identifiers stay English, character for character.',
    because: 'A translated field name or code names nothing, so the document stops pointing at the thing it describes.',
    enforced: 'tests/translation',
  },
  {
    id: 'reader-decides-language',
    title: 'Who reads a document decides its language',
    source: 'docs/README.md',
    quote: '语言按**读者**定',
    gloss: "The language is decided by the reader.",
    because: 'The skills are English because a model reads them and the catalog truncates at 500 characters; `docs/` is Chinese because a person reads it. This was drift before it was a decision.',
    enforced: 'tests/translation, tests/documentation',
  },
  {
    id: 'usage-asymmetry',
    title: 'The surface a model routes on is the truncated one; the one it acts through is not',
    source: 'docs/usage/guide.md',
    quote: '被截断的那一面，正是模型用来路由的那一面',
    gloss: "The surface that is truncated is the one the model routes on.",
    because: 'A trigger word added to a catalog row pushes another one out of the visible 500 characters, while a tool description has no ceiling. Where a sentence goes is a mechanism question, not a style one.',
    enforced: 'tests/usage',
  },
]

// ------------------------------------------------------------------ verify before writing --

/**
 * A source's text with markdown emphasis removed.
 *
 * A quote may carry `**` because the sentence it comes from does, and the source may bold a different part
 * of it. Comparing the raw strings reported three principles as unbacked when they were backed exactly -
 * the check was wrong, not the citations.
 */
const plain = (value) => value.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()

const problems = []
for (const principle of PRINCIPLES) {
  if (!existsSync(repo + principle.source)) { problems.push(principle.id + ': ' + principle.source + ' does not exist'); continue }
  const text = plain(readFileSync(repo + principle.source, 'utf8'))
  if (!text.includes(plain(principle.quote))) problems.push(principle.id + ': the source does not contain ' + JSON.stringify(principle.quote))
  // A Chinese quote inside an English document needs its meaning beside it, or a reader hits a wall. The
  // quote stays verbatim - that is the discipline of this file - and the gloss carries the sense.
  if (/[\u4e00-\u9fff]/.test(principle.quote) && principle.gloss === undefined) {
    problems.push(principle.id + ': the quote is Chinese and carries no English gloss')
  }
  // `enforced` is a sentence, so every suite name inside it is checked rather than the whole string:
  // a principle can be held by several suites, and one of them going missing is what this catches.
  for (const suite of new Set([...String(principle.enforced ?? '').matchAll(/tests\/([a-z-]+)/g)].map((match) => match[1]))) {
    if (!existsSync(repo + 'tests/' + suite)) problems.push(principle.id + ': names the suite tests/' + suite + ', which is not there')
  }
}
const ids = PRINCIPLES.map((principle) => principle.id)
if (new Set(ids).size !== ids.length) problems.push('two principles share an id')
if (problems.length > 0) {
  console.log('NOT WRITTEN; a principle would cite text that is not there:')
  for (const problem of problems) console.log('  - ' + problem)
  process.exit(1)
}
console.log('verified: ' + String(PRINCIPLES.length) + ' principles, each quoting its source verbatim')

// ---------------------------------------------------------------------------------- write --

const lines = []
lines.push('# Principles')
lines.push('')
lines.push('What this repository believes, and where each belief is stated. Every principle here is quoted from')
lines.push('a file that already holds it - this is an index, not a second copy, and the rule itself lives at the')
lines.push('source. `docs/principles/generate.mjs` assembles it and `tests/principles` fails when a quote stops')
lines.push('matching the file it came from.')
lines.push('')
lines.push('Read it when a change feels like a judgement call. Most of these cost this repository a real defect')
lines.push('first, and the cost is recorded with the rule.')
lines.push('')
lines.push('Some sources are written in Chinese, so some quotes are: a quote is verbatim or it is not a quote.')
lines.push('Each of those carries an English gloss underneath. The gloss gives the sense rather than a literal')
lines.push('rendering, because its job is to keep a reader of this document from being stopped by a sentence')
lines.push('they cannot read.')
lines.push('')
lines.push('## Every one of them')
lines.push('')
lines.push('| Principle | Stated in | Kept honest by |')
lines.push('|---|---|---|')
for (const principle of PRINCIPLES) {
  const link = '[' + principle.source + '](../' + principle.source + ')'
  lines.push('| **' + principle.title + '** | ' + link + ' | ' + (principle.enforced ?? '-') + ' |')
}
lines.push('')
lines.push('## Each one, and why it is here')
lines.push('')
lines.push('The count is not written down on purpose: a sentence saying how many principles exist goes stale the')
lines.push('day one is added, which is the rule against brittle counts applied to this file.')
lines.push('')
for (const principle of PRINCIPLES) {
  lines.push('### ' + principle.title)
  lines.push('')
  // The quote is verbatim, in whatever language the source uses; the gloss follows it so a reader of this
  // English document is not stopped by a Chinese sentence in the middle of one.
  lines.push('> ' + principle.quote)
  if (principle.gloss !== undefined) {
    lines.push('>')
    lines.push('> ' + principle.gloss)
  }
  lines.push('>')
  lines.push('> — [`' + principle.source + '`](../' + principle.source + ')')
  lines.push('')
  lines.push(principle.because)
  lines.push('')
  if (principle.enforced !== undefined) {
    lines.push('Kept honest by `' + principle.enforced + '`.')
    lines.push('')
  }
}
lines.push('## How these are used')
lines.push('')
lines.push('The [feature checklist](feature-checklist.md) is the order to do things in. These are the reasons')
lines.push('behind it: when a checklist row and a principle disagree, the principle wins, and the checklist is')
lines.push('what should change.')
lines.push('')
lines.push('The full rules - how to work, how to write, how to test - live in [AGENTS.md](../AGENTS.md) and')
lines.push('[tests/AGENTS.md](../tests/AGENTS.md). This document points at them for the parts that are')
lines.push('principles rather than procedure.')
lines.push('')

const text = lines.join('\n')
writeFileSync(repo + 'docs/principles.md', text)
console.log('written: docs/principles.md (' + String(text.length) + ' chars)')

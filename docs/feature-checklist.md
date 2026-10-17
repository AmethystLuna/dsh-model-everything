# Adding a feature: the checklist

Everything that has to move when a capability is added, derived from this repository rather than
remembered. `docs/feature-checklist/generate.mjs` assembles it and `tests/feature-checklist` fails
when a row describes a file that is not there or a check that does not run.

The rules themselves live where they are enforced - [AGENTS.md](../AGENTS.md),
[tests/AGENTS.md](../tests/AGENTS.md), [CONTRIBUTING.md](../CONTRIBUTING.md), [RELEASE.md](../RELEASE.md).
This is the order to do them in, not a second copy of them.

The reasons behind the rows are in [principles.md](principles.md): what this repository believes,
where each belief is stated, and what it cost to learn. When a row here and a principle disagree,
the principle wins and this checklist is what should change.

## Before writing code

1. **Decide which of the two shapes it is.** A claim about a method cites a source; a claim about
   behaviour is reproducible. If both, the behaviour comes first.
2. **Find the surface it belongs on.** A trigger belongs in a tool description, which is the only
   per-turn surface with no ceiling. The catalog row truncates at 500 characters, and the longest
   row here is already 493.
3. **Say what it does not do.** Every capability in this repository states its non-goal beside its
   scope claim.

## What to touch, by what you are adding

### A skill (or a change to one)

| | |
|---|---|
| Files | `skills/<name>/SKILL.md`, `tests/skill-routing/corpus.json` |
| Kept honest by | `tests/catalog`, `tests/skills`, `tests/skill-routing`, `tests/routing-map` |

- The frontmatter `description` is the catalog row: it opens with "Use when", names the sibling that owns the adjacent case, and states what the skill does NOT do.
- It has to fit 500 characters, and the triggers have to be inside the first 497 - the rest is truncated away before the model sees it.
- Add a routing case: several utterances that must reach it, and near misses that must reach a sibling instead.
- Regenerate `docs/routing-map.md`; the row budget is why that map exists.

### A tool

| | |
|---|---|
| Files | `src/<name>-tool.ts`, `src/index.ts` |
| Kept honest by | `tests/tool-boundary`, `tests/catalog`, `tests/documentation` |

- One job per tool, and the description says when to reach for it - the tool schema is the only per-turn surface with no character ceiling.
- It names the sibling that owns the adjacent case, and states what it does not prove.
- Register it in `src/index.ts`, and add it to the fixture that checks every tool is wired.
- Add a tool-boundary case: a bad argument produces a coded refusal, not a raw throw.

### A finding code

| | |
|---|---|
| Files | `src/<engine>.ts` |
| Kept honest by | `tests/negatives`, `tests/contracts` |

- One code per case in the owning suite, and no other error beside it - assert WHICH check carries it.
- The nearest case that must NOT produce it goes in `tests/negatives`.
- If the code cannot be reached from the public API, pin the condition that shadows it instead of skipping it.
- A code that changes a verdict is violation level; a useful but non-decisive one is signal level.
- Record it in the domain reference file's code table.

### A report schema or a new field in one

| | |
|---|---|
| Files | `src/engine.ts` |
| Kept honest by | `tests/contracts`, `tests/documentation`, `tests/report-reading`, `tests/translation` |

- Add it to `REPORT_SCHEMAS` with a versioned name.
- Record the new answer in `tests/contracts` - a changed report is a changed contract.
- If the reading order changes, say so in the report-reading guide and its reference.
- Update the README pair together: `README.md` and `README.en-US.md` move in one commit.

### A UML diagram family

| | |
|---|---|
| Files | `src/uml-<family>.ts`, `src/uml-syntax.ts` |
| Kept honest by | `tests/uml`, `tests/catalog` |

- A family is an engine-table entry plus a module: render, parse, review, and the capability decision.
- Say what the notation can faithfully carry and what it approximates - the fidelity claim is part of the family.
- Round-trip it: render, parse back, and require the model to survive.
- No tool schema changes: the family table is what keeps the tool surface closed for modification.

### A generated map or measured document

| | |
|---|---|
| Files | `docs/<area>/generate-*.mjs` |
| Kept honest by | `tests/documentation` |

- Generate it from the real corpus, never hand-draw it.
- Self-check the output and refuse to write a malformed one.
- Add a drift test that regenerates and compares, or the map becomes a snapshot that quietly goes false.
- Write the prose from the map, not beside it.

### A documentation change

| | |
|---|---|
| Files | `docs/README.md` |
| Kept honest by | `tests/documentation`, `tests/translation` |

- A claim about the repository gets a check that re-measures it: counts, links, gates, citations.
- A Chinese sibling keeps every identifier verbatim; only the prose is translated.
- The README pair moves together, and every relative link resolves.
- Say where the fact lives; do not copy it into a second place.

### A decision, or a rejection of one

| | |
|---|---|
| Files | `.github/memory/MEMORY.md` |
| Kept honest by | `tests/memory` |

- Add a topic file under the right category and a row in that category's index.
- Write what a future reader needs to ACT on, not a transcript: what was decided, what it replaced, and what made the alternative fail.
- Name what the decision costs, if it costs something.

## Before committing

The chain CI runs, in order. Node 20 and Node 22 both.

```bash
node tests/engine/run.mjs
node tests/design-engine/run.mjs
node tests/catalog/run.mjs
node tests/data-engine/run.mjs
node tests/concurrency/run.mjs
node tests/uml/run.mjs
node tests/apply-smoke.mjs
node tests/memory/run.mjs
node tests/skills/run.mjs
node tests/skill-routing/run.mjs
node tests/toolset/run.mjs
node tests/principles/run.mjs
node tests/feature-checklist/run.mjs
node tests/usage/run.mjs
node tests/translation/run.mjs
node tests/documentation/run.mjs
node tests/contributing/run.mjs
node tests/routing-map/run.mjs
node tests/report-reading/run.mjs
node tests/structure/run.mjs
node tests/baseline/run.mjs
node tests/granularity/run.mjs
node tests/exporters/run.mjs
node tests/report-view/run.mjs
node tests/contracts/run.mjs
node tests/tool-boundary/run.mjs
node tests/negatives/run.mjs
node tests/external/run.mjs
```

And the gates around it:

- `npm run typecheck`
- `npm run build`, then `git diff --exit-code -- lib` - the build output is committed, so it moves in the same commit as `src/`
- `npm run lint:md`
- `npm run bump -- --check` and `npm run bump -- --audit` when the version moves

## The suites, and what each one holds

| Suite | Checked | Holds |
|---|---|---|
| `engine` | 0 | (read the file) |
| `design-engine` | 13 | design: a cycle reports the fewest edges that break it, and says the count is a minimum |
| `catalog` | 8 | catalog: every skill row fits the budget, so nothing it needs is cut off |
| `data-engine` | 15 | valid data model passes |
| `concurrency` | 4 | flags absolute concurrency claims and risk keywords |
| `uml` | 93 | render: mermaid state diagram carries directives, guards and terminal marks |
| `apply-smoke.mjs` | 0 | (read the file) |
| `memory` | 7 | the memory root, its indexes and at least one topic exist |
| `skills` | 3 | shipped text carries no catalogue counts |
| `skill-routing` | 6 | every case names a skill that ships |
| `toolset` | 12 | every tool description names at least one sibling |
| `principles` | 4 | the principles index is the one the repository produces now |
| `feature-checklist` | 4 | the checklist is the one the repository produces now |
| `usage` | 4 | the usage map is the one the plugin and the host produce now |
| `translation` | 7 | every guide with a translation has the same headings |
| `documentation` | 7 | both READMEs mention everything that must be reachable |
| `contributing` | 8 | the contribution mind map is the one the repository produces now |
| `routing-map` | 4 | the routing map is the one the catalog produces now |
| `report-reading` | 6 | the mind map is the one the engines produce now |
| `structure` | 26 | parse: declarations, aliases, labels, containers and nesting |
| `baseline` | 10 | self-baseline: the same report adds nothing and removes nothing |
| `granularity` | 9 | a proper refinement passes and reports the expansion per pair |
| `exporters` | 7 | source model still verifies (sanity) |
| `report-view` | 14 | the report object is not mutated by rendering |
| `contracts` | 3 | every frozen case still exists |
| `tool-boundary` | 0 | (read the file) |
| `negatives` | 0 | (read the file) |
| `external` | 2 | spin: never-states violated (A is initial) |

## When the change is a fix, not a feature

The same rows apply, with one addition: a fix needs a case that goes RED without it. Break the
engine on purpose in a scratch copy and require the suite to notice - and check that the mutated
file still parses, because a syntax error reads as a passing test.

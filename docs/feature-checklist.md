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
- The table entry and the module agree: a `faithful` row with no module, or a module that refuses its own family by name, is a breach of the table.
- Model and validator: unknown keys and wrong types are refused with `UML_INPUT`, and a field the notation cannot carry does not enter the model.
- Render deterministically, carry what the notation cannot say in `dsh-model-everything:` directives, and read those directives back.
- Name every construct the parser drops in `discardedConstructs`; dropping one silently is the defect.
- Open a fresh block of codes and record each one in `.github/memory/design/uml-check-coverage.md`.
- White-box cases: a byte-stable round trip, hand-written text with no directives, one case per code, and one per validator refusal.

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
node tests/uml-families/run.mjs
node tests/uml-capability/run.mjs
node tests/uml-docs/run.mjs
node tests/report-contract/run.mjs
node tests/report-views/run.mjs
node tests/next-steps/run.mjs
node tests/doc-paths/run.mjs
node tests/docs-paths/run.mjs
node tests/tool-schema/run.mjs
node tests/tool-defaults/run.mjs
node tests/diff-claims/run.mjs
node tests/suite-registry/run.mjs
node tests/intent/run.mjs
node tests/check-status/run.mjs
node tests/summary-counters/run.mjs
node tests/edit-refusals/run.mjs
node tests/export-warnings/run.mjs
node tests/diff-families/run.mjs
node tests/diff-next-steps/run.mjs
node tests/compose-inputs/run.mjs
node tests/datamodel-inputs/run.mjs
node tests/des-vs-uml/run.mjs
node tests/apply-smoke.mjs
node tests/memory/run.mjs
node tests/skills/run.mjs
node tests/gate/run.mjs
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
node tests/automaton/run.mjs
node tests/diagram/run.mjs
node tests/plantuml-corpus/run.mjs
node tests/client/run.mjs
node tests/render/run.mjs
node tests/cycle-break/run.mjs
node tests/layering/run.mjs
node tests/ordering/run.mjs
node tests/coords/run.mjs
node tests/channels/run.mjs
node tests/components/run.mjs
node tests/placement/run.mjs
node tests/jog/run.mjs
node tests/separate/run.mjs
node tests/lift/run.mjs
node tests/repair/run.mjs
node tests/ports/run.mjs
node tests/labels/run.mjs
node tests/blocks/run.mjs
node tests/skill-table/run.mjs
node tests/names/run.mjs
node tests/clearance/run.mjs
node tests/arrows/run.mjs
node tests/directives/run.mjs
node tests/declaration/run.mjs
node tests/boundary/run.mjs
node tests/edge/run.mjs
node tests/note/run.mjs
node tests/marked-edge/run.mjs
node tests/resolve/run.mjs
node tests/page-blocks/run.mjs
node tests/mermaid-node/run.mjs
node tests/mermaid-chain/run.mjs
node tests/presentation/run.mjs
node tests/routing/run.mjs
node tests/tool-routing/run.mjs
node tests/tools/run.mjs
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
| `concurrency` | 10 | flags absolute concurrency claims and risk keywords |
| `uml` | 98 | render: mermaid state diagram carries directives, guards and terminal marks |
| `uml-families` | 4 | every family with a faithful notation is detected from a minimal source |
| `uml-capability` | 5 | a cell the table calls unrepresentable refuses both actions |
| `uml-docs` | 5 | every family the skill names is a family the engine has |
| `report-contract` | 4 | every report keeps the four fields a reader acts on |
| `report-views` | 3 | the full view is the report itself, and it parses back to the same conclusion |
| `next-steps` | 3 | every step names something to do |
| `doc-paths` | 3 | a path the documentation names resolves in the report that carries it |
| `docs-paths` | 5 | the documents were read, so the checks below mean something |
| `tool-schema` | 5 | the entry registers every tool this suite knows, and no more |
| `tool-defaults` | 5 | the description states the defaults this suite checks |
| `diff-claims` | 5 | two runs over the same input add nothing |
| `suite-registry` | 5 | the registry was read, so the checks below mean something |
| `intent` | 5 | an intent an action serves is accepted |
| `check-status` | 2 | a cap that leaves a check nothing to decide reports skip, not pass |
| `summary-counters` | 4 | a verification report counts what its checks carry |
| `edit-refusals` | 4 | an ops that is not a list is refused and writes nothing |
| `export-warnings` | 3 | every invariant a format cannot translate is named in its warnings |
| `diff-families` | 5 | two reports of different families are refused, naming both |
| `diff-next-steps` | 5 | every state says something to do |
| `compose-inputs` | 6 | without the three inputs the composition passes and says nothing |
| `datamodel-inputs` | 4 | the regression checks join the roster only when beforeModel is supplied |
| `des-vs-uml` | 4 | the drawing tool reports the graph codes and none of the design codes |
| `apply-smoke.mjs` | 0 | (read the file) |
| `memory` | 8 | the memory root, its indexes and at least one topic exist |
| `skills` | 3 | shipped text carries no catalogue counts |
| `gate` | 16 | the package exposes the gate as its own entry point |
| `skill-routing` | 6 | every case names a skill that ships |
| `toolset` | 13 | every tool description names at least one sibling |
| `principles` | 4 | the principles index is the one the repository produces now |
| `feature-checklist` | 4 | the checklist is the one the repository produces now |
| `usage` | 4 | the usage map is the one the plugin and the host produce now |
| `translation` | 7 | every guide with a translation has the same headings |
| `documentation` | 7 | both READMEs mention everything that must be reachable |
| `contributing` | 8 | the contribution mind map is the one the repository produces now |
| `routing-map` | 4 | the routing map is the one the catalog produces now |
| `report-reading` | 6 | the mind map is the one the engines produce now |
| `structure` | 27 | parse: declarations, aliases, labels, containers and nesting |
| `automaton` | 27 | a well-formed automaton with a reachable accepting state passes |
| `diagram` | 106 | a flowchart becomes boxes and labelled arrows |
| `plantuml-corpus` | 64 | left to right direction lays the chain out along a row |
| `client` | 43 | the declared client export is the built bundle the loader can execute |
| `render` | 177 | every verdict earns its own role |
| `cycle-break` | 8 | Tarjan finds the cycle as one component and leaves the rest alone |
| `layering` | 19 | a chain is one row per box |
| `ordering` | 10 | two edges that end in opposite order cross, and two in the same order do not |
| `coords` | 10 | a box with one parent sits under it, and two of them straddle it evenly |
| `channels` | 12 | two long edges crossing one gap get one lane each, in the order of their dummies |
| `components` | 9 | a drawing splits into the pieces that share no edge |
| `placement` | 11 | a boundary contains its own contents and only its own |
| `jog` | 5 | a two-pixel step between two parallel legs is removed |
| `separate` | 7 | a piece is the axis it runs on, where, and how far |
| `lift` | 7 | the last leg is read, and a route too short has none |
| `repair` | 4 | a path that does not cross is not repaired |
| `ports` | 7 | two ports on a side with room keep the full separation |
| `labels` | 4 | a label with nothing in the way sits on its longest run |
| `blocks` | 6 | a block\ |
| `skill-table` | 8 | the parser lists were read, so the checks below mean something |
| `names` | 9 | a bare name is left alone |
| `clearance` | 7 | only an interior run can be moved |
| `arrows` | 8 | a plain arrow points from the left name to the right one |
| `directives` | 13 | a preprocessor directive is dropped with a reason |
| `declaration` | 10 | a plain declaration declares one element with its own name |
| `boundary` | 7 | a closing brace closes, and nothing else does |
| `edge` | 4 | an arrow between two elements is an edge with its two ends |
| `note` | 8 | a note beside a box names the box, its text and its side |
| `marked-edge` | 7 | a direction says where the far box goes, and keeps the label |
| `resolve` | 4 | an arrow name that a block owns becomes the block, and the box is not drawn twice |
| `page-blocks` | 7 | a legend block is collected and its lines are skipped |
| `mermaid-node` | 5 | each delimiter pair is one shape, and the label loses its delimiters |
| `mermaid-chain` | 7 | a chain is one connection per pair, in order |
| `presentation` | 58 | the card keeps the verdict, the counts and the first error |
| `routing` | 6 | every route says what it owns and where the adjacent case goes |
| `tool-routing` | 6 | every case names a tool the routing table covers |
| `tools` | 6 | a refused edit leaves the file byte-identical |
| `baseline` | 17 | self-baseline: the same report adds nothing and removes nothing |
| `granularity` | 9 | a proper refinement passes and reports the expansion per pair |
| `exporters` | 9 | source model still verifies (sanity) |
| `report-view` | 24 | the report object is not mutated by rendering |
| `contracts` | 4 | every frozen case still exists |
| `tool-boundary` | 77 | every tool the plugin registers on ctx.tools is exercised by this suite |
| `negatives` | 1 | metamorphic: the same async design in Chinese mines the same families |
| `external` | 2 | spin: never-states violated (A is initial) |

## When the change is a fix, not a feature

The same rows apply, with one addition: a fix needs a case that goes RED without it. Break the
engine on purpose in a scratch copy and require the suite to notice - and check that the mutated
file still parses, because a syntax error reads as a passing test.

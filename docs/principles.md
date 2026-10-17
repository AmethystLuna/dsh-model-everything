# Principles

What this repository believes, and where each belief is stated. Every principle here is quoted from
a file that already holds it - this is an index, not a second copy, and the rule itself lives at the
source. `docs/principles/generate.mjs` assembles it and `tests/principles` fails when a quote stops
matching the file it came from.

Read it when a change feels like a judgement call. Most of these cost this repository a real defect
first, and the cost is recorded with the rule.

Some sources are written in Chinese, so some quotes are: a quote is verbatim or it is not a quote.
Each of those carries an English gloss underneath. The gloss gives the sense rather than a literal
rendering, because its job is to keep a reader of this document from being stopped by a sentence
they cannot read.

## Every one of them

| Principle | Stated in | Kept honest by |
|---|---|---|
| **A malformed input becomes a coded report, never a raw throw** | [AGENTS.md](../AGENTS.md) | tests/tool-boundary |
| **Valid JSON with invalid logic is refused with its reason** | [skills/model-everything/references/dsh-model-schema.md](../skills/model-everything/references/dsh-model-schema.md) | tests/engine |
| **What mathematics can prevent, do not wait to discover by hitting it** | [.github/memory/design/robustness-audit.md](../.github/memory/design/robustness-audit.md) | tests/engine, tests/tool-boundary, tests/baseline |
| **A mathematical criterion's false positive costs more than its false negative** | [.github/memory/design/robustness-audit.md](../.github/memory/design/robustness-audit.md) | tests/engine |
| **An answer comes from the model, not from a budget that ran out** | [.github/memory/design/robustness-audit.md](../.github/memory/design/robustness-audit.md) | tests/engine (`S6_UNBOUNDED_VARIABLE`) |
| **A report never says whether a design conforms to a principle** | [AGENTS.md](../AGENTS.md) | tests/design-engine, tests/structure |
| **A skip is not a pass, and a truncated search is not a pass** | [README.en-US.md](../README.en-US.md) | tests/report-view, tests/engine |
| **A claim about the repository is measured, not asserted** | [AGENTS.md](../AGENTS.md) | tests/documentation, tests/contributing, tests/usage |
| **A fact lives in one place; everything else points at it** | [AGENTS.md](../AGENTS.md) | tests/feature-checklist (this document points instead of restating) |
| **A map or a document is generated from the real corpus** | [AGENTS.md](../AGENTS.md) | tests/routing-map, tests/report-reading, tests/usage, tests/feature-checklist |
| **A document is written from a mind map, not beside one** | [.github/memory/history/open-work.md](../.github/memory/history/open-work.md) | the five generated maps under docs/ |
| **No brittle counts, in shipped text or in a test name** | [AGENTS.md](../AGENTS.md) | tests/skills, tests/catalog |
| **A case that cannot fail is not a case** | [CONTRIBUTING.md](../CONTRIBUTING.md) | tests/negatives, tests/contracts |
| **A new check is mutation-tested before it is trusted** | [tests/AGENTS.md](../tests/AGENTS.md) | the practice behind tests/engine, tests/design-engine, tests/skills |
| **A method proposal and a behaviour report need different things** | [CONTRIBUTING.md](../CONTRIBUTING.md) | .github/ISSUE_TEMPLATE, tests/contributing |
| **A refusal says what would have been accepted** | [AGENTS.md](../AGENTS.md) | tests/uml, tests/tool-boundary |
| **Every capability states its non-goal beside its scope claim** | [AGENTS.md](../AGENTS.md) | tests/catalog, tests/skills |
| **A finding code carries its domain in the prefix** | [AGENTS.md](../AGENTS.md) | tests/contracts |
| **A skill body is for a model to do a task, not to maintain the repository** | [tests/skills/run.mjs](../tests/skills/run.mjs) | tests/skills |
| **Translate the prose, never the identifiers** | [docs/README.md](../docs/README.md) | tests/translation |
| **Who reads a document decides its language** | [docs/README.md](../docs/README.md) | tests/translation, tests/documentation |
| **The surface a model routes on is the truncated one; the one it acts through is not** | [docs/usage/guide.md](../docs/usage/guide.md) | tests/usage |

## Each one, and why it is here

The count is not written down on purpose: a sentence saying how many principles exist goes stale the
day one is added, which is the rule against brittle counts applied to this file.

### A malformed input becomes a coded report, never a raw throw

> Reports are contracts.
>
> — [`AGENTS.md`](../AGENTS.md)

A throw carries no route for the model: no code, no verdict, nothing to branch on. The closed shape is what makes every refusal answerable.

Kept honest by `tests/tool-boundary`.

### Valid JSON with invalid logic is refused with its reason

> A vacuous check is worse than a rejected one
>
> — [`skills/model-everything/references/dsh-model-schema.md`](../skills/model-everything/references/dsh-model-schema.md)

`{ all: [] }` is vacuously true, so accepting it reports a positive all-clear over nothing. A misspelled state id can never be reached, so the invariant can never fail.

Kept honest by `tests/engine`.

### What mathematics can prevent, do not wait to discover by hitting it

> 能用数学挡住的异常，就不要靠撞上才发现；而「异常处理」本身也是建模的审查结果。
>
> An anomaly that mathematics can prevent should not be discovered by running into it, and handling an anomaly is itself a review result about the model.
>
> — [`.github/memory/design/robustness-audit.md`](../.github/memory/design/robustness-audit.md)

Three layers, in the order they apply: a closed shape (malformed input becomes a coded report), algebraic degeneracy (valid JSON with invalid logic is refused with its reason), and decidability (whether the model can be decided at all is computed, not discovered by running out of budget). Handling an anomaly is itself a review result about the model, which is why `S6_UNBOUNDED_VARIABLE` is an accusation against the model and not a note about the search.

Kept honest by `tests/engine, tests/tool-boundary, tests/baseline`.

### A mathematical criterion's false positive costs more than its false negative

> 数学判据的假阳性比假阴性更伤，因为它指控一个正确的模型。
>
> A mathematical criterion false positive costs more than its false negative, because it accuses a model that is correct.
>
> — [`.github/memory/design/robustness-audit.md`](../.github/memory/design/robustness-audit.md)

The first decidability criterion reported monotone cycles on unreachable islands - defects the analysis invented rather than found. So the criterion is narrowed on purpose: only `inc`/`dec` monotonicity, `set` neither proves nor breaks, only cycles reachable from the initial state.

Kept honest by `tests/engine`.

### An answer comes from the model, not from a budget that ran out

> 是**模型的性质，不是预算的性质**
>
> It is a property of the model, not of the budget.
>
> — [`.github/memory/design/robustness-audit.md`](../.github/memory/design/robustness-audit.md)

Raising a limit is not a fix. An unbounded reachable set makes every limit undeciding, so the defect is reported as the model property it is.

Kept honest by `tests/engine (`S6_UNBOUNDED_VARIABLE`)`.

### A report never says whether a design conforms to a principle

> Say what it does not prove.
>
> — [`AGENTS.md`](../AGENTS.md)

It says the design contradicted its own declaration, or states a structural fact. A judged verdict dressed as a measurement is the thing this plugin exists not to be.

Kept honest by `tests/design-engine, tests/structure`.

### A skip is not a pass, and a truncated search is not a pass

> A truncated search is not a pass
>
> — [`README.en-US.md`](../README.en-US.md)

A cap that reads as a positive answer is a false green, and it is the failure a reader cannot detect from the outside.

Kept honest by `tests/report-view, tests/engine`.

### A claim about the repository is measured, not asserted

> Compatibility is measured, never assumed.
>
> — [`AGENTS.md`](../AGENTS.md)

Every count, gate and citation in these documents is re-measured by a test. A claim kept by hand drifts silently, and drift is only visible against the source.

Kept honest by `tests/documentation, tests/contributing, tests/usage`.

### A fact lives in one place; everything else points at it

> There is no second
>
> — [`AGENTS.md`](../AGENTS.md)

A second copy is a second thing to update, and the copy nobody maintains is the one a reader finds first.

Kept honest by `tests/feature-checklist (this document points instead of restating)`.

### A map or a document is generated from the real corpus

> No dangling pointers.
>
> — [`AGENTS.md`](../AGENTS.md)

A hand-drawn map claims a shape the engines may not produce. Generating it also makes the numbers in the prose measurable, which is how several of them were corrected.

Kept honest by `tests/routing-map, tests/report-reading, tests/usage, tests/feature-checklist`.

### A document is written from a mind map, not beside one

> 所有文档类内容的更新，都必须先有思维导图作为行文结构的指导
>
> Every documentation update must first have a mind map to guide its structure, and only then be written.
>
> — [`.github/memory/history/open-work.md`](../.github/memory/history/open-work.md)

A user instruction, and it earned its place: the maps changed what was written rather than restating it, and twice they exposed a number the prose had wrong.

Kept honest by `the five generated maps under docs/`.

### No brittle counts, in shipped text or in a test name

> No brittle counts.
>
> — [`AGENTS.md`](../AGENTS.md)

A count goes stale the day something is added, and a test name carrying one fails for a reason that has nothing to do with the behaviour it tests.

Kept honest by `tests/skills, tests/catalog`.

### A case that cannot fail is not a case

> A case that cannot fail is not a case
>
> — [`CONTRIBUTING.md`](../CONTRIBUTING.md)

A suite once asserted that each finding code CAN appear, which an engine reporting every code unconditionally also passes.

Kept honest by `tests/negatives, tests/contracts`.

### A new check is mutation-tested before it is trusted

> a mutation that does not parse proves nothing
>
> — [`tests/AGENTS.md`](../tests/AGENTS.md)

A test that never goes red is decoration. And a mutated file with a syntax error passes silently, because the suite cannot tell a broken engine from a quiet one.

Kept honest by `the practice behind tests/engine, tests/design-engine, tests/skills`.

### A method proposal and a behaviour report need different things

> file the behaviour first
>
> — [`CONTRIBUTING.md`](../CONTRIBUTING.md)

A method proposal is easier to judge once the behaviour it would change is agreed and reproducible.

Kept honest by `.github/ISSUE_TEMPLATE, tests/contributing`.

### A refusal says what would have been accepted

> No dangling pointers.
>
> — [`AGENTS.md`](../AGENTS.md)

A model holding the wrong tool is most likely to change its mind at that moment. A refusal that only reports failure wastes the one opening it gets.

Kept honest by `tests/uml, tests/tool-boundary`.

### Every capability states its non-goal beside its scope claim

> Say what it does not prove.
>
> — [`AGENTS.md`](../AGENTS.md)

A reader who does not know the boundary will read a clean result as covering more than it does.

Kept honest by `tests/catalog, tests/skills`.

### A finding code carries its domain in the prefix

> Reports are contracts.
>
> — [`AGENTS.md`](../AGENTS.md)

The prefix routes a reader before the message is read, so a code names which reference file explains it.

Kept honest by `tests/contracts`.

### A skill body is for a model to do a task, not to maintain the repository

> repository-maintenance content
>
> — [`tests/skills/run.mjs`](../tests/skills/run.mjs)

The model reads a skill to act. A generator name or a suite path in there spends context on something its reader cannot use.

Kept honest by `tests/skills`.

### Translate the prose, never the identifiers

> 散文用中文，标识符逐字保持英文。
>
> Prose in Chinese; identifiers stay English, character for character.
>
> — [`docs/README.md`](../docs/README.md)

A translated field name or code names nothing, so the document stops pointing at the thing it describes.

Kept honest by `tests/translation`.

### Who reads a document decides its language

> 语言按**读者**定
>
> The language is decided by the reader.
>
> — [`docs/README.md`](../docs/README.md)

The skills are English because a model reads them and the catalog truncates at 500 characters; `docs/` is Chinese because a person reads it. This was drift before it was a decision.

Kept honest by `tests/translation, tests/documentation`.

### The surface a model routes on is the truncated one; the one it acts through is not

> 被截断的那一面，正是模型用来路由的那一面
>
> The surface that is truncated is the one the model routes on.
>
> — [`docs/usage/guide.md`](../docs/usage/guide.md)

A trigger word added to a catalog row pushes another one out of the visible 500 characters, while a tool description has no ceiling. Where a sentence goes is a mechanism question, not a style one.

Kept honest by `tests/usage`.

## How these are used

The [feature checklist](feature-checklist.md) is the order to do things in. These are the reasons
behind it: when a checklist row and a principle disagree, the principle wins, and the checklist is
what should change.

The full rules - how to work, how to write, how to test - live in [AGENTS.md](../AGENTS.md) and
[tests/AGENTS.md](../tests/AGENTS.md). This document points at them for the parts that are
principles rather than procedure.

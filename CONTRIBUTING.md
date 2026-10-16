# Contributing

Two kinds of contribution arrive here, and they need different things from you. Decide which one you
have before writing, because the first question a maintainer asks is different in each case.

**Write in Chinese if that is the language you think in.** Every issue template has a Chinese version
beside it, and a report is judged on being reproducible rather than on its English. The rest of this
guide is English because the repository is public; the templates are not, because they are forms you
fill in.

The structure of this guide is a mind map generated from this repository:
[docs/contributing/mindmap.mmd](docs/contributing/mindmap.mmd). It names the entry points that
exist, and `docs/contributing/facts.json` carries the counts it quotes.

## Which one do you have?

**A claim about a method.** You have a source — a paper, a standard, a documented algorithm — and it
says a check should work differently. Or you found a defect in how a judgement is *computed*.

**A claim about behaviour.** A tool answered something you believe is wrong, refused something it
should accept, crashed, or took the process down.

If it is both, file the behaviour first. A method proposal is easier to judge once the behaviour it
would change is agreed and reproducible.

## An improvement with a source

### What to cite

- **The published method**, with its year and venue. Which paper or standard, and where in it.
- **The house convention it would replace.** Some checks are published methods and some are this
  repository's own conventions, and the reference files separate the two: 4 of 10 reference files
  carry a provenance section today. Most of the shipped checks are house conventions, so a proposal
  that assumes a published basis needs to say where it comes from.
- **Whether the source is being read correctly.** The two results in a source are often neighbours:
  a feedback *arc* set and a feedback *node* set are different problems, one of which is the one you
  need, and the provenance tables here record which they took — `Garey & Johnson 1979` for the arc
  set, in the design review's own notes and in the structure guide. If your proposal cites a source,
  quote the passage you read it from; the provenance section of the reference file is where it goes.

### What to say about the judgement

- **Which check changes, by its code.** Codes are declared across 14 source files, most of them in
  the data engine. A proposal that names the code is a proposal a maintainer can act on.
- **Whether it changes a verdict or adds a signal.** This is the load-bearing distinction: only the
  violation level decides a verdict. A check that is useful but not decisive belongs at signal level,
  where it is reported and fails nothing.
- **What it does not decide, in words.** Every check here states its own non-goal beside its scope
  claim, and a new one is expected to as well.

### What it must come with

- **The nearest case that must still pass.** A check that fires on everything proves nothing, so the
  near miss is not optional: take the shape that must trigger the finding, then put one condition
  right and require silence.
- **A mutation that makes the new case go red.** Break the engine on purpose in a scratch copy and
  require your test to notice. A case that cannot fail is not a case, and this repository has been
  burned by exactly that: a suite once asserted that each finding code *can* appear, which an engine
  that reports every code unconditionally also passes.
- **The far side of the tradeoff, if there is one.** A method that buys precision with runtime, or
  completeness with memory, needs that said in the proposal rather than discovered in review.

The order to do all of this in, by what you are adding, is
[docs/feature-checklist.md](docs/feature-checklist.md) - generated from this repository, so it names the
files to touch and the suites that keep each one honest. The beliefs behind it, and what each one cost,
are in [docs/principles.md](docs/principles.md).

## A problem you hit while running it

### What to send

- **The exact call, with its arguments.** The tool name and the full arguments object, as you sent
  it. If a model was involved, say which one and whether the call was repeated.
- **What you got**, quoted rather than summarised:
  - `verdict` and `verdictReason` — `verdictReason` names the first error code;
  - the finding codes, verbatim;
  - `schema`, because the reading order differs by family and a report read as the wrong family
    produces a wrong conclusion.
- **What you expected instead, and why.** The rule, the source, or the reasoning that says the answer
  should differ.

### The shapes worth reporting first

- **A verdict that reads as a pass over nothing.** A check that never ran is not a check that passed.
  This plugin's dominant defect class has been a name that resolved to nothing, which switched a
  check off and then reported a positive all-clear.
- **A refusal where a report was expected**, or a raw error with no code to route on.
- **The process dying, or a search that does not stop.**

### What makes it reproducible

- **The smallest model or diagram that shows it.** Strip it until removing anything makes the effect
  go away; that boundary is usually the report.
- **The version** you ran, and the `schema` you got back.
- **Whether it is stable or intermittent.** A report is deterministic by contract — the same input
  and the same hash spec give the same hash — so "sometimes" is itself a finding worth stating.

## What both have to pass

CI runs these on Node 20 and Node 22:

1. `npm ci --legacy-peer-deps`
2. `npm run typecheck`
3. `npm run build`
4. `npm run test:engine` — the regression chain
5. `git diff --exit-code -- lib` — the committed build must match the source

`lib/` is committed, so a change to `src/` moves `lib/` in the same commit.

### The house rules a suite follows

The full methodology is in [tests/AGENTS.md](tests/AGENTS.md). The rules that shape a finding-code
case:

- **One code per case.** The input produces that code and no other error beside it.
- **Assert which check carries the finding**, so a code cannot pass by leaking in from a sibling.
- **Every code gets a near miss** that must not produce it.
- **A code that cannot be reached from the public API is pinned, not skipped** — assert the condition
  that shadows it, so the case goes red the day that changes.
- **No brittle counts**, in shipped text or in a test name. Name the capability instead.

### The documents that must move with the change

- The reference file for the domain, when a check or a code changes.
- A memory entry under [.github/memory](.github/memory/MEMORY.md), when a decision was made — the
  root lists categories and each category has an index that needs a row.
- The bilingual pair together: `README.md` and `README.en-US.md` change in one commit.

## Running the gates locally

```bash
npm install
npm run typecheck
npm run build
npm run test:engine
npm run lint:md
```

`npm run test:full` runs the combined path. `npm run bump -- --check` and `npm run bump -- --audit`
verify that every manifest agrees on the version; releases follow [RELEASE.md](RELEASE.md).

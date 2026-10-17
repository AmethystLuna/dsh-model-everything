# AGENTS.md — the test suites

How to write a test in this repository. Read [../AGENTS.md](../AGENTS.md) first for the
project rules; this file is only about tests.

## What a test here has to prove

The plugin does not compute a value: it **decides** and hands back a report. So the risk is
not a crash, it is a wrong conclusion - a finding nobody can trigger, a finding that fires
when it should not, or a report that quietly says something different than it did last
week. A suite that only checks "the code came back" leaves all three open.

Case in point, from this repository's own history: a suite asserted that each finding code
*can* appear. An engine that reports every code unconditionally passes that suite. The gap
was found by mutating the engine (`if (field.unique === true && field.nullable === true)`
to `if (true)`) and watching the suite stay green.

## The methods, and which one a new test needs

Pick by what the claim is. Most changes need two of them.

| Method | The claim it settles | Where it lives |
|---|---|---|
| **Equivalence classes** - one positive case per code, and the nearest case that must *not* produce it | The code fires when it should, and not when it should not | `tests/<domain>/run.mjs` (positives), `tests/negatives/run.mjs` (the near misses) |
| **Decision table** - for a check whose condition is a conjunction: all true, then each clause false in turn | The code fires for the *stated* reason, not for an accident of the input | the domain suite; name the clauses in the case |
| **Metamorphic** - a transformation with a known effect on the answer | Relations hold, not just snapshots | `tests/uml/run.mjs` (render -> parse -> same model), `tests/baseline/run.mjs` (a report against itself), `tests/contracts/run.mjs` (before = after leaves the D-checks empty) |
| **Combinatorial** - the option matrix (`notation`, `intent`, `reportView`, `maxStates`, `roundTrip`) | A switch does not change the verdict | the domain suite, pairwise is enough |
| **Contract freeze** - the semantic projection of a report, stored and compared | The answer cannot change unnoticed | `tests/contracts/` |
| **Mutation** - break the engine on purpose, require a test to go red | The tests can fail at all | by hand, when a suite is new or a finding was recently fixed (see below) |

Property-based or random input is welcome as exploration, but it does not replace the
equivalence classes: random input rarely lands on the near miss, and the near miss is where
the defects are.

## Rules for a finding-code case

1. **One code per case.** The input produces that code and no other *error* code. A warning
   may co-occur when the same defect is also a completeness gap - say so in a comment.
2. **Inseparable codes name the exact set.** A required nullable primary key is one defect
   with four owners. Write the set out; never relax the assertion to "contains".
3. **Assert which check carries it**, not only that the code exists, so a code cannot pass
   by leaking in from a sibling check.
4. **A code that cannot be reached from the public API is pinned, not skipped.** Assert the
   condition that shadows it (the validator refuses first, the flag is never set), so the
   case goes red the day that changes. Record the source reason in a comment.
5. **Every code gets a negative case** in `tests/negatives/run.mjs`: take the positive shape
   and put one condition right. Absence of the code is the assertion.

## The contract snapshot

`tests/contracts/run.mjs` builds a report for each case in a fixed corpus, reduces it to what
a reader acts on (verdict, per-check status, findings, `nextSteps`, the rendered body,
model hash) and compares it with `tests/contracts/snapshot-report.json`.

When it fails, the engine's answer moved. Read the printed field diff, decide whether the
new answer is right, then record it:

```bash
UPDATE_REPORT_SNAPSHOT=1 node tests/contracts/run.mjs
```

Adding a case fails until it is recorded - deliberately, so a new case is looked at once
rather than passing on whatever it produces.

## Determinism

A suite's output must be identical across runs, and a review must not depend on the order of
inputs that carry no order meaning (an entity list, a transition list, a relation list). Where
order *is* the meaning - a timing axis - reordering is a different diagram and the review must
say so rather than stay silent. Check both before trusting a suite:

```bash
node tests/<suite>/run.mjs   # run it three times: byte-identical output
```

## The mutation check

When a suite is new, or a finding was just fixed, break the engine on purpose and require the
suite to notice. Mutate the built `lib/` file in a scratch copy - never the repository:

- replace a check's condition with `true`, and the suite must go red;
- if the suite stays green, the case is not testing what it claims;
- **a mutation that does not parse proves nothing.** Check the mutated file compiles before
  believing a "not caught" result: swallowing a brace once produced a syntax error that read
  as a passing test.
- **a SKIP also reads as a pass.** Some suites import a tool module dynamically and print `SKIP` when
  `@deepseek-ai/dsh-tools` does not resolve. A scratch copy without a `node_modules` junction hit exactly that, and two
  mutations came back "not caught" for a case that never ran.
- **so run the pristine copy first.** The order that works: copy `lib/` and the suite, run it and require a green
  result with no `SKIP`, and only then apply the mutation. A red or skipping baseline means the mutation cannot be
  judged - report that, not "missed". The same `node_modules` junction that makes a tool-loading suite work belongs in
  the copy before that first run.

## Routing, where the user meets the plugin

`tests/skill-routing/` holds the skill-selection corpus: what a user says, and which skill
should answer. Its structural half runs in `npm run test:engine` and needs no model - it
checks that every case names a shipped skill, that every skill is a trigger somewhere and a
near miss somewhere else, and that the words a case relies on survive in the **visible**
catalog budget (500 characters, the rest is truncated away at the moment the model decides).

Two details of that last check are the whole of its value, and both were wrong once:

- **A case expecting a domain skill must name a word that skill's catalog line names.** The
  entry skill is exempt because it is the route by elimination: a request that names no
  domain is answered there, so requiring its line to name the request's words would ask it to
  name everything.
- **The verbs a request is phrased with do not count as naming something.** Every catalog line
  opens "Use when reviewing / drawing / auditing ...", so a rule that counted them was
  satisfied by `"review"` alone and let a description lose the word that actually routed its
  cases. That is the mutation to try on this suite: delete a decisive word from a description
  and the check must go red. It did not, before.

The scoring half is run by hand, because the plugin never calls a model. There are two ways
to ask the question, and they measure different things:

```bash
node tests/skill-routing/run.mjs --print-prompt          # the catalog line, in one message
node tests/skill-routing/run.mjs --decisions answer.json # score {"0": "<skill>", ...}
```

- **The printed prompt** hands the model the catalog text and asks it to route. It measures
  the descriptions and nothing else: cheap, reproducible, unaffected by the system prompt.
- **A live session** is given the utterance and nothing about routing. It measures what the
  user actually experiences - the catalog, the system prompt and the model together. It
  costs a session per case, so run a sample: one request per domain skill, plus the near
  misses where a domain skill could swallow a request that belongs elsewhere.

Two things about that method were learned by running it, and the second one decides how to
read any number it produces:

- **The observation channel is a hint.** Asking for `SKILLS LOADED: <names, or none>` puts
  the word "skill" in the prompt, and asking "what would you do first, naming the tool or
  method" asks for a method statement. Both raise the chance of a load. Ask afterwards
  instead - a question asked after the answer cannot change the answer.
- **A request with nothing to work on gets refused, not routed.** Removing both hints and
  running three cases: the two "draw X" requests replied `none` and declined to invent a
  diagram, while the one request that could be acted on without the artifact (a migration
  shape review) loaded the expected skill. So a live run measures *given that the session
  engages*, which method it picks. To measure a real request, give it something it can act
  on; otherwise what you measured is the refusal.

A live session still has to be asked what it loaded, because the transcript is not the result.
Ask in a **follow-up message**, after the answer: `SKILLS LOADED: <names, or none>`.
That is a self-report, and it is the weakest part of this method - it can be answered from
what the session remembers doing, not from what it did. Read it with that in mind, and prefer
the printed prompt where a description-level answer is enough.

A live result is scored by one rule: **the expected skill is among the skills the session
loaded, when the session engaged.** Two consequences, both learned by running it:

- Every domain line ends "Doctrine: the model-everything skill", so a session that loads a
  domain skill commonly loads the doctrine skill too. That second load is the design working,
  not a misroute - score the case on the expected skill being present, not on it being alone.
- **A refusal is not a miss.** `none` from a session that had nothing to work on means the
  case was never measured: it declined to invent, which is the correct answer and says
  nothing about routing. `none` from a session that did engage is a miss - the entry skill
  included, since a session that used no skill was not routed anywhere.

A misroute is a corpus or a description defect, not a model defect: fix whichever of the two
the answer exposes, then re-run.

## House rules the suites follow

- One directory per suite, `run.mjs`, zero dependencies, `console.log('PASS', name)` on
  success and a non-zero exit at the end. `tests/full-suite.mjs` runs the combined path.
- Fixtures are inline model objects. A separate fixtures directory is for data that several
  suites share.
- No brittle counts in a test name or a message - the same rule the shipped text follows.
- A suite that writes anything to disk writes inside its own directory (the contract
  snapshot is the only case today) or to a temporary path it removes.
- Read the suites as the specification of the report contract: if a field matters to a
  caller, some suite here should fail when it changes.

# How to read a report

Every tool returns a report. They share one skeleton, and they differ in where they keep their
findings. This guide is the reading order: what to look at first, what each field answers, and what
a report does not tell you.

The structure of this guide is the mind map beside it, which is generated from live reports rather
than drawn. A hand-drawn map drifts; this one cannot claim a shape the engines do not produce.

## The three questions, in order

### 1. Did it run?

Read `ran` before `verdict`. A refusal is not a review: when a tool refuses its input there is no
verdict to route on, and the fields below `ran` describe the refusal rather than a model.

A refusal carries `errorCode` — an argument that arrived in the wrong shape, a format that does not
exist, a notation that is not one. A review that ran and failed carries findings. The two need
different responses, so tell them apart before reading anything else.

### 2. What did it decide?

`verdict` is the answer, and it has three values:

| `verdict` | Means |
|---|---|
| `pass` | The checks ran and found nothing to report |
| `pass_with_findings` | Warnings only; nothing decided against the model |
| `fail` | At least one error finding |

Read `verdict`, never `ok`. `ok` carries a different historical meaning in each family — in most it
is `true` for a failing review, and a composition sets it to `false` when any error-severity finding
exists — so it cannot be read as a verdict, and reading it as one is how a reader concludes the
opposite of what the report says. A report with `verdict: "fail"` is a successful run that found
something; that is the normal way this plugin tells you about a defect.

`verdictReason` is the one-line why, and it names the first error code. When the verdict is not what
you expected, that string is where to start.

### 3. What should I do?

`nextSteps` is never empty, and it is derived from the findings rather than written beside them. It
names the route to whatever covers the ground the report does not: another check, a source-side
scan, or an external checker.

## The skeleton every report shares

`ok`, `ran`, `verdict`, `verdictReason`, `schema`, `summary`, `nextSteps` — every family carries all
of them. `schema` is the versioned contract, so a reader can tell which shape it is holding.

`hashes` and `modelHash` are there so two reports can be compared. The same input and the same hash
spec give the same hash; a changed hash means the model changed, which is what makes a diff
meaningful.

## Where the findings are

This is the part that varies, and it is worth knowing before you go looking:

| Where | Families |
|---|---|
| Inside each check, as `checks[].findings` | `model_verify`, `model_compose_verify`, `model_datamodel_verify`, `model_design_review` |
| At the top level, as `findings` | `uml_structure_verify`, the `uml` review path, `model_concurrency_scan` |
| Nowhere — compare `added` / `changed` / `removed` | `report_diff` |

A check-carried finding is attributed to a check, and the check also carries a status of its own:
`pass`, `fail`, or `skip`. A top-level finding has no check to attribute it to, which is why those
families report a `summary` instead.

The status is coarse on purpose: `fail` means the check has a finding, not that the finding is severe.
A check holding only warnings is `fail` just as a check holding errors is, so `status` alone cannot tell
you whether the verdict moved - the finding's own severity does that. The rendered body separates them,
because a human reads it: `fail` there means at least one error, and `warn` means warnings only. When
the body lists a check under `warn` and the JSON gives that same check `"status": "fail"`, both are
correct and they answer different questions.

`summary.checksRun` counts the checks that examined the model, so it is smaller than the number of check
objects whenever something was skipped. `summary.checksSkipped` names those, and it is absent when
nothing was skipped.

`report_diff` is the exception in a second way: it has no findings because its subject is the
difference between two other reports. `verdict` describes the delta, and `currentVerdict` describes
the current run on its own terms. The two differ exactly when the run is not clean but the delta is
empty — comparing a failing report against itself gives `verdict: "pass", currentVerdict: "fail"`,
and both are true: nothing changed, and the run fails.

## Read the severity before the code

Within a finding, the severity decides whether it changed the verdict:

- **error** — this is what makes the verdict `fail`;
- **warning** — reported, does not fail the delta;
- **info** — context, for example that one element makes an inseparable group of findings;
- **undecided** — the search stopped before deciding. Not a pass. `summary.truncated` says the same
  thing for the report as a whole.

The finding codes are prefixed by the check that owns them (`S1`, `A4`, `DS5`, `DA2`, `DES12`,
`UML023`), so a code tells you where to look even before you read its message.

### A code is for you, not for the person you are answering

The codes exist so you can route a finding to the reference that explains it, and so a run is comparable
with the last one. A user who never read the report has no idea what `A4_NO_RELEASE_EVENT` means, and a
reply that recites codes makes the work look opaque while telling them nothing they can act on.

**Say what the finding says, in words.** Each finding's own `message` is already a sentence written for a
reader who does not know the codes. Use it. Name the code afterwards only when it helps the user find the
same line in the report, and give it a meaning at the same time: not "S7 failed", but "the invariant is
violated - the model reaches C after two events (`S7_INVARIANT_VIOLATION`)".

The same rule covers a check id: `Event Completeness` is the name, `S5` is the label. Lead with the name.

One code is worth relaying with its reason rather than its name. A model whose reachable state space is
infinite is reported as `S6_UNBOUNDED_VARIABLE`, an error, and the point to pass on is that **no** search
bound would have decided it: the question is undecidable for that model, not merely unanswered.

One family of findings deserves its own note: a model whose reachable state space is infinite is
reported as `S6_UNBOUNDED_VARIABLE`, an error. It is not a defect of the search — it is a property
of the model, and it means no search bound would have decided the question.

## What each family adds

Beyond the skeleton, each family carries what its own domain needs: a graph, a round-trip record,
a notation, a rendered source, the three delta lists, or a design review's split of `violations`,
`signals` and `facts`. Read `schema` to know which one you have, then read the section that belongs
to it.

The design review's three lists are worth knowing, because only the first decides anything:

- `violations` — the check levels that decide the verdict. Ten codes carry it, from a dependency
  cycle to a type relation that resolves to nothing;
- `signals` — four codes that are worth a look and fail nothing;
- `facts` — no findings at all: one measurement object with the graph's numbers (`density`, `ranks`,
  `articulationPoints`, `feedbackArcs`, `largestCycle`). It also carries `checksSkipped`, which is
  where a reader learns that nine of the checks never ran for want of a declaration.

No code appears in both `violations` and `signals`: the split is exclusive, so a reader who reads
only `violations` sees every finding that decided the verdict and none that did not.

## What a report does not tell you

- **It is about the model, not the code.** A clean verdict is evidence about the drawing you
  supplied. Reconciling it with the source is a separate step, and the difference between the two is
  where the finding usually is.
- **A truncated search decided nothing.** When `truncated` is true, the checks that stopped early
  report themselves as undecided rather than as passes.
- **A skipped check examined nothing.** `skip` and `pass` are different answers: a check that had no
  vocabulary to work with did not look, and saying so is the point.

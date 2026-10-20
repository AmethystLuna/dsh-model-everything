---
name: model-everything-report-reading
description: "Use when reading a report this plugin returned: what does the verdict mean, why did it come out this way, which field do I act on, and what does the report not prove. It gives the reading order — did it run, what did it decide, what next — where each family keeps its findings, and the two readings that are easy to get backwards. It reads reports; it does not produce or check models. Producing one is model-everything."
---

# Model Everything — Reading a Report

Every tool in this plugin returns a report, and a report is a claim about a model. This skill is the
reading order: which field answers which question, where the findings are in each family, and what
the report does not prove.

Load the `model-everything` skill to *produce* a model or to check a claim. Load this one when a
report is already in hand and the question is what it says.

**The tools are the interface.** Call them instead of reading this plugin's implementation. Open a `references/` file only when the question names what that file covers, and never read `lib/` — a schema guessed from the source is how a report gets misread.

## The Reading Order

Three questions, in this order. Each one can make the next unnecessary.

### Did it run?

`ran` separates a tool that refused from one that ran, but it answers that question for one kind of
refusal only. A call refused at the boundary — an argument in the wrong shape, a format that does not
exist, a notation that is not one — comes back with `ran: false`, an `errorCode`, and a
`verdictReason` beginning "the tool did not run". Fix the call; there is no verdict to route on.

An input the engine's own schema rejects is a different shape and looks like a review: `ran: true`,
`ok: false`, `verdict: fail`, no `errorCode`, one finding under a check whose id is `MODEL`,
`DATA_MODEL` or `DESIGN`, and `summary.checksRun: 0`. Read it as "the input is the problem, not the
design". A model that was actually reviewed examined something, so a non-zero `checksRun` is what
separates a defective model from a malformed one.

A refusal and a failing review need different responses, and `ran` alone does not tell them apart:
the test is `ran: false`, or `checksRun: 0` beside a check named after the validation.

### What did it decide?

`verdict` is the answer:

| `verdict` | Means |
|---|---|
| `pass` | The checks ran and found nothing to report |
| `pass_with_findings` | Warnings only; nothing decided against the model |
| `fail` | At least one error finding |

Read `verdict`, never `ok`. `ok` carries a different historical meaning in each family — in most it
is `true` for a failing review, and a composition sets it to `false` when any error-severity finding
exists — so it cannot be read as a verdict, and reading it as one is how a reader concludes the
opposite of what the report says. A `verdict: "fail"` is a successful run that found something;
that is the normal way this plugin tells you about a defect.

`verdictReason` is the one-line why and names the first error code. When the verdict is not what you
expected, start there.

### What should I do?

`nextSteps` is never empty and is derived from the findings rather than written beside them. It
names the route to whatever covers the ground the report does not: another check, a
source-side scan, or an external checker.

## Where the Findings Are

This is the part that varies, and it is worth knowing before you go looking:

| Where | Families |
|---|---|
| Inside each check, as `checks[].findings` | `model_verify`, `model_compose_verify`, `model_datamodel_verify`, `model_design_review` |
| At the top level, as `findings` | `uml_structure_verify`, the `uml` review path, `model_interleaving_scan` |
| Nowhere — compare `added` / `changed` / `removed` | `report_diff` |

A check-carried finding is attributed to a check, and the check carries a status of its own: `pass`,
`fail`, or `skip`. A top-level finding has no check to attribute it to, which is why those families
report a `summary` instead.

`report_diff` has no findings because its subject is the difference between two other reports.
`verdict` describes the delta and `currentVerdict` describes the current run on its own terms. They
differ exactly when the run is not clean but the delta is empty: comparing a failing report against
itself gives `verdict: "pass", currentVerdict: "fail"`, and both are true — nothing changed, and the
run fails.

## Severity Before Code

Within a finding, the severity decides whether it changed the verdict:

- **error** — what makes the verdict `fail`;
- **warning** — reported, does not fail the delta;
- **info** — context, for example that one element makes an inseparable group of findings;
- **undecided** — the search stopped before deciding. Not a pass. `summary.truncated` says the same
  for the report as a whole.

The code prefix names the check that owns the finding (`S1`, `A4`, `DS5`, `DA2`, `DES12`, `UML023`),
so a code tells you where to look before you read its message.

### A code is for you, not for the person you are answering

The codes exist so you can route the finding to the right reference and re-check it. A user who never
read the report has no idea what `A4_NO_RELEASE_EVENT` means, and a reply that recites codes makes the
work look opaque while telling them nothing they can act on.

**Say what the finding says, in words.** The finding's own `message` is already a sentence written for a
reader who does not know the codes - use it. Name the code afterwards only if it helps the user find the
same line in the report, and then give it a meaning: not "S7 failed" but "the invariant is violated - the
model reaches C after two events (`S7_INVARIANT_VIOLATION`)".

The same goes for a check id: `Event Completeness` is the name, `S5` is the label. Lead with the name.

A model whose reachable state space is infinite is reported as `S6_UNBOUNDED_VARIABLE`, an error. It
is a property of the model, not a defect of the search: no search bound would have decided the
question. When you relay this one, relay the reason: *any* search bound would leave it undecided.

## What a Report Does Not Tell You

- **It is about the model, not the code.** A clean verdict is evidence about the drawing you
  supplied. Reconciling it with the source is a separate step, and the difference between the two is
  where the finding usually is.
- **A truncated search decided nothing.** When `truncated` is true, the checks that stopped early
  report themselves as undecided rather than as passes.
- **A skipped check examined nothing.** `skip` and `pass` are different answers: a check with no
  vocabulary to work with did not look, and saying so is the point.

## The Design Review's Three Lists

One family splits its findings, and only the first list decides anything:

- `violations` — the check level that decides the verdict;
- `signals` — worth a look, fails nothing;
- `facts` — no findings at all: one measurement object with the graph's numbers (`density`, `ranks`,
  `articulationPoints`, `feedbackArcs`, `largestCycle`) and `checksSkipped`, which is where a reader
  learns which checks never ran for want of a declaration.

No code appears in both lists, so a reader who reads only `violations` sees every finding that
decided the verdict and none that did not.

## Reference

[references/reading-a-report.md](references/reading-a-report.md) is the same method with the
worked detail: the shared skeleton field by field, what each family adds, and where the map that
structures it lives.

# Results: what each round measured

Numbers only, with the round they came from. The reasoning is in
[`.github/memory/design/context-cost.md`](../.github/memory/design/context-cost.md) and
[`applicability.md`](../.github/memory/design/applicability.md); this file is the data those two cite.

Every round is **3 trials per case per condition**, on the same model and the same harness.
`A` is the bare agent, `C` is the plugin installed with the gate injection on. Token counts are the
harness's own accounting for a session, so they include the cached prefix.

## Round 1 - three small fixtures (2026-10-20)

| case | A tokens (median) | C tokens (median) | ratio | judge A / C |
|---|---|---|---|---|
| legacy-migrations | 11,829 | 37,713 | 3.2x | 3/3 · 2/3 |
| legacy-order-pipeline | 17,769 | 41,929 | 2.4x | 3/3 · 2/3 |
| legacy-scheduler-machine | 14,521 | 41,441 | 2.9x | 3/3 · 3/3 |

The three-case median: A 17,114, C 40,115. Two of the nine plugin trials ended with
`MALFORMED_RESPONSE` - a streamed tool argument whose JSON was invalid - not with a wrong answer.

## Round 2 - two strata, four cases (2026-10-21)

A stratum is a claim that reading settles. B stratum is a seeded defect with green tests and a false
documentation claim.

| case | stratum | A tokens | C tokens | ratio | found A / C |
|---|---|---|---|---|---|
| legacy-order-pipeline | A | 15,519 | 74,636 | 4.8x | n/a |
| legacy-scheduler-machine | A | 23,784 | 36,713 | 1.5x | n/a |
| job-runner | B | 10,170 | 46,360 | 4.6x | 3/3 · 3/3 |
| order-lifecycle | B | 6,766 | 41,798 | 6.2x | 3/3 · 3/3 |

Totals: A 168,716, C 598,523 over twelve sessions each, **3.55x**.

## Round 3 - two defects that only a composition shows (2026-10-21)

| case | A tokens | C tokens | ratio | judge A / C |
|---|---|---|---|---|
| job-runner-split | 23,459 | 69,710 | 3.0x | 3/3 · 3/3 |
| inventory | 6,128 | 39,950 | 6.5x | 3/3 · 3/3 |

Both conditions found both defects in every trial. The baseline's `inventory` answer named the two
lock keys, the interleaving and the wrong final number in 6,128 tokens.

## Round 4 - a tree too large to read (2026-10-21)

The plugin's own `src/`: 34 files, 18,207 lines, 86 relative import edges, 0 cycles,
`report-view.ts` depended on by 10 modules, no layering violation.

| condition | passed | steps | tokens |
|---|---|---|---|
| A | 0/3 | 17 / 22 / 57 | 63,936 / 50,961 / 97,007 |
| C | 2/3 | 25 / 28 / 24 | 86,022 / 75,849 / 79,709 |

The baseline's third trial answered all three questions correctly in 57 steps and hit the 40-step
ceiling; the first two got the hub count wrong. Ratio **1.14x**, against 3.55x on the small fixtures.

## Round 5 - can the model be taught to edit a file instead of re-sending it (2026-10-21)

| case | condition | trials using `model_edit` | best passing run |
|---|---|---|---|
| repair-machine (4 states) | C | 2/3 | 6 steps, 27,612 tokens |
| repair-scheduler (26 states) | C | 3/3 | 5 steps, 19,725 tokens |

`modelPath` on its own was used 0 times in 9 trials; `model_edit`, which closes the loop with a
report, was used 5 times in 6.

## Round 6 - the same structural question, with the scanner in place (2026-10-22)

Same case, same three questions, three trials, step ceiling raised to 80 so the ceiling cannot be the
result. `repoPath` was available to the plugin condition for the first time.

| condition | passed | steps | tokens |
|---|---|---|---|
| A | 1/3 | 28 / 17 / 26 | 97,059 / 70,153 / 74,894 |
| C | 1/3 | 24 / 25 / 31 | 62,599 / 86,578 / 82,326 |

Mean tokens: A 80,702, C 77,168 - **0.96x**, against 1.14x in round 4 and 3.55x on the small fixtures.
The plugin used `uml_structure_verify` with `repoPath` in all three trials (3, 7 and 10 calls).

Both conditions failed the same way: the question "which module has the most dependents, and how
many" is not answered by the report, which lists cycles, isolated nodes and matrix violations but no
degree summary. Every trial that failed got the hub count wrong, whichever condition it ran in.

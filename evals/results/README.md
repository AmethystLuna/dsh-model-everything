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

## Round 7 - the structural question with the truth corrected (2026-10-22)

Round 6's rubric named `report-view.ts` as the hub. It is not: the report's own GRAPH line puts
`engine.ts` first with 18 dependents. The rubric was the failure, and it marked correct answers wrong.
With the truth corrected, and the degree summary shipping, the same case:

| condition | passed | steps | tokens |
|---|---|---|---|
| A | 3/3 | 28 / 25 / 28 | 76,402 / 58,705 / 72,410 |
| C | 3/3 | 32 / 31 / 30 | 95,823 / 56,225 / 83,299 |

Mean: A 69,172, C 78,449 - **1.13x**, three steps more each.

The substance: at 34 files the baseline answers correctly without help. The plugin condition called
`uml_structure_verify` six to nine times per run, and also globbed (5-19 calls) and read (2-46 files)
to cross-check it. So the tool is reached and trusted only partly, and the extra checks are what the
13% buys.

## Round 8 - the report states its own boundary (2026-10-22)

Same case, plugin condition only (A is unchanged from round 7). The report now carries a SCAN line -
files read, unresolved references, languages - and a sentence saying a recount by hand cannot find more.

| condition | passed | steps | tokens |
|---|---|---|---|
| A (round 7) | 3/3 | 28 / 25 / 28 | 76,402 / 58,705 / 72,410 |
| C | 3/3 | 32 / 38 / 21 | 86,474 / 69,673 / 52,721 |

Mean: A 69,172, C 69,623 - **1.01x**, against 1.13x in round 7.

The model still cross-checks (7-12 globs, 2-37 reads, 3-8 structure calls per trial), so the parity is
not "it stopped checking". The spread inside the condition is wide - 52k to 86k - which is the honest
limit of three trials on a single case.

## Round 9 - a real repository of 226 files (2026-10-22)

`redis/redis` at `src/`: 226 C files, 215,164 lines, 12 MB. Truth from an independent Python parse of
`#include "..."`, cross-checked against the plugin's scan: 226 files, 552-562 edges, one cycle
(`server.h` <-> `rdb.h`), `server.h` depended on by 82 files.

| condition | passed | steps | tokens |
|---|---|---|---|
| A | 3/3 | 30 / 31 / 21 | 99,910 / 72,613 / 67,776 |
| C | 3/3 | 27 / 22 / 35 | 89,243 / 75,000 / 90,815 |

Mean: A 80,100, C 85,019 - **1.06x**. Both answered all three questions.

At 215k lines the baseline is still cheap, because it never reads the tree: it greps for one include
and counts. A graph question is a computation the model can script, so size does not make the plugin
worth it. What the plugin would need is a question grep cannot answer.

## Round 10 - the first semantic case, and why it does not count (2026-10-22)

The case: libuv at the parent of `067c56e3` (`async: restore release/acquire on the busy counter`,
issue #5297). The claim asked about is a real race: the busy counter was relaxed, so the sender's write
to the wakeup fd had no happens-before edge with `uv__async_stop()` closing it.

Three runs, and none of them is a measurement:

1. **First run**: both conditions passed 3/3 (A 74,654, C 87,787, 1.18x) - but both had fetched
   `raw.githubusercontent.com/libuv/libuv/v1.x/src/uv-common.c`, which is the *fixed* file. The answer
   was online.
2. **Second run**: `tools_not_called: [web_fetch, web_search]` added. Every attempt in both
   conditions still called a web tool, so every attempt failed the assertion.
3. **Third run**: the two web rows disabled in both eval homes (`--dump-config` shows
   `disabled: true`). Attempts still issued web calls; the assertion still failed them.

What that establishes: a case built from a public fix leaks through the network, an assertion is
post-hoc and cannot prevent the call, and disabling the rows is not the same as taking the network
away.

**The fix that worked: forbid it in the prompt.** The case now says "do not use any network tool - no
web_search, no web_fetch, no curl", and the post-hoc assertion is gone. Re-run with that wording: zero
web calls in either condition, which is what makes the numbers below a measurement.

## Round 11 - the semantic case, valid this time (2026-10-22)

libuv at the parent of `067c56e3`, the busy-counter race. Prompt-level network ban, verified from the
transcripts: **0 web calls in either condition**.

| condition | passed | steps | tokens |
|---|---|---|---|
| A | 3/3 | 10 / 7 / 13 | 102,615 / 48,831 / 53,831 |
| C | 3/3 | 16 / 23 / 16 | 109,197 / 99,433 / 80,653 |

Mean: A 68,426, C 96,428 - **1.41x**, eight steps more.

Both found the relaxed counter and the missing happens-before, so the claim did not discriminate. The
plugin condition ran longer: it loaded the skill twice, ran `model_interleaving_scan`, and still read
the same two files the baseline read.

## Round 12 - a protocol state machine, and the first round the plugin wins (2026-10-22)

lwIP `src/` (200 files, `tcp.c` at 2,696 lines, 11 PCB states, retransmit counters, two timers). Two
claims, both false: that `SYN_SENT` retries forever because `nrtx` resets, and that a PCB can sit with
unacked data and no timer to fire. Prompt-level network ban; transcripts show **0 web calls**.

| condition | passed | steps | tokens |
|---|---|---|---|
| A | 2/3 (one **timed out at 420s**) | 34 / 34 / 69 | 141,042 / 143,746 / 154,432 |
| C | 3/3 | 40 / 25 / 33 | 144,567 / 144,485 / 126,878 |

Mean tokens: A 146,407, C 138,643 - **0.95x**, and C passed one trial more.

What the two conditions did with that budget: the baseline grepped 18-40 times and read 25-49 files per
trial, and one trial ran past the seven-minute harness timeout. The plugin condition called
`model_verify` three or four times in every trial - it built the machine and decided on it.

This is the first round where the plugin costs less and passes more. It is also the first task whose
answer is a decision over paths rather than a text lookup, which is what the earlier rounds kept
failing to buy. One timeout in three trials is the whole margin, so treat it as a signal, not a result.

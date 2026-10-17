---
name: model-everything-interleaving
description: "Use when a design or plan claims concurrency, synchrony or async safety, or names concurrent writers, mutexes, interrupts, async tasks, promises or an event loop. It mines the claims (thread-safe, lock-free, no data race, ISR-safe, non-blocking) and routes each to dedicated verification (TSan, Helgrind, CBMC, TLA+, UPPAAL); it does not prove safety. Doctrine: the model-everything skill."
---

# Model Everything — Concurrency Claims

This skill does **not** prove concurrency safety, and no report from it should ever be read as a proof. It mines a document, plan or code review for claims about **how work is executed** - threads, synchronization primitives, async tasks, interrupts, shared state - marks each one `UNVERIFIED`, and routes it to the tool that can actually decide it.

The claim-verification doctrine it inherits — enumerate verifiable claims, cite `file:line`, read `verdict` and never `ok` — lives in the `model-everything` skill. Load that one when the task is behavioural verification of a state machine rather than a judgement about concurrency claims.

## When This Skill Applies

**Only after confirming the target actually has concurrency requirements or behaviour** — multiple threads, async tasks, interrupts, shared state, or parallel execution. If the target is purely sequential, do not invoke concurrency mining; there is nothing to mine.

Async counts as concurrency here, and it is the case most often missed: a single-threaded event loop still runs interleaved work, and every failure mode below applies to it.

| The claim | How it is treated |
|---|---|
| Absolute: "thread-safe", "lock-free", "no data race", "interrupt-safe", "ISR-safe" | error / `UNVERIFIED` unless dedicated evidence is provided |
| Risk keyword: "race condition", "shared variable", "mutex", "atomic", "shared memory", "critical section", `ISR`, `IRQ`, `NMI`, `disable_irq` / `enable_irq` | warning — review whether the plan actually addresses it |
| Async: "non-blocking", "never blocks", "no blocking" | error / `UNVERIFIED` — the event loop is a shared resource and the claim is absolute |
| Async keyword: "async", "await", "promise", "event loop", "callback", "microtask", "coroutine", "fire-and-forget", "backpressure" | warning — review the interleaving, not the vocabulary |
| Lock/unlock, alloc/free, start/stop pairing where ordering matters | routed to `model_verify` (A4 pair symmetry), which can decide balance inside the modelled machine |

In DSH, run the `model_interleaving_scan` tool. For manual review, follow [`references/concurrency-risk-guide.md`](references/concurrency-risk-guide.md).

## Routing: What Decides Each Claim

Mining a claim is not verifying it. Hand each one to a tool that can:

| Dimension | Tool that decides it |
|---|---|
| Data races, lock-ordering, lock-free algorithms | ThreadSanitizer, Helgrind, or a model checker over the real code (CBMC) |
| Interrupt/ISR races, critical sections | RTOS-aware interrupt analysis, or a TLA+ model of the ISR/task interleaving |
| Protocol-level interleaving of discrete events | `model_verify` (S1-S8 / A1-A14) and `model_compose_verify` (C1/C2) |
| Async task interleaving, lost wakeups, a handshake that never fires | TLA+ (export from `model_export`), or `model_compose_verify` for the two-task case |
| A shared location two tasks both update (lost update, unordered write) | `model_compose_verify` with `shared` + `accesses`: C5 reports a read-modify-write pair the model does not make atomic, C4 an unordered write, C3 a declaration that names nothing. Two accesses naming one lock are excluded, and the report counts them |
| Timeouts, deadlines, a callback that may never arrive | `model_verify` with `maxTicks` + `tickEvents`, or `model_export` -> UPPAAL for clocks |
| A blocking call inside an async handler, a missing `await`, a promise nobody awaits | **Not decidable here.** A runtime or static check (blocked-event-loop detection, a lint/review of the call path) - name the check, never claim the design is clean |
| Hard real time: deadlines, periods, preemption | Scheduling analysis (RMA/EDF) and a timing tool — not this toolbox |
| Probability or reliability claims | PRISM/Storm, fault-tree analysis |

The full routing table, including hard-real-time, hybrid-control and execution-cost dimensions, is [`../model-everything/references/gap-routing-guide.md`](../model-everything/references/gap-routing-guide.md). `model_verify` reports carry the same routing as informational `coverageNotes` on matching models.

## What an Async Review Cannot See

Async defects live in what a model cannot express, so the report must say so rather than imply coverage:

1. **A blocking call inside an async handler.** The model has no clock and no runtime; it cannot tell a synchronous read from an awaited one. The claim "the handler is non-blocking" needs a runtime check (event-loop lag, a blocked-loop detector), not a scan.
2. **A missing `await`.** This is an absent transition, and a model built from the plan will faithfully omit it. Static review of the call path is what catches it; the scan only tells you where to look.
3. **A lock held across an `await`.** The scanner sees `mutex` and `await` on the same page and cannot see that they overlap. If the location does matter, declare it in `shared` and both sides in `accesses`: `model_compose_verify` reports the pair as C5 when the model does not make it atomic, and counts the pairs a named lock excluded. Whether the lock is really held across the whole operation is still a single-machine question for `model_verify`.

Each of these is a place where "no finding" and "no problem" differ. Say which one you checked, and with what.

## Rules for This Mode

1. **Mining, not proof.** Report a concurrency claim as `UNVERIFIED` with the routing target; never as passing.
2. **No absolute language in the answer.** "This is thread-safe" is exactly the claim being mined, not a result this skill can produce.
3. **One counterexample is enough to refute.** If a race is suspected, the deliverable is the interleaving that breaks it plus the harness that demonstrates it (TSan/Helgrind output), not an argument.
4. **Sequential targets are out of scope.** If nothing runs concurrently, say so and stop. A single-threaded async service is not sequential: interleaving exists at every `await`.
5. **The scanner is `model_interleaving_scan`.** If it is not registered in this deployment, mine the text by hand against the keyword table above and route each claim the same way.
6. **Name the claim and its routing in words.** 「QoS 1 只投递一次」plus the tool that decides it, never a bare check name. A reader who has not memorized this skill's tables learns nothing from an enumeration. The full rule is under "Writing the Answer" in the `model_verify` skill.

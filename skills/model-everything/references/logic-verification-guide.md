# Logic Verification Guide

Deep reference for Phase 2a/2b of this plugin. Load this when the skill triggers escalation to logic-primitive verification. Covers model extraction methodology, probe design patterns, counter-example interpretation, and known limitations.

## Model Extraction Methodology

### Step 1: Identify the State Machine Boundary

Before extracting states, determine what IS and IS NOT part of the machine:

- **In**: states the plan explicitly names, events the plan describes, guards the plan states
- **Out**: hardware-level behavior (register writes, DMA transfers), OS-level scheduling (task switches, priority inversion), external system interactions not described in the plan

If the plan doesn't clearly define the boundary, flag it: "Plan does not define state machine scope — model may be incomplete."

### Step 2: Extract States

Scan the plan for:

- Enumerated state types (`typedef enum { ... } xxx_state_t`)
- Named phases in prose ("the system then enters the RECOVERING phase")
- Implicit states (error paths described but not named — give them explicit names in the model)

**Rule**: If a behavioral section describes a distinct set of actions before a transition, it's a state — even if the plan doesn't label it as one.

### Step 3: Extract Transitions

For each state, list:

- **Explicit transitions**: `state = NEXT_STATE` assignments, `→` arrows in diagrams, prose like "then transitions to X"
- **Guard conditions**: `if/else` branches that split a single event into multiple next states
- **Timer-driven transitions**: timeouts, retry delays, cooldown periods

**Edge case**: A transition mentioned in prose but missing from the state diagram. Flag it — "Plan describes transition X but state diagram omits it."

### Step 4: Identify Invariants

Extract every claim that uses absolute language:

| Pattern | Example | Invariant to Check |
|---------|---------|-------------------|
| "always ..." | "always returns to IDLE" | From every state reachable in ≤K steps, IDLE is reachable |
| "never ..." | "never enters ACTIVE without power_ready" | ACTIVE is not reachable from any path that hasn't passed through power_ready |
| "guaranteed ..." | "guaranteed cleanup within 500ms" | Every ERROR→RECOVERING path includes a cooldown transition |
| "cannot ..." | "cannot deadlock" | No absorbing cycle exists |
| "all paths ..." | "all paths lead to ERROR on failure" | Every failure event reaches ERROR (not FATAL, not stuck) |

### Step 4.5: Write the Natural Language and Pick a Rendering Form

Do NOT keep the natural-language explanations in a separate block — integrate them
into the model presentation so every entry reads like a sentence in the real
scenario. Write meanings for every state, every event, and every distinct
(state, event) combination (carry them in the model's `narrative` block:
`narrative.states`, `narrative.events`, `narrative.scenarios`; the report
echoes them back). Then render one of three forms:

**Form A — integrated transition table (default)**: `STATE（含义）` /
`event（含义）` / `NEXT（含义）` columns plus a final scenario column, so each
row is one self-contained sentence. Width discipline: keep meanings short
(state/event ≤ 6 characters, scenario ≤ 10) and estimate row width (CJK counts
as 2) to fit the display area — a wrapped row loses column alignment and
readability collapses. If a row would wrap, shorten meanings; if it still will
not fit, use Form C.

**Form B — sentence blocks (reading-accessible)**: one transition per block,
scenario sentence first, then a fixed three-line frame (状态…/发生…/进入…). Use
for detailed confirmation, users with reading difficulties, or ≤ 10 transitions.

**Form C — grouped by source state (large machines / narrow panes)**: one
section per state, each rendered as its own small 3-column table
（`event（含义）| NEXT（含义）| 场景`）; no cross-group column alignment to track.
Use for ≥ 15 transitions or when the display area is too narrow for Form A. If one
group's table would still wrap, fall back to a one-line-per-event bullet list for
that group only.

### Step 5: Confirm with User

Show the rendered model (the chosen form, symbols + inlined natural language)
BEFORE writing the harness. Ask:

1. Are all states captured?
2. Are all transitions and guards correct?
3. Are there undocumented transitions not in the plan?
4. Is the initial state correct?
5. Does every entry read correctly — state/event meanings and the (state, event)
   scenario all match the real situation?

Only proceed after confirmation. A wrong model produces wrong counter-examples,
which wastes more time than no verification at all.

## Probe Design Patterns

Every probe below is implemented by `model_verify`. These patterns are here to read a finding, not to reimplement it.

### A1: Unexpected Event Injection

For every state, list the events declared anywhere in the machine that this state does not handle. An unhandled event is a silent ignore or undefined behaviour.

### A2: Race Interleaving

For event pairs that can arrive in the same tick, compare `e1` then `e2` against `e2` then `e1`. A different outcome is order dependence the design must state.

### A3: Order Permutation

The same question at N events. Up to 5 events permute fully; beyond that the probe samples. More than one terminal state means the outcome depends on arrival order.

### A4: Pair Symmetry

For paired operations (lock/unlock, start/stop, alloc/free, enable_irq/disable_irq, open/close), search from the initial state for a path that acquires without releasing before it terminates or acquires again. That is a leak or a deadlock.

### A5: Boundary Blast

Test each counter at 0, 1, max-1, max and max+1. Flag overflow and underflow. Timestamps wrap too: a 32-bit millisecond clock wraps after about 49.7 days, so check every `elapsed_*()` pattern.

### A6: Resource Injection

For every state and transition, ask what happens when the resource call fails: `malloc` returns NULL, a queue is full, a semaphore times out, a pool is exhausted. No error, fail or retry transition means no recovery path.

### A7: Minimal Counter-Example

Breadth-first search for the shortest event sequence that violates an invariant. It decides one runtime state at a time, so it fits the state-predicate kinds only. `leads-to`, `sequence`, `atomicity`, `budget` and `probability` assert a property of a whole run and use the search in their own sections (A9-A13).

### S8: Monotonic Variables

For counters that must move one way only, list the events that change them. An event that moves against the declared direction is a finding.

### A8: Idempotent Replay

Apply each retryable event twice from every reachable state. A second application that changes state, or cannot happen, is a finding.

### A9: Leads-To

For a progress claim ("from MIGRATING, eventually DONE"), check every path from the source state. A path that dead-ends or loops before the target fails. A target set is still a universal claim: a branch that reaches none of its members fails.

### A10: Sequence Order

For an ordered sequence ("backup, then modify, then commit"), search for a path where a later event occurs before an earlier one.

### A11: Atomicity

For all-or-nothing groups, track whether the atomic event started and whether commit or rollback followed. Leaving the scope, or terminating, before commit or rollback is a violation.

### A12: Budget (Worst-Case Path Cost)

Give each transition a `cost` and declare a `budget`. The probe reports the shortest path whose accumulated cost exceeds it. A reachable cycle with positive cost means cost grows without bound, which is a violation whatever the budget says. Costs are modeler labels: this checks the model against its budget, not real WCET.

### A13: Probability Reachability (DTMC)

Give each branch a relative `weight` and declare a `probability` bound. The probe solves P(ever reaching the target) by value iteration and compares it with the bound. Absent weight is 1; weight 0 never fires. This is a qualitative check of the weights, not a measured failure rate.

### A14: Deadline (Discrete Tick Clock)

Declare which events advance the clock (`tickEvents`) and cap per-state residency with `maxTicks`. A tick that keeps the machine resident past its cap is a deadline miss, and the probe reports the over-residency path. This checks declared deadlines, not execution time.

## Counter-Example Interpretation

When a probe finds a counter-example, classify it:

### True Positive (plan has a real gap)

- The counter-example uses only events/states defined in the plan
- The plan's own rules would agree this is a violation
- **Action**: Report as a finding with severity based on impact

### Model Error (extraction was wrong)

- The counter-example depends on a transition the plan doesn't actually define
- The plan explicitly handles this case but the model extraction missed it
- **Action**: Fix the model and re-run; do NOT report as a finding

### Acceptable Risk (gap is intentional)

- The plan acknowledges the gap explicitly ("not handled, system resets")
- The counter-example requires physically impossible event sequences
- **Action**: Note in findings but mark as "acknowledged — no fix needed"

## Known Limitations

### What This Method CAN Detect

- Missing transitions and states
- Deadlock and livelock
- Violated invariants (the plan's own claims disproven)
- Race conditions between documented events
- Unsymmetrical resource pairs
- Counter/timer boundary issues

### What This Method CANNOT Detect

- **Implementation bugs**: The C code may have errors not present in the model
- **Timing-dependent bugs**: the model does not simulate real-time constraints
- **Compiler/optimization issues**: Volatile omission, reordering, inlining effects
- **Hardware-specific behavior**: Memory-mapped I/O timing, DMA races, cache coherency
- **Undocumented behavior**: If the plan doesn't describe a transition, the model can't either
- **Real concurrency**: The model is single-threaded; true preemptive multitasking bugs are out of scope
- **Entry/exit actions**: State entry/exit side effects (e.g., `lock()` on enter, `unlock()` on exit) are not modeled as events. A4 Pair Symmetry may miss unbalanced pairs that exist only in entry/exit actions. If the plan describes these, manually extract them as pseudo-events (`ENTER_state`, `EXIT_state`) before running verification. In DSH (`model_verify`), state `onEntry`/`onExit` declarations are modeled natively and A4 treats them as implicit acquire/release events — no manual pseudo-events needed.
- **Execution cost is modeler-annotated**: transition `cost` (absent = 1) and `budget` invariants are static labels; A12 verifies the model against them. Real execution time/WCET needs binary-level timing analysis (e.g. aiT, RapiTime).
- **Unverified semantic dimensions**: when model or document vocabulary references hard real time, preemptive concurrency, hybrid control stability, or probability/reliability, this plugin reports informational notes / routes to dedicated tools — it never verifies those claims itself. See `references/gap-routing-guide.md`.
- **Guard variable scope**: The model treats guard variables as global to the machine. If a guard variable's lifetime is state-scoped (reset on entry) but the model assumes it accumulates globally, boundary-blast results will be wrong. Verify guard variable scope during extraction.
- **Nested/hierarchical states (Harel statecharts)**: The model only supports flat state machines. Parent/child state nesting, history pseudostates, and orthogonal regions are not supported — flatten them manually before verification.
- **Cross-machine protocols**: Two interacting state machines are verified independently. Composition bugs (e.g., Machine A sends event E to Machine B, but B is in a state that doesn't handle E) are invisible to single-machine verification. If the plan describes multi-machine interaction, document the protocol contract separately.

### Model Fidelity Warning

The model is an APPROXIMATION. It models state transitions, not execution semantics. A model that passes every check (S1-S8 structural, A1-A14) means the plan's LOGIC is consistent — NOT that the implementation will work. Always follow logic verification with code-level review.

## Refactoring Verification

When the document is a refactoring plan (modifying existing logic, not greenfield design), the pipeline adapts to compare BEFORE and AFTER models.

### Extraction for Refactoring

The BEFORE model comes from **code, not the plan**. The plan may describe the current state inaccurately — verify against the actual implementation:

1. Read the relevant source files (state machine dispatch, state enum, handler functions)
2. Extract the ACTUAL transition logic from code, not from the plan's description of "current behavior"
3. Extract the AFTER model from the plan as usual
4. Display both tables AND their model narratives side by side

### Comparison Methodology

**Behavioral preservation**: For each event sequence accepted by BEFORE, trace the same sequence in AFTER. If AFTER ends in a different state (or rejects the sequence), flag as BEHAVIORAL DELTA. The plan must explicitly document this delta — if it doesn't, it's a regression.

**Invariant continuity**: Re-decide every invariant on AFTER, mapped through `stateMapping`. Any invariant that holds on BEFORE but fails on AFTER is a regression — the refactoring broke an existing guarantee. State predicates go through the same reachability search as S7; `leads-to`, `sequence`, `atomicity`, `budget` and `probability` are re-decided by the searches their own probes (A9-A13) use, so continuity agrees with the standalone verdict. A state reference that the mapping drops is reported as a mapped-state warning instead of silently changing the property.

**Complexity delta**: Count objectively:

- Number of states (BEFORE vs AFTER)
- Number of transitions
- Number of guard conditions
- Maximum path length from INIT to any terminal state

If the plan claims "simplification" but the numbers don't decrease, flag as UNSUBSTANTIATED CLAIM.

**Deadlock regression**: A refactoring that splits one state into two should not introduce a deadlock path that didn't exist before. Run S2 on AFTER and compare to BEFORE's deadlock report.

For before/after comparison, pass the earlier model as `beforeModel` and an optional `stateMapping`; the D1-D4 checks then run after the standard ones.

### Common Refactoring Bugs Caught by This Method

- **State split introduces dead edge**: Splitting ERROR into ERROR_TRANSIENT and ERROR_PERMANENT creates a new state with no transition from ERROR_TRANSIENT back to RECOVERING
- **Guard inversion**: Changing `retry < 3` to `retry <= 3` silently adds one more retry — the plan doesn't mention it
- **Orphaned event**: A transition removed in the refactoring was the only path that handled `power_lost` — the event is now silently ignored in some states
- **False simplification**: The plan claims "simplified error handling" but merges two states with different recovery paths into one, losing the distinction

## Manual Verification Mode

When no engine can run (air-gapped machine, locked-down host), execute each check manually. The agent performs the verification using its own reasoning — the methodology is identical, only the execution engine changes.

### Size Limit

Manual verification is reliable for state machines with **≤ 10 states and ≤ 30 transitions**. For larger machines, manual BFS and cycle detection become error-prone. If the machine exceeds this threshold and no engine can run, either:

- Decompose the machine into sub-machines and verify each independently, then check cross-machine contracts manually
- Flag the size limitation as a finding and recommend running the engine offline from the repository

### Prerequisites

- Transition table and model narrative have been extracted and confirmed with the user
- You have the full table in context (from Phase 2 extraction step)
- **Model validation**: when a host with an engine becomes available, run the extracted model there and compare its findings with the hand-checked ones.

### Phase 2a — Manual Structural Checks

**S1 Reachability**: Start from INIT. For each state, ask: "Is there any sequence of events from INIT that reaches this state?" Mark each state as reachable or unreachable. Unreachable states are dead code — flag them.

**S2 Deadlock**: For each non-terminal state, count outgoing transitions. If count = 0, flag as DEADLOCK. Terminal states are exempt.

**S3 Liveness**: Look for cycles in the transition graph that have no exit to a terminal/recovery state. Example: ERROR → RECOVERING → ERROR forms a cycle. If RECOVERING has a transition to IDLE, it's fine. If every transition from the cycle stays in the cycle with no terminal exit, flag as LIVELOCK.

**S4 Determinism**: For each state, group transitions by base event name (strip guard suffixes). If two transitions share the same base event and have different targets without different guard conditions, flag as AMBIGUOUS.

**S5 Event Completeness**: Collect all unique event names. For each non-terminal state, list which events have no defined transition. Flag any state missing handlers for events that other states define — these will be silently ignored at runtime.

**S6 Guard Completeness**: For each transition with a guard (e.g., `timeout (retry<3)` → RETRY), check if the complementary branch is defined (e.g., `timeout (retry≥3)` → FATAL). If only one branch exists with no else/default, flag as INCOMPLETE GUARD.

**S7 Invariants**: For each "always/never/guaranteed" claim in the plan, trace every reachable path and verify the claim holds. If you find a counter-example path, quote the plan claim, show the violating path, flag as INVARIANT VIOLATION.

### Phase 2b — Manual Adversarial Probes

**A1 Unexpected Event**: For each state, list all events defined ANYWHERE in the machine that this state does NOT handle. For each unhandled (state, event) pair, assess: is this event physically possible in this state? If yes, what happens? Silence = undefined behavior. Flag if the plan doesn't document the behavior.

**A2 Race Interleaving**: Identify pairs of events that could arrive in the same tick (e.g., timer expiry + message arrival). Trace both orders through the machine. If the final state differs, flag as RACE — the outcome depends on event ordering.

**A3 Order Permutation**: Take 3-5 key events and trace all permutations. If different orders lead to different terminal states AND the plan claims independence, flag as ORDER DEPENDENT.

**A4 Pair Symmetry**: Identify all `lock/unlock`, `start/stop`, `alloc/free` pairs. Check every path: if a path includes `lock` without a subsequent `unlock`, or `alloc` without `free`, flag as ASYMMETRIC. A quick heuristic: if a transition name contains "lock" (or "start", "alloc"), check that every path from its target state eventually hits the corresponding "unlock" before a terminal state.

**A5 Boundary Blast**: For each counter variable mentioned in guards, test values: 0, 1, max-1, max, max+1. Flag any that would cause overflow or undefined behavior. For timestamps, check if `elapsed = now - start` handles wraparound correctly.

**A6 Resource Injection**: For each state that appears to allocate (names containing "alloc", "init", "start", "open", "connect", "begin"), check if there is a recovery/error path if the allocation fails. If no recovery exists, flag as RESOURCE VULNERABLE.

**A7 Minimal Counter-Example**: For each invariant that failed, find the event sequence that violates it. This is the most useful output — it gives the plan author an exact repro. The searches for state predicates, `sequence`, `atomicity` and `budget` are breadth-first, so their witness is the shortest one; the `leads-to` walk and the `probability` bound report what they found without claiming minimality.

### Finding Format

Every finding has the same shape, in a report body or quoted in prose:

```text
[CHECK] S1 Reachability
  RESULT: PASS — All 7 states reachable from INIT

[CHECK] S3 Liveness
  RESULT: FAIL — Absorbing cycle: ERROR → RECOVERING → ERROR
  EVIDENCE: RECOVERING has only one transition (→ ERROR after cooldown).
            No path from RECOVERING back to IDLE exists.
  SEVERITY: Error — machine can never recover from ERROR state.
```

Manual verification takes longer but produces identical-quality findings. The key advantage: it requires zero dependencies and works on any platform.

## Method provenance

Where each check comes from, and - just as important - where it does not.

The distinction below is the one to keep: a **published method** has a definition and a body
of work behind it, so its result means what that work says it means. An **engineering
convention** is this plugin's own rule, chosen because it catches something real; nothing
outside this repository defines it, and it may change without the literature moving. Neither
is worse, but a reader has to know which one they are holding.

| Check | Method | Provenance |
|---|---|---|
| S1, S2, S3 | Explicit-state reachability analysis: enumerate the reachable state space, then ask whether a state, a terminal trap, or a closed cycle exists | Published. Clarke & Emerson, *Design and Synthesis of Synchronization Skeletons Using Branching-Time Temporal Logic*, LNCS 131 (1981); Clarke, Grumberg & Peled, *Model Checking*, MIT Press (1999) |
| A2, A3 | Interleaving semantics, with order permutation as the practical probe for it; the sampling beyond the permutation bound is deliberate weakening of partial-order reduction | Published, with a caveat: Godefroid, *Partial-Order Methods for the Verification of Concurrent Systems*, LNCS 1032 (1996); Holzmann, *The SPIN Model Checker*, Addison-Wesley (2003) |
| A7 | Breadth-first shortest counterexample over the reachable graph | Published. Standard in explicit-state model checking (above); the BFS-as-minimal-witness idea is in the same tradition |
| A13 | Discrete-time Markov chain reachability by value iteration | Published. Baier & Katoen, *Principles of Model Checking*, MIT Press (2008), ch. 10 |
| `model_export` | Translation into the input language of a published checker, so a stronger engine can decide what this one approximates | UPPAAL: Behrmann, David & Larsen, *A Tutorial on UPPAAL*, SFM 2004. PRISM: Kwiatkowska, Norman & Parker, *PRISM 4.0: Verification of Probabilistic Real-Time Systems*, CAV 2011. TLA+: Lamport, *Specifying Systems*, Addison-Wesley (2002). SPIN: Holzmann (2003), above |
| A5 | Boundary value analysis: 0, 1, max-1, max, max+1 for each counter | Published. Myers, *The Art of Software Testing* (1979) - the technique is textbook; applying it to a model's declared bounds rather than to code is this plugin's shape |
| D1-D4 | Behaviour preservation across a refactor, decided by re-running the structural and invariant checks on the AFTER model through a state mapping | **Convention.** Regression checking of this kind has no canonical formulation for state machines. The nearest published ideas are regression test selection and metamorphic testing (see the next row), but the D1-D4 semantics are defined here, in this repository, and nowhere else |
| A4, A8 | Paired-operation symmetry and idempotent replay | **Convention**, in the sense that the *questions* are standard engineering concerns (a lock without an unlock, a retry that is not idempotent) while the *decision procedure* - search for a path that acquires without releasing; apply each retryable event twice - is this plugin's own |
| A6 | Resource-failure injection: what happens when malloc returns NULL, a queue is full, a pool is exhausted | **Convention.** The concern is fault injection / FMEA in spirit; the model-level check is ours |
| A14 | Deadlines over a declared discrete tick clock | **Convention.** Discrete-time clocks appear in timed-automata work (UPPAAL, above), but `tickEvents` + `maxTicks` is this repository's notation for them, not a published one |
| A12 | Path cost against a declared budget | **Convention.** Weighted shortest path is textbook; "this transition costs 1 unless the model says otherwise, and a positive-cost reachable cycle means unbounded cost" is a rule stated here |
| C1, C2 | Composition of machines: a reachable node where no machine can advance, and a rendezvous that can never fire | **Convention.** Asynchronous product construction is standard; the two specific verdicts and their handshake semantics are defined in this plugin |
| `model_verify` as a whole | Bounded explicit-state search with the model schema closed by construction | Same provenance as S1-S3, plus one design decision worth naming: the schema rejects unknown keys rather than ignoring them, because a mistyped guard variable reads as an always-false guard. That is a choice about soundness, not a published result |

Two notes for a reader deciding how much weight to put on a finding.

**The bound is part of the claim.** `maxStates` (default 10000) decides how much of the state
space was explored, and truncation is reported rather than hidden. A "pass" from a truncated
search is a statement about the part that was walked, which is why the report carries
`summary.truncated` and why `*_UNDECIDED` codes exist: absence of a counterexample over a
bounded walk is not a proof of the property.

**This is not the only way to decide these properties.** The plugin takes the explicit-state
route because it needs to run inside a session with no external toolchain, and because a
shortest counterexample in the report is what makes a finding actionable. Section
"What this method does not implement" below names the classical alternatives and why they are
not here.

## What this method does not implement

Every entry is a real technique with a body of work behind it. None is present in this plugin.
Where the plugin has a workaround, it is named; where it does not, the honest answer is that
the property is not decided here.

| Classical method | What it decides that this does not | What this plugin does instead |
|---|---|---|
| Symbolic model checking (BDDs, McMillan 1993) | Systems whose state space is far too large to enumerate. This plugin enumerates and truncates | Nothing. A model past `maxStates` is reported truncated, not verified |
| Bounded model checking over SAT/SMT (Biere et al., 1999) | Bounded-depth properties, and it scales much further than enumeration | Nothing. `model_export` to a checker that does this is the route out |
| CTL / LTL model checking (Clarke & Emerson 1981; Pnueli 1977) | Arbitrary temporal formulas, including nested and fairness-constrained ones. This plugin decides a fixed set of property shapes | The eight invariant kinds are the way to state a property. Anything they cannot express is not checked |
| k-induction and IC3/PDR | Unbounded proofs over infinite or very large state spaces | Nothing. Guarantees are relative to the modelled bounds |
| Abstraction interpretation (Cousot & Cousot, 1977) | Properties of the program the model came from, soundly over all inputs | Nothing at all: this plugin reasons about the *model*, and the model's fidelity to the code is the extractor's responsibility |
| Theorem proving (Coq, Isabelle, KeY, KIV) | Unbounded arithmetic and data properties, with a proof object | `model_export` to TLA+ covers some of this ground with TLC as the backend |
| Timed automata / real-time model checking (Alur & Dill 1994; UPPAAL) | Continuous-time deadlines and clock constraints | A14 over a declared discrete tick clock, and export to UPPAAL. The model has no continuous time |
| Probabilistic model checking beyond reachability (PCTL, MDPs, CSL) | Expected reward, steady-state probability, strategies under nondeterminism | A13 decides "P(ever reaching the target) vs a bound" only. PRISM export is the route to the rest |
| Symmetry reduction | Collapsing symmetric state spaces to make enumeration feasible | Nothing. A3's permutation sampling is a probe for order dependence, not a reduction |
| Compositional / assume-guarantee reasoning | Deciding components separately and combining the results | C1/C2 decide two properties of a whole composition, by enumerating the product |

## Structural review: what graph theory already answers

The structure review (`UML020`-`UML026`) is graph algorithms over a dependency graph: isolated
nodes, dangling endpoints, cycles, disallowed edges, layer violations, missing required edges.
That places it firmly inside graph theory, and graph theory has a good deal more to say about
dependency graphs than this plugin asks it.

| Question about a dependency graph | Graph-theoretic formulation | In this plugin? |
|---|---|---|
| Is anything unreachable / isolated? | Connectivity, and the degree-0 vertices | Yes - `UML020` |
| Is there a cycle? | Cycle detection, with the shortest one named | Yes - `UML022` |
| Does an edge violate a declared dependency rule? | Edge legality against a matrix, and layered DAG constraints | Yes - `UML023`, `UML024`, `UML025` |
| How tangled is it, in one number? | Cyclomatic complexity (McCabe, 1976) as `E - V + 2P` over the dependency graph | No |
| What is the smallest set of edges to remove to make it acyclic? | **Minimum feedback arc set.** NP-hard (Garey & Johnson, *Computers and Intractability*, 1979); approximation and fixed-parameter algorithms exist | No. This is the difference between "a cycle exists" and "here is how much coupling you must break" |
| How should it be partitioned into modules? | Community detection / modularity (Newman & Girvan, 2004), and spectral clustering via the graph Laplacian (Fiedler, 1973) | No. The plugin checks a declared matrix; it does not propose a partition |
| Which edges are structurally most load-bearing? | Betweenness centrality (Freeman, 1977), and the `k`-core decomposition for layering | No |
| Are there dependency layers at all, or is it one blob? | Topological ordering, and DAG-ness of the condensed graph | Partly - `UML024` checks a layer matrix the caller declares, rather than deriving layers |

None of the five "No" rows is a gap in what the review *claims*: it says it audits the graph
against a declared matrix, and it does. They are the answer to "what else could be computed
here", and the feedback arc set row is the one most likely to earn its place, because
"break these two edges and the architecture becomes acyclic" is actionable in a way that
"there is a cycle" is not.

**On topology specifically.** The user-facing question that prompted this section was whether
topological methods apply. The honest answer: the dependency analysis here is *graph*-theoretic
(combinatorial), and that is the established line for architecture review. Genuinely
*topological* machinery - homology, persistent homology over a filtration, Betti numbers -
is used on geometric and scientific data, and it does appear in netlist and circuit analysis.
It is not an established technique for reviewing a UML or dependency diagram, and this
repository has not evaluated it. Treating a dependency graph as a simplicial complex would
need a filtration that means something in software terms before any of it could be reported
as a finding; nobody here has defined one, and inventing one to fill a section would be the
opposite of what this document is for.

## Integration with the Review Pipeline

```text
1. Load model-everything skill
2. Read plan → Phase 1 (enumerate claims)
3. Detect behavioral claims → trigger logic-primitive escalation
4. Load this guide
5. Run the checks: the native tool when the host has it, otherwise Manual Verification Mode (see above), step by step
7. Extract model → show transition table → GET USER CONFIRMATION
8. Run Phase 2a (8 structural primitives) → log results
9. Run Phase 2b (14 adversarial probes) → log results
10. Classify counter-examples (true positive / model error / acceptable risk)
11. Feed confirmed findings into Phase 3 (gap analysis)
12. Include in Phase 5 (structured output)
```

Never skip the check. A verified model based on wrong extraction is worse than no verification — it creates false confidence.

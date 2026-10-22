---
name: model-everything
description: "Use when a document claims something checkable about code: API names, paths, enums, feasibility, protocol behaviour, timing, 'always/never'. It enumerates the claims, verifies each against the code with file:line evidence, then builds an executable model when behaviour, safety or deadlock is at stake. Diagrams: model-everything-uml; design principles: model-everything-design; concurrency: model-everything-interleaving; data: model-everything-datamodel; dependencies: model-everything-structure."
---

# Model Everything

For an unverified design, failure is only a matter of time. Complex code becomes clear once you model it and run it. Check every claim before you act on it.

## When This Skill Applies

**This is the entry point.** Load this skill when a claim about the code has to be settled and a reading will not settle it. It owns the doctrine: enumerate the claims, verify each against the code, cite `file:line`, read `verdict`. It also owns the executable verification for behaviour. A neighbouring domain goes to its own skill through the routing table below.

**It decides small models, not programs.** The engine enumerates states, so a model that explodes is reported `truncated` with the undecided check named. That is not a bug to retry with a larger `maxStates`: reduce the model first (drop variables the property does not read, collapse symmetric states), and if it still explodes the property needs a tool that does not enumerate - SPIN for partial-order reduction, NuSMV for symbolic search, CBMC for bounded SAT. This plugin builds no abstraction and reads no program source.

**This costs more than reading.** Measured on our own corpus, the same task runs from parity to several times the cost, depending on the shape of the question. Reach for it when the claim is about all paths rather than one, when nothing in the repository will go red if it is false, or when the verdict has to be reproducible later. A claim one reading settles belongs in a sentence, not in a model.

| The task involves… | What it does |
|---|---|
| Any claim about code: design doc, spec, plan, review comment, README, commit message, refactor proposal, "this is safe", "this always holds", "this can't deadlock" | Enumerate the verifiable claims (Phase 1), verify each with `file:line` evidence (Phase 2), classify the gaps (Phase 3) |
| A state machine or protocol with three or more states, guards, ACK/NACK/retry, lock/unlock, or start/stop ordering | Build an executable model. Run the S1-S8 structural checks and the A1-A14 adversarial probes |
| A quantitative or temporal guarantee: worst-case cost within a budget, "90% of runs reach SAFE", "must leave within 2 ticks" | A12 budget, A13 probabilistic reachability, A14 deadlines. Each returns a counterexample path |
| A handshake or power-up sequence across two or more components | `model_compose_verify`: C1 composition deadlock, C2 rendezvous that never fires |
| A refactoring that changes state topology or guards | Compare BEFORE and AFTER models for behaviour preservation, invariant continuity and deadlock regression (D1-D4) |
| An explicit request to prove code correct, verify a module, or check a migration for breakage | Route by domain through [Routing to the Sibling Skills](#routing-to-the-sibling-skills). Keep the doctrine |
| An architecture or dependency question about a component, package or class diagram | `model-everything-structure`: parse it into a dependency graph, judge every edge against the dependency matrix |
| Whether a design keeps its own declarations: layering, a responsibility boundary, an interface wider than its callers, a subtype that cannot replace its base | `model-everything-design`: `model_design_review` decides the declared contracts (`DES1`-`DES11`) and reports the graph's shape |

**Catalog budget**: DSH renders only the frontmatter `description` and truncates it at 500 characters. Every description here fits. Triggers that do not fit live in this table.

## Verification Depth (Plan-Mode Gate)

When loaded as a plan-mode verification gate, this skill's execution is **mandatory**. The model has no discretion to bypass it. Depth classification is gated on objective plan features extracted in Phase 0.

### Phase 0: Feature Extraction (Mandatory)

Before any verification, output the plan's feature summary to context:

```text
Plan features:
  Files: [N]
  Functions added/modified: [list or "none"]
  Behavioral claims: [none / "invariants listed" / "always/never/guaranteed assertions"]
  State machine changes: [none / describe topology delta]
→ Depth: LIGHTWEIGHT | STANDARD | ESCALATED
```

This step is NOT skippable — it creates an explicit, auditable record of what the plan claims before verification begins.

### Depth Classification

| Plan Feature | Depth |
|-------------|-------|
| Single file, zero function signatures added/modified, no behavioral claims of any kind | LIGHTWEIGHT |
| Multi-file, OR new/modified function signatures, OR implicit behavioral claims (invariants, equivalence assertions, "behavior is unchanged") | STANDARD |
| "Always"/"never"/"guaranteed" language, OR state machine topology changes (≥1 state or ≥2 transitions modified) | ESCALATED |

**"No behavioral claims" is narrow**: if the plan asserts anything about behavior preservation — including listing invariants, claiming equivalence, or saying "refactoring only, no behavior change" — that IS a behavioral claim. The absence of the literal words "always"/"never" does NOT mean there are no behavioral claims.

### Output Requirements

| Depth | Required |
|-------|----------|
| LIGHTWEIGHT | All 5 checklist items (file paths, API/type names, line numbers, behavioral claims, mechanism feasibility) answered in context with explicit results per item |
| STANDARD | Phase 1-2: enumerate every verifiable claim → verify each against codebase with evidence |
| ESCALATED | Full pipeline: Phase 1-5 including Logic Primitive Verification (Phase 2a structural, Phase 2b adversarial) |

### Plan Verification Block

After verification, append a summary to the plan file:

```markdown
## Plan Verification

- **Depth**: [LIGHTWEIGHT / STANDARD / ESCALATED]
- **Scope**: [N] file paths, [M] API/type names, [K] line citations confirmed
- **Escalation**: [skipped — no behavioral claims detected] or [see transcript for N-check results]
```

This block is the audit trail. A future reviewer must be able to see what was verified and when.
</HARD-GATE>

## Methodology

### Phase 1: Enumerate Claims

Read the document fully. Extract every claim that is verifiable:

- Numeric claims (counts, sizes, frequencies)
- API/type/enum names
- File paths and line numbers
- Mechanism descriptions ("compile-time resolution", "static dispatch")

### Phase 2: Verify Against Codebase

For each claim, run the relevant verification:

- **Numeric claims**: `grep -c` or `grep -rn` to get the real count
- **API/type names**: extract actual signatures from headers
- **Enum/constant values**: list actual values from BSP/config headers
- **Mechanism feasibility**: check language standard and compiler support

### Phase 2 Trigger: Escalate to Logic Primitive?

If the document under review contains ANY of the following, escalate to [Logic Primitive Verification](#logic-primitive-verification) IMMEDIATELY:

- State machine or statechart with ≥3 states OR with guard conditions on transitions
- Protocol handshake, ACK/NACK, retry, or timeout sequence logic
- Claims using absolute language: "always", "never", "guaranteed", "all paths", "cannot", "impossible"
- Lock/unlock, alloc/free, start/stop paired operations where ordering matters
- Any logic where correctness depends on transition completeness or event ordering
- **Refactoring that modifies state topology**: splitting/merging states, adding/removing transitions, changing guard conditions, extracting sub-machines

**Heuristic**: If the transition-to-state ratio > 1.5 or any transition has a guard condition, the machine is complex enough to warrant verification — regardless of state count. For refactoring, trigger if the refactoring changes ≥1 state or ≥2 transitions from the original model.

### Phase 3: Gap Analysis

Classify findings by severity:

1. **Architecture-level**: claims that make the design unimplementable (fake APIs, missing modules)
2. **Mechanism-level**: claims the language/compiler cannot fulfill
3. **Consistency-level**: internal contradictions across documents

### Phase 4: Root Cause

For each error, identify why it happened:

- Wrong mental model (C++ constexpr thinking in C99)?
- Incomplete search scope?
- Copy-paste from other projects without verification?
- Misunderstanding of compiler/linker behavior?

### Phase 5: Structured Output

Each finding includes:

- Exact location (file:line or section)
- What the document claims
- What the codebase actually contains (with evidence — grep output, line numbers)
- Correction direction

---

## Logic Primitive Verification

When Phase 2 triggers escalation, do NOT proceed to Phase 3 until the verification pipeline below is complete. Trust models, not intuition.

### Pipeline Overview

```text
Document claims → Extract model → Runtime check:
  ├── DSH + `model_verify` tool available → build Model schema v1 (references/dsh-model-schema.md) → call the tool → structured report
  └── No engine available → Manual Verification Mode (see references/logic-verification-guide.md#manual-verification-mode)

Refactoring variant:
  Old code + Refactoring plan → Extract BEFORE model + AFTER model
    → Run the pipeline on the AFTER model (the same checks)
    → Compare BEFORE vs AFTER: behavioral preservation, regression, complexity delta
    → Flag any invariant that held in BEFORE but fails in AFTER

UML modelling variant (the task is to draw a flow, not to check a claim):
  Code flow → model with a citation per element → uml_render → diagram
    → uml_review → modelling findings + render/parse round-trip fidelity
    → model_verify → the behavioural checks (S1-S8 / A1-A14)
```

### Budgeting the Model Before You Run It

Search cost is the declared domain times the number of states — and a declared range is
not a bound on the search.

- **`inc`/`dec` are never clamped to `min`/`max`.** The declaration is a property the
  checks verify, not a limit the engine enforces. A counter whose guard does not pin it
  ranges past its own declaration, so the reachable set is unbounded however small the
  declared range looks; S8 reports that as `S8_DOMAIN_NOT_ENFORCED`.
- **Bound a counter with a guard, not a narrower declaration.** `max: 4` with a guard
  `retry < 4` closes the loop. `max: 4` alone does not.
- **Say the budget before running**: values per variable x states. A product in the
  10^5-and-up range will hit the cap and come back undecided.
- **Model the check where the code performs it.** A cap check that lives inside the tick
  handler is a guarded branch of the tick event, not a separate event: as a separate event
  the environment can starve it, and the leads-to failure you then read is an artefact of
  the model rather than a property of the code.

### Native dsh Tools

The tools are `model_verify`, `model_edit`, `model_compose_verify`, `model_datamodel_verify`, `model_design_review`, `model_interleaving_scan`, `model_export`, `report_diff`, `uml_render`, `uml_parse`, `uml_review`, `uml_explain_labels` and `uml_structure_verify` and `model_automaton_verify`. `model_automaton_verify` decides a finite-word language and its relation to another automaton, returning the shortest word that separates them. `model_edit` changes a model file by naming the change and returns the structural diff plus the difference in findings, so a fix round costs one call instead of three. `uml_structure_verify` builds its graph from a source tree when given `repoPath`, reading each language's own import construct, so a dependency question about code does not start with drawing. Each tool's description states what it decides and what it does not. Read the description before calling it, and read the report's `verdict` afterwards.

A model is the largest argument these tools take. When it is long, or you have edited it more than once, write it to a file and pass `modelPath` instead of inlining it: a streamed argument that long is where invalid JSON comes from, and the file accepts any formatting.

These tools carry every capability this plugin claims. Anything outside them is out of scope, and the skills name where that claim is answered instead.

### Reading a Report: `ok` Is Not a Verdict

**`ok` records that a report was produced. `verdict` records how the review went.** A report can carry `ok: true` and still be a failed review. Gate on `verdict`.

- `pass`: no error and no warning. Report the result as verified, together with the scope the model covered.
- `pass_with_findings`: verification ran clean and warnings exist. Report the pass and the warnings. Do not restate it as "no issues".
- `fail`: an error finding exists, or the engine rejected the input (`MODEL_INVALID`). State that the claim is not verified, quote the counterexample path, then propose a correction. Do not describe a `fail` as a successful run.

`summary.truncated: true` and any code ending in `_UNDECIDED` both mean the search stopped before deciding. Name the invariant that went undecided and report the property as undecided.

A tool prints a readable body. Passing checks stay in the `CHECKS` inventory line, and a fact that several checks report appears once. Only error findings inline their evidence. When the body truncates a check, pass `check: "<id>"` to print that check in full. `reportView: "full"` returns the whole report as compact JSON. Use it only to hand the report to `report_diff`; it costs the most tokens of any request you can make.

### Writing the Answer: Name the Finding, Not Its Code

`S2_NO_TRANSITIONS`, `UML019`, `DA2` are values of `findings[].code`, not names. A reader
who has not memorized the schema learns nothing from one, and cannot tell whether their
machine is sound or stuck.

- **Say what it means**, in the user's language and in the terms of their own code:
  「启动超时后 ERROR 没有任何出口迁移，机器会停在那里」, not 「S2 命中」. The finding's
  `message` is written for the report; the sentence for the user is written from it.
- **Keep the identifier where the identifier is the subject**: a report field quoted
  verbatim, a baseline diff, a test name, or a question about the check itself.
- **Name the property, not the checking.** "This path locks without unlocking" beats
  "A4 failed". A check's name earns its place when the reader asked about the checking.
- **Carry the verdict in words.** "Not verified" or "verified, within the scope of this
  model" — never a bare pass, and never a warning presented without its label.

A reader who cannot tell what failed will either trust a report they cannot read, or
ignore one they should act on.

### Slice Acceptance: Baseline Diffs

The acceptance criterion for a refactoring slice is usually "no **new** findings", not
"zero findings". Do not compare two JSON reports by eye — run the comparison:

- DSH: `report_diff { baseline: <earlier report>, current: <new report> }`
- Any host without the tools: run the repository engine against the same JSON.
  (also available on `compose`, `structure` and `uml-review`)

A finding's identity is its **check id + code + canonical locator** (built from
`evidence`/`path`; the message only when a finding carries neither), so a reworded
message reads as `changed`, never as a new finding. The diff's `verdict` describes the
**delta** — a newly added error finding fails it — while `currentVerdict` keeps the
absolute result visible, and a clean delta over a still-failing report says so in
`nextSteps` rather than passing quietly. Two runs over the same input add zero findings:
run that self-check before trusting any baseline.

### Archiving a Model: `_`-Prefixed Metadata

Keep provenance with the model instead of in a sidecar that drifts:

- Any key starting with `_` at any level (`_source`, `_verified`, `_uml`, `_extraction_caveats`, `states[0]._note`) is **annotation metadata**: the schema ignores it, `modelHash` excludes it, and the report echoes it as `metadataKeys`.
- Everything else stays closed — a mistyped `sttes` is still a validation error, and that is deliberate.
- Because the hash ignores `_` keys, "the model as archived" and "the model with metadata stripped" hash identically; record the reported `hashSpec` next to the hash so a later reader can reproduce it (`verify model.json --hash-check <hex>` answers whether a recorded hash belongs to a published spec at all).

### Refactoring Verification Mode

When the document under review is a refactoring plan (modifying existing state machine logic, not designing from scratch), adapt the pipeline:

1. **Extract the BEFORE model** from the existing codebase (not the plan — verify what the code actually does, not what the plan claims it does)
2. **Extract the AFTER model** from the refactoring plan
3. **Show both tables AND their model narratives** to the user side by side and confirm the delta is intentional
4. **Run Phase 2a + 2b on the AFTER model** — the same checks a new design gets
5. **Compare BEFORE vs AFTER**:

   | Check | Method | Severity if Violated |
   |-------|--------|:---:|
   | Behavioral preservation | Every event sequence accepted by BEFORE must also be accepted by AFTER (or explicitly removed per plan) | Error — regression |
   | Invariant continuity | Any invariant that held in BEFORE must hold in AFTER (unless the refactoring explicitly changes it) | Error — undocumented behavior change |
   | Deadlock regression | New states or transitions must not introduce deadlocks not present in BEFORE | Error |
   | Complexity claim | If plan claims "simpler": count states + transitions + guards. Is AFTER objectively simpler? | Warning — unsubstantiated claim |
   | Unreachable code | New states added in AFTER must be reachable (otherwise they're dead code from the start) | Warning |

   In DSH, pass `beforeModel` and optional `stateMapping` to `model_verify`; the engine runs D1 Behavioral Preservation, D2 Invariant Continuity, D3 Regression Delta, and D4 Deadlock/Liveness Regression automatically.

6. **Flag any behavioral delta not documented in the plan** — the most common refactoring bug is an unintended side effect that the plan doesn't acknowledge

Run the checks with the native `model_verify` tool (model JSON, structured guard DSL, path-aware invariants) — see `references/dsh-model-schema.md`. A host without the tools can run the repository engine against the same JSON. For probe patterns, extraction methodology and manual procedures, load `references/logic-verification-guide.md`.

### Phase 2a: Structural Primitives

Run these FIRST. They establish basic well-formedness before adversarial probing.

| # | Primitive | Method | Severity if Violated |
|:--:|-----------|--------|:---:|
| S1 | **Reachability** | BFS from init state; flag all states not in visited set | Warning — dead code |
| S2 | **Deadlock** | Any non-terminal state with zero outgoing transitions? | Error — machine can get stuck |
| S3 | **Liveness** | Does the transition graph contain an absorbing cycle that excludes expected terminal/recovery states? (e.g. ERROR→RECOVERING→ERROR→... with no exit) | Error — infinite loop |
| S4 | **Determinism** | Same state + same event → multiple different targets? | Error — ambiguous behavior |
| S5 | **Event completeness** | For each state, are there plausible events with no defined transition? | Warning — implicit ignore |
| S6 | **Guard completeness** | For each transition with a guard condition, are ALL branch outcomes defined? `if (cnt<3) RETRY else FATAL` → both paths must exist in model | Error — undefined behavior path |
| S7 | **Invariant validity** | Does every reachable state satisfy the plan's stated "always/never/guaranteed" assertions? | Error — plan claim is false |
| S8 | **Monotonic variables** | If a variable is declared `monotonic: inc/dec`, do all updates respect that direction? | Error — counter can move backwards |

### Phase 2b: Adversarial Probes

Run these second. Each probe tries to break the model, and a probe that finds a violation proves a behaviour gap.

| # | Attack | Method | Claim it refutes |
|:--:|--------|--------|-------------|
| A1 | **Unexpected event** | Inject every event E into every state S that has no transition for (S, E). Record whether the model ignores it or crashes. | "All events are handled in all states" |
| A2 | **Race interleaving** | Deliver every pair of concurrent events in both orders. Report a differing terminal state. | "Behaviour is independent of ordering" |
| A3 | **Order permutation** | Permute N independent events. Report differing final states or broken invariants. | "Outcome is order-independent" |
| A4 | **Pair symmetry** | Match every `start/stop`, `lock/unlock`, `alloc/free` pair. Report a path where a pair is unbalanced. `onEntry` and `onExit` count as acquire and release. | "Resources are always released" |
| A5 | **Boundary blast** | Probe counters at 0, 1, max-1, max and max+1, and timestamps at 0 and wraparound. Report overflow, underflow or undefined behaviour. | "Handles all counter and timer values" |
| A6 | **Resource injection** | Simulate `malloc` returning NULL, a full queue and a semaphore timeout at each state that calls them. Report a state with no recovery path. | "Degrades gracefully under resource pressure" |
| A7 | **Counter-example witness** | For a failing invariant, emit the exact violating sequence. The breadth-first searches (state, sequence, atomicity, budget) return the shortest witness. Leads-to and probability return the witness they found without claiming minimality. | "This invariant holds" |
| A8 | **Idempotent replay** | Apply each `idempotentEvents` entry twice from every reachable state. Report a second application that changes state. | "This event is safe to replay" |
| A9 | **Leads-to** | From a declared source state, every path must reach the target state or a member of the declared target set. | "Always progresses to completion" |
| A10 | **Sequence order** | Declared events must occur in the declared order. | "backup before modify before commit" |
| A11 | **Atomicity** | An atomic event must commit or roll back before the scope is left or the machine terminates. | "all-or-nothing" |
| A12 | **Budget** | With `cost` per transition (absent means 1) and a `budget` invariant, every reachable path must stay within budget. The probe returns the shortest over-budget path and reports reachable positive-cost cycles as unbounded. | "Worst case fits the budget" |
| A13 | **Probability reachability** | With `weight` per transition (absent means 1) and a `probability` invariant, P(ever hitting the target) must meet the bound, by value iteration over the absorbing chain. | "90% of runs reach SAFE" |
| A14 | **Deadline** | State `maxTicks` plus top-level `tickEvents`. A tick step must not keep a state resident past its deadline. The probe returns the over-residency path. | "Must leave within 2 ticks" |

### Integration Back to Phase 3

For every probe failure:

1. **Quote** the plan claim verbatim
2. **Show** the counter-example event sequence
3. **Classify** severity (Architecture / Mechanism / Consistency)
4. **Propose** correction direction — never fix inline

### Extraction Rule

Before writing any verification code, output the model in one of the rendering
forms below. Default is Form A; switch forms when the machine is large or the
display area is narrow — never let a table row wrap.

**Form A — integrated transition table (default)**: formal symbols with their
natural-language meaning inlined; the scenario each (state, event) combination
represents is the last column:

```text
状态（含义）             | 事件（含义）          | 下一状态（含义）      | Guard?  | 场景（状态+事件）
------------------------|-----------------------|----------------------|---------|--------------------
INIT（上电待就绪）       | power_ready（电源就绪）| IDLE（空闲待命）     | -       | 就绪后进入待命
IDLE（空闲待命）         | start_cmd（启动命令） | STARTING（启动中）   | -       | 收到命令开始启动
STARTING（启动中）       | ack_received（收到ACK）| ACTIVE（运行中）    | -       | 启动成功进入运行
STARTING（启动中）       | timeout（等待超时）   | ERROR（出错待恢复）  | retry==0 | 首次超时进入重试
STARTING（启动中）       | timeout（等待超时）   | FATAL（不可恢复）    | retry>=1 | 重试耗尽转致命
ERROR（出错待恢复）      | cooldown_elapsed（冷却结束）| RECOVERING（重初始化）| -     | 冷却结束开始恢复
```

Width discipline (Form A): keep parenthetical meanings short (state/event ≤ 6
characters, scenario ≤ 10) and estimate every row's display width (CJK counts as
2) to fit the available area. If any row would wrap, shorten the meanings; if it
still will not fit, switch to Form C. A wrapped table row loses column alignment
and is harder to read than no table at all.

**Form B — sentence blocks (reading-accessible)**: one transition per block,
scenario sentence first, fixed three-line frame. Use for detailed confirmation,
users with reading difficulties, or machines with ≤ 10 transitions:

```text
第 1 步：就绪后进入待命
    状态 INIT（上电待就绪）
    发生 power_ready（电源就绪）
    进入 IDLE（空闲待命）
```

**Form C — grouped by source state (large machines / narrow panes)**: one
section per state, each rendered as its own small 3-column table
（事件（含义）| 下一状态（含义）| 场景）; no cross-group column alignment to track:

```text
DEGRADED_LOADING（降级加载）
  事件（含义）          | 下一状态（含义）      | 场景
  first_data（首帧数据）| OK_READY（正常就绪）  | 收到首帧转就绪
  fault（故障）         | FAULT（故障锁存）     | 故障锁存
  power_off（下电）     | POWER_OFF（下电）     | 下电
```

Each group table is narrow (3 columns, roughly ≤ 60 display columns with short
meanings). If one group's table would still wrap, fall back to a one-line-per-event
bullet list for that group only.

Reading rule: every row/block is one sentence — "在【状态（含义）】下发生【事件（含义）】
→ 进入【下一状态（含义）】，即【实际场景】"。Meanings repeat on purpose: each entry is
self-contained. The machine-readable model keeps the same information in its
`narrative` block (`narrative.states`, `narrative.events`, `narrative.scenarios`).

**CRITICAL**: Show the chosen form to the user and ask for confirmation before
generating the harness. Because the natural language is inlined, any entry that
reads wrong to the user — a state/event meaning that is off, or a scenario that
does not match reality — means the model is wrong even if the symbols are
consistent. The #1 failure mode of verification is extracting the wrong model. If
the plan is ambiguous, flag it as a finding first — don't guess.

**Exception**: If the user has already told you to proceed without confirmation in this session, do NOT call
`ask_user_question`. Instead: (a) cite evidence for every cell/entry — each
state/event meaning and each scenario must trace to a source sentence, (b)
round-trip the filled model (including its `narrative` block) back into the SAME
rendering form and compare it with the extraction, and (c) mark the report
`UNCONFIRMED`.

### Code-Level Behavioral Suggestion

When the task is NOT document/plan review but involves code-level behavioral questions — e.g., the user is editing source files and asks:

- "check this timing sequence for bugs"
- "could this state machine deadlock here"
- "is this retry limit safe"
- "what happens if event X arrives during state Y"

→ **Proactively suggest** this plugin as an optional verification pass. Do NOT escalate automatically — plan-level verification was likely already done. The suggestion is: "I can run a logic-primitive verification on this state machine to check for deadlocks, unreachable states, and boundary issues. Want me to?"

If the user says yes, extract the model from the existing code (not a plan document), and run the standard pipeline. Output the findings as suggestions, not requirements.

This covers the gap where behavioral verification is useful even when no design document is being reviewed.

### When NOT to Escalate

Skip logic-primitive verification when:

- The document makes no behavioral/logic claims (pure API listings, config tables, data schemas)
- The state machine has ≤2 states, no guards, and trivial transitions (IDLE↔ACTIVE)
- The claim is purely structural (file paths, type names, numeric constants) — Phase 2 grep verification is sufficient

### Routing to the Sibling Skills

This skill owns behavioural claims. Three neighbouring domains have their own skill, and loading the wrong one wastes the verification:

| Domain | Skill |
|---|---|
| Drawing a code flow as UML, or auditing a diagram somebody drew (render / parse / review / explain-labels, round-trip fidelity, component and class diagrams refused) | `model-everything-uml` |
| Reviewing architecture, module structure or a dependency diagram (isolated nodes, dangling endpoints, cycles, allowed-dependency and layer violations, missing required edges) | `model-everything-structure` |
| Concurrency, synchrony and async claims — "thread-safe", "lock-free", "no data race", "ISR-safe", "non-blocking", `async`/`await` — mined and routed to TSan/Helgrind/CBMC/TLA+/UPPAAL, never proven here; a shared-location update is decided here by `model_compose_verify` (C5) | `model-everything-interleaving` |
| Entities, fields, relationships, data invariants, schema migrations (DS1-DS4, DA1-DA12, DD1-DD4) | `model-everything-datamodel` |

---

## Warning Signs

If you catch yourself thinking any of these, stop:

| You think | Reality |
|-----------|---------|
| "Too simple to check" | The check is cheap. The silent skip is not. |
| "I read the code, so I know" | Knowing is not evidence. Cite `file:line`, or run the model, or call the claim unverified. |
| "The spec or the diagram says so" | Both are claims about the code. Reconcile them with a source-side scan. |
| "I'll check while implementing" | Check before the decision, not after. |
| "Reasoning is enough" | Reasoning is not a run. One counter-example kills a universal claim. |
| "The report passed, so the code is fine" | The report covers the model you gave it. Reconcile it, and say what you did not check. |
| "The declared range limits the search" | The declaration is a property to verify. `inc`/`dec` are never clamped to it; only a guard bounds the value. |
| "The check found nothing" | Read the verdict: `truncated` and `_UNDECIDED` mean the search stopped, not that the property holds. |

## Rules

1. Verify a document's claim against the code before you trust it.
2. State mechanism boundaries plainly. When the language standard cannot do the thing, say so.
3. Cite evidence as `file:line`.
4. Point the way during review. Implementation happens after approval.
5. Verify behavioural claims by running code. A plan that says "always", "never" or "guaranteed" gets a model, and one counterexample refutes a universal claim.
6. Confirm the model before you run it, unless this session already told you to proceed. Extraction errors are the dominant failure mode of formal verification. In auto mode, extract with cited evidence, validate the round trip, and mark the report `UNCONFIRMED`.
7. Cite the existing check instead of re-verifying it. Compile-time assertions, static analysis and runtime checks already settle that property.
8. Hand a neighbouring domain to its own skill. A diagram is a model, and auditing one belongs to `model-everything-uml`. A concurrency claim is mined and routed by `model-everything-interleaving`. Schema, data invariants and migrations belong to `model-everything-datamodel`. This skill keeps the doctrine and the behavioural checks.
9. Say what this does not prove. Hard real time, preemptive concurrency, hybrid-control stability, probabilistic reliability and execution-cost budgets go to the tool named in `references/gap-routing-guide.md`. `model_verify` reports carry the same routing as `coverageNotes`.
10. A declared range is a property, not a bound. `inc` and `dec` are never clamped; only a guard pins the value. A `truncated` report or an `_UNDECIDED` check means the property is undecided. Report it that way.
11. Write-site analysis is out of scope. "Only the ISR writes this flag" is a question about source code. `model_interleaving_scan` routes it. Neither the model nor the diagram settles it.

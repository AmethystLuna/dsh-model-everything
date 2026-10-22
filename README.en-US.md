# Modeling / Automated Review for Designs and Code (dsh-model-everything)

<p align="center"><strong>English</strong> · <a href="README.md">中文</a></p>

<p align="center">
  <a href="https://github.com/AmethystLuna/dsh-model-everything/actions/workflows/dsh-bundle.yml"><img src="https://github.com/AmethystLuna/dsh-model-everything/actions/workflows/dsh-bundle.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20-blue.svg" alt="Node 20+"></a>
  <a href="https://afdian.com/a/amethystluna"><img src="https://img.shields.io/badge/%E7%88%B1%E5%8F%91%E7%94%B5-Afdian-946CE6" alt="Sponsor on Afdian"></a>
</p>

Abstract what a design or a piece of code claims into a model and let an engine run it: findings carry citations and hashes, so they can be recomputed and compared. The conclusion comes from a run rather than from reasoning it out: thinking it through becomes running it.

A native DeepSeek Harness plugin. It turns the assertions a design makes **about behaviour** into models that can be run, reviewed and exported:

- **Check a claim**: against the source, cited to `file:line`.
- **Run a model**: state machines, protocols, composed machines and data models become executable, and an engine runs them.
- **Review a diagram**: read as a model, reviewed as a model, reconciled with it.
- **Compare a refactor**: a model before and after, with the two reports side by side.
- **Leave a record**: conclusions fixed into a report with hashes, recomputable and comparable and exportable.

## What it covers

| Domain | What it does |
|---|---|
| Claim checking | Enumerates the verifiable claims in a design, spec or review comment. Checks each against the code with a citation, and says plainly which ones it could not settle |
| Behaviour | State machines and protocols: structural checks, adversarial probes, budgets and deadlines, before/after regression. Composition checks catch deadlock and a rendezvous that never fires |
| Diagrams | UML 2.5 diagram families: render, parse and modelling review (including the render→parse fidelity check), in Mermaid and PlantUML |
| Structure | Component, package, class and deployment diagrams audited as dependency graphs: isolated nodes, dangling endpoints, cycles, matrix and layer violations, missing required edges |
| Data | Data models and migrations: structure, migration coverage, copy consistency, rollback symmetry, before/after data regression |
| Concurrency / synchrony / async | Mines claims about how work is executed (thread-safe, locks, interrupts, async/await, the event loop) and routes each to a tool that can decide it. It proves nothing itself |
| Export | Exports a verified model as input for UPPAAL, TLA+, PRISM or SPIN |
| Reports | Report body rendering, baseline comparison (`report_diff`), hash specification |

## Typical uses

### A refactoring harness

A refactor may change the implementation. It may not change the behaviour. Let an engine settle that, instead of reading the diff:

1. **Before**: extract a BEFORE model from the code as it stands (`uml_parse` reads an existing diagram, or write the model against the schema).
2. **Refactor**.
3. **After**: extract an AFTER model.
4. **Regression**: `model_verify` with `beforeModel` and `stateMapping` runs the before/after regression: behaviour preserved, invariants continuous, the state mapping consistent. On the data side, `model_datamodel_verify` runs the same comparison over data, from its `beforeModel`, `fieldMapping` and `migrationMappings`.
5. **Verdict and record**: `report_diff` compares against the baseline report. An added error finding is the reason not to accept the refactor. The hashes in the report let the conclusion be recomputed.

It compares the **two models you give it**, not two versions of the code. Whether each model is faithful to its own source is what steps 1 and 3 are for, and it does not do that part for you. It does not read the diff, edit code or run your tests either. It answers "is the behaviour still the same", not "was this a good refactor".

### Reviewing a code flow

Draw the branching logic as a flow, then read what the picture actually says:

1. **Extract the flow**: write the branches of a function or a service as a `LogicModelV1`, or draw a `stateDiagram-v2` / PlantUML diagram by hand.
2. **Read it back**: give the hand-drawn diagram to `uml_parse`. A line it cannot read becomes a warning rather than disappearing.
3. **Review it**: `uml_review` reports the structural defects - unreachable states, dead ends, a branch that is ambiguous or not exhaustive, a self-loop with no exit, isolated nodes, cycles - and the documentation gaps.
4. **Reconcile with the source**: take every finding back to the code. A correct diagram does not make the code correct.

It reviews the diagram and the model you give it. Whether they match the code is what step 1 is for.

### Reviewing a state machine

Build the machine as an executable model and let an engine run it, instead of reading the code and concluding that it cannot get stuck:

1. **Build the model**: `uml_parse` reads a hand-drawn `stateDiagram-v2` or PlantUML state diagram; a `LogicModelV1` can also be written directly against the schema.
2. **Run the checks**: `model_verify` looks for unreachable states, absorbing cycles, events silently ignored, an allocation with no recovery path, a budget overrun, and a deadline that cannot be met. It reports each as a code whose prefix says which family it belongs to.
3. **State the always/never claims**: put them in `invariants`. The engine searches every reachable state for a counterexample and returns the shortest one it finds.
4. **Reconcile with the source**: every error finding goes back to the code.

Concurrency claims split in two: the ones about **two models touching one shared location** are decided here, by `model_compose_verify` (declare `shared` and `accesses`; C3/C4/C5 decide the declaration, the unordered write and the lost update). Source-level data races, interrupt latency, a blocking call and a missing `await` are still routed to TSan/Helgrind/CBMC/TLA+. Hard real-time semantics - deadlines and periods - are outside its scope.

### Auditing a dependency diagram

A component diagram is a claim about which modules may depend on which. Read it as a graph, then ask whether the edges are allowed:

1. **Give it the drawing**: PlantUML component, package, class or deployment source, or a Mermaid class diagram. `uml_structure_verify` parses it into nodes and edges.
2. **Say what is allowed**, if you have a rule: a matrix of `layers` and `rules`, each rule naming a `source` with `allow` / `deny` / `require` and a `default` for everything else. Without a matrix it reports only structural defects.
3. **Read the findings**: an isolated node, an endpoint never declared, a cycle with its shortest path, an edge that crosses a layer, a required edge that is missing, and - when no node is declared at all - that the input said nothing to audit.
4. **Ask the same question about a code flow**, if the drawing is a state or activity diagram: that is `uml_review`, not this.

It audits the drawing, not the code. A drawing that is internally consistent can still be wrong about the system, so pair it with a source-side scan. When a hand-drawn diagram reports label drift, `uml_explain_labels` prints the label forms the parser accepts for that notation.

### Holding a design to its own declarations

A design says things about itself: this layer sits above that one, this component owns that dependency, this interface is narrower than its callers. `model_design_review` decides whether the design keeps those promises:

1. **Write the design as a model**: the architecture (nodes and edges), plus what it declares - layers, boundaries, allowed and required edges, types with responsibilities, operations, transitions, supertypes.
2. **Run it**: `model_design_review` reports the places the design contradicts itself, and separately the shape of its graph - cycles and the fewest edges that break them, load-bearing elements, ranks, fan-in and fan-out.
3. **Read the three lists**: `violations` decide the verdict; `signals` are worth a look and fail nothing; `facts` is a measurement, not a finding. `checksSkipped` says which principles went unchecked because nothing was declared to hold the design to.

It never judges a design by an outside standard. It reports that the design contradicted **something it declared**, or a structural fact about its graph. Asking whether the design is *good* is a question for a reviewer, and this tool answers a different one: does it hold together on its own terms.

### Two machines that have to agree

One machine cannot deadlock *because of another one*. When two components hand-shake, the interesting failures live in the composition:

1. **Model each machine** on its own, then pass them together: `model_compose_verify` takes an array of models.
2. **Name the shared events** in `rendezvous` if a handshake is only legal when both sides are ready. An event not named there advances one machine, so a machine waiting on a handshake can take any number of its own steps first.
3. **Read C1 and C2**: a reachable node where no machine can advance and one of them is not terminal, and a rendezvous that can never fire. Both name the reason per machine, and C1 gives the shortest counterexample.

There is no rate ratio and no fairness bound in the model. For one machine on its own - unreachable states, invariants, cost against budget - that is `model_verify`.

### Concurrency claims, mined and routed

"Thread-safe", "lock-free", "ISR-safe" are claims that need a tool that can settle them, and the first job is finding them:

1. **Scan the text**: `model_interleaving_scan` takes the document, plan or notes and reports the risk points - the claim, the shared state, the interrupt, the critical section, and the async ones (`async`, `await`, `promise`, the event loop, a callback). Every finding carries a `family` (threads / synchronization / async / interrupts / shared-state), and an absolute claim is an error.
2. **Read what each absolute claim owes**: a claim like "no data race is possible" is reported as an error requiring dedicated verification, and each finding names the analysis that could settle it - TSan or Helgrind for a race, CBMC for a bounded proof, TLA+ for a protocol, RTOS-aware interrupt analysis for an ISR.
3. **Run that analysis**: this plugin does not run it and proves nothing about concurrency itself.

It reads text. It does not see your threads, and a clean scan is not a clean bill of health - it means no claim was found, which is a different statement.

### A migration, before and after

A migration is two models and a claim that the data survived. Give it both and the claim becomes checkable:

1. **Two models**: the schema as it was, and the schema as it will be, each a data model with entities, fields, keys and relationships.
2. **Say how fields move**: `fieldMapping` from the old path to the new one, plus `migrationMappings` for a field whose source is not simply its own old name.
3. **Run the comparison**: `model_datamodel_verify` with `beforeModel` checks migration coverage, copy consistency, rollback symmetry and the before/after data regression.
4. **Read the warning**: a field declared `required` in the new schema with nothing supplying it is reported as `DS2_REQUIRED_FIELD_UNSOURCED`. That is a warning, so the verdict stays `pass_with_findings` - it is a decision to make, not a failure the engine gets to declare.

It compares the two models you give it. Whether either is faithful to the database it describes is the extraction step, and this tool does not do it.

### Importing and exporting diagrams: a frozen record, and a reference for the long run

What is kept here is the **source file**, not a screenshot: `uml_render` writes Mermaid or PlantUML source, and `uml_parse` reads that source back into a model. One diagram therefore serves two purposes:

- **A frozen record of the design**: commit the diagram source, the model and that round's verification report together, as the design as it stood at a point in time. The model may carry `_`-prefixed metadata - a ticket number, a date, an owner, the caveats left by the extraction - and those keys take no part in the hash, so archive notes do not change the identity of a conclusion.
- **A reference for the long run**: on the next change, extract the model again, run the verification again, and compare with the frozen report through `report_diff`. An added error is what this change introduced; a finding that disappeared is an old problem solved. The hashes decide whether this is still the same model, instead of an eyeball comparison of two pictures.

When an external checker is needed, the same model can be exported with `model_export` as native input for UPPAAL, TLA+, PRISM or SPIN.

The limit: it stores and compares **model and diagram source**; a rendered picture is a by-product. A diagram that changed while the model did not - or the reverse - shows up at the next parse or comparison.

## Tools

| Tool | What it does |
|---|---|
| `uml_render` | Model → diagram source (Mermaid or PlantUML) for a chosen family. A view the notation cannot express is refused, with the reason |
| `uml_parse` | Diagram source → the family model. A text that is not a state machine or flow is refused by name, not read as one |
| `uml_review` | Audits the modelling: structural defects, documentation gaps and render↔parse fidelity. Give it a model, a diagram, or both |
| `uml_explain_labels` | Prints the label and comment contract the parser accepts; no diagram needed |
| `model_verify` | Executable verification of state machines and protocols |
| `model_compose_verify` | Two or more machines together: deadlock, a rendezvous that never fires, and - with `shared` and `accesses` declared - an unordered write (C4) or a non-atomic read-modify-write pair (C5) |
| `model_datamodel_verify` | Data models and migrations |
| `model_interleaving_scan` | Mines and routes concurrency, synchrony and async claims |
| `model_export` | Exports to an external checker (UPPAAL, TLA+, PRISM, SPIN) |
| `uml_structure_verify` | Dependency-graph audit, including a dependency matrix and multi-level refinement; give it `repoPath` and it builds the graph from each language's own import construct (C/C++, Python, TypeScript/JavaScript, Go, Rust, Java/Kotlin/Scala, C#, PHP, Ruby, Lua, Zig, Dart, Elixir) |
| `model_design_review` | Design review: the dependency graph's shape, plus the contracts the design declares about itself - layering, responsibility boundaries, substitutability, interface width |
| `model_edit` | Changes a model file by naming one change (add/remove a state, add/remove/update a transition, pointer set/remove): returns the structural diff and the difference in findings, so edit-verify-compare takes one call |
| `report_diff` | Compares two reports: what a change added, removed or changed |

`model_verify`, `model_datamodel_verify` and `model_design_review` also take `modelPath`: a JSON file in the workspace, in any formatting (indentation, a BOM and a trailing newline all parse). It is the alternative to an inline `model`; passing both is refused.

## Reading a report

What a tool returns is a report, and the outcome is in `verdict`: read `verdict`, never `ok`. `ok` carries a different historical meaning in each family — most set it to `true` for a failing review, and a composition sets it to `false` when any error-severity finding exists — so it cannot be read as a verdict, and reading it as one is how a reader concludes the opposite of what the report says.

| Field | Meaning |
|---|---|
| `verdict` | The outcome: `pass`, `pass_with_findings` or `fail` |
| `verdictReason` | One sentence saying why the verdict is what it is |
| `hashes` | `hashSpec` and `modelHash`; a regression also carries `beforeModelHash` and `afterModelHash`. The same model always hashes to the same value |
| `nextSteps` | What the engine suggests doing next |
| `schema` | The versioned report contract, for example `model-everything/verify/v1`. Branch on this field rather than on the shape of the payload |
| `truncated` | The search hit its ceiling and stopped. **A truncated search is not a pass**, it is no conclusion; a property that could not be decided appears as `_UNDECIDED` |

The body is what comes back by default. A truncated check can be expanded on its own: pass `check: "<id>"` and every finding of that check prints. For the whole structured result, pass `reportView: "full"` — compact JSON, no field lost.

When `ok` is `false` the verdict is `fail` as well, but it means something else: the tool did not run. The reason is in `errorCode` - invalid input, an unsupported diagram family, or a declared `intent` this view cannot serve. Such a refusal starts its `verdictReason` with `the tool did not run:`.

The method behind reading one of these has a home of its own: [`skills/model-everything-report-reading/`](skills/model-everything-report-reading/) gives the reading order (did it run, what did it decide, what next), where each family keeps its findings, and the two readings that are easy to get backwards. Its structure comes from a **generated mind map**: [`docs/report-reading/mindmap.mmd`](docs/report-reading/mindmap.mmd), and `tests/report-reading` fails when the map and the engines disagree.

`uml_render`, `uml_parse` and `uml_review` take one more field, `intent`, which says what the artifact is for: a human will read it (`present`), the verification engine has to read it back (`verify`), or the point is to prove the render matches the model (`fidelity`). A view that cannot serve the declared purpose is refused rather than drawn anyway.

## Examples

`examples/` holds sample models that run as they are, with [`examples/README.md`](examples/README.md) saying what each one shows and what to expect. They are documentation, not test fixtures — every suite reads its own `tests/<suite>/fixtures/`:

- `examples/order-state-machine.before.json` and `examples/order-state-machine.after.json`: two versions of an order flow, for the before/after regression.
- `examples/control-dispatcher.json`: a dispatch machine with budgets and paired lock actions, expected to report no errors.
- `examples/control-dispatcher.overbudget.json`: the same machine with a slower watchdog handler, expected to report one `A12_BUDGET_OVER` with the shortest over-budget path.
- `examples/ecommerce-data-model.json`, plus `examples/user-migration.before.json` and `examples/user-migration.after.json`: a data model, and a migration before and after.

```bash
model_verify model=examples/control-dispatcher.json
```

## Skills

The skills carry how to use the tools and what counts as evidence, split by domain:

| Skill | Covers |
|---|---|
| `model-everything` | Entry point: claim enumeration, verification discipline, depth rules, routing to the domain skills |
| `model-everything-uml` | UML diagrams: which view to pick, label conventions, review codes, what the fidelity check does and does not prove |
| `model-everything-structure` | Architecture and dependencies: writing the matrix, what each structural check means |
| `model-everything-datamodel` | Data models and migrations: invariants, coverage, rollback |
| `model-everything-design` | A design against its own declarations: layering, responsibilities against the dependencies they own, substitutability, interface width |
| `model-everything-interleaving` | Concurrency, synchrony and async claims: which can be proven, with which tool, and what only a runtime can see |
| `model-everything-report-reading` | Reading a report: the reading order, where the findings are, the two easy misreadings |

The descriptions are themselves the routing signal, and how much of one the model can see is capped: a catalog row is **truncated at 500 characters**, and the rest is never shown. Who owns which question, and what each row has to carry, is recorded in a generated map: [`docs/routing-map.md`](docs/routing-map.md), from `docs/tools/generate-routing-map.mjs`, with `tests/routing-map` failing when it drifts from the catalog.

## Install (dsh)

The plugin ships as a cordis bundle, declared by `dsh.bundle` in the root `package.json` and by `cordis.patch.yml`.

```bash
# from a source checkout (development)
dsh plugin --profile <profile> add "file:$PWD"
# the published version, from npm
dsh plugin --profile <profile> add dsh-model-everything
# without a global dsh
npx -p @deepseek-ai/dsh dsh plugin --profile <profile> add dsh-model-everything
```

Restart the profile afterwards; `dsh --profile <profile> --dump-config` should list this plugin. Remove it with the same plugin manager.

It registers its skills through the standard DSH filesystem skill provider and its tools on `ctx.tools`, plus one model-visible status entry that reports registration state and the model schema versions the bundled engines accept.

### Two components

| Component | Row id | Carries | Default |
|---|---|---|---|
| `dsh-model-everything` | `dsh-model-everything` | every tool and skill | on |
| Injected routing prompt | `dsh-model-everything-gate` | one routing message in the first model step of a session | on |

**Injected routing prompt** is the second component, switched on its own. It covers what text routing cannot: the catalog line is cut at 500 characters, and more to the point, a session that never decides to load a skill is never routed by anything.

It injects a message (about 3.2k characters) into the session. It carries four things: which skill to load when it is unclear which applies, what each skill answers, what each tool does **and what it does not prove**, and how to read a report (`verdict`, never `ok`; `skip` is not `pass`). **The rule - load the skill, do not answer from memory - is stated at the start and restated at the end.** That is measured, not stylistic: with one statement, a request the session believed it could answer itself (a migration) loaded no skill and ran no tool; stated at both ends, it did both, and a control task was not over-triggered.

Its shape borrows three techniques from a routing section another plugin in the same harness already injects:

- **Advertise only what is installed**: the skill table is rendered from the directories actually under `skills/`, so it cannot name a skill that resolves to nothing; a skill added without a row falls back to "see its catalog line", so the table can be incomplete but never wrong.
- **A chooser table, not a sentence list**: `| The request | The skill |`, because routing *is* an ordering between near-equals and a table reads as one.
- **A rule against degrading silently**: when a tool refuses, read its `errorCode` and fix the input; when a tool is not registered, say so and use the general method - **a check that nothing ran is not a passing check**.

How it works, in four sentences:

- **Where**: `agent/pre-step` - the message is appended to the decision of the session's **first** model step, not sent at session start, where it would land in an inbox a blank-session preset switch can clear;
- **Once**: the message carries its own producer source kind, and every step checks the session history for it; a gate dropped before any step ran reappears at the next step that does;
- **The switch**: `enabled` is a live field, so the Plugins-page toggle reaches a running host; `gateContent` is not live (a kilobyte of prose does not belong in a form) and is overridden in the profile's `cordis.patch.yml`; `extraGuidance` is a slot a deployment can append its own sentence to;
- **It routes only**: it checks nothing, and it cannot make a skill load.

**Default and switch**: on by default. That default was measured: it reaches the one request class the plugin otherwise never sees, and a control task was not over-triggered. The price is about 3.2k characters per session; turn it off in `cordis.patch.yml` (below) or with the Plugins-page switch, which is also how to run a comparison - the same request with the gate off and on.

## Configuration

The routing component (on by default) has three keys:

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `true` | Whether to inject. A live field: the Plugins-page toggle reaches a running host without a restart. |
| `gateContent` | string | the built-in text | The text to inject. Replacing it means writing your own routing rules; `tests/gate` still requires it to name every shipped skill. |
| `extraGuidance` | string | `""` | A sentence appended to the end of the message, for a deployment's own rule. |

The main row has one key, `interaction` (what happens when a tool call is offered; default `follow-approval`). Turning that row off is turning the row off, not a setting.

Write it into the profile's `cordis.patch.yml` by row id:

```yaml
# Override that row's config by id: the whole config is replaced, not merged.
# Do not add `name` here - a row with a name inserts a new row instead of changing this one.
- id: dsh-model-everything-gate
  config:
    enabled: false        # turn the injection off
```

## Boundaries

- **It does not own your code.** It reads what you point it at and reports conclusions with citations; the source is the authority.
- **Concurrency is half routing, half decision.** `model_interleaving_scan` finds the claims and names - by family - the tool that can settle them: threads to TSan/Helgrind/CBMC/TLA+, interrupts to RTOS-aware analysis, async to TLA+/UPPAAL plus a runtime check. **A shared location is no longer routed away**: give `model_compose_verify` the `shared` locations and both sides' `accesses` and it decides the unordered write (C4) and the non-atomic update, the lost update (C5) - a decision with a shortest-path witness on the model, not the name of a check. Source-level races, blocking calls, a missing `await` and whether a lock is held across the whole operation stay on the routing side.
- **A diagram review is not a code review.** A diagram that matches the model it was drawn from proves the drawing; the code still has to be checked against the source.

## Requirements

- Per-release install / mount / start / uninstall evidence is in [DSH-COMPATIBILITY.md](DSH-COMPATIBILITY.md).
- DeepSeek Harness: admission reads `peerDependencies` in `package.json` — that is what the plugin manager checks before installing — while `dsh.compatibility.dshReleases` only records what was measured. Per-release compatibility is a **measurement**; releases that were not measured are marked `unknown`.
- Node.js: `>=20`.
- No Python dependency and no network calls.

## Permissions and data

- At runtime it reads only the bundled `skills/` directory, to register the skills. It reads no credentials and makes no network requests.
- The tools work on the models, diagrams and paths you pass them; reports contain the conclusions and hashes it computed.
- Exporting to an external checker writes only the file you ask for.

## Troubleshooting

- **Skills are not visible**: check that the DSH version supports `ctx.skills` and Agent Skills discovery, and restart the profile after installing.
- **Tools are missing**: check `enabled` (it may be `false`) and that the plugin really installed (`--dump-config` lists its row).
- **The plugin manager refuses the install**: make sure `@deepseek-ai/*` packages are `peerDependencies`, not `dependencies`.
- **A diagram family was refused**: that is the design. Every one of the fourteen UML 2.5 diagram families has an implementation here, so a refusal is always about the notation: it cannot express that view, or it draws it without being able to read it back. The tool refuses by name with the reason instead of returning a wrong model.

## Development

```bash
npm install
npm run typecheck     # tsc --noEmit
npm run build         # tsc -> lib/ (lib/ is committed and must stay in step with src/)
npm run test:engine   # every regression suite, including the memory gate
npm run test:full     # end-to-end combined suite
npm run lint:md       # markdownlint, the same version CI pins
npm run bump -- <x.y.z>          # sync declared versions
npm run bump -- --check          # version consistency
npm run bump -- --audit          # version reference audit
```

The external-checker round trips (`tests/external/run.mjs`) invoke a real `spin` and `gcc` on the exported result. When a checker is not on `PATH` the whole group skips itself — a skip is not a pass. Point the suite at executables elsewhere with:

```bash
MODEL_EVERYTHING_SPIN=/path/to/spin MODEL_EVERYTHING_GCC=/path/to/gcc npm run test:engine
```

The plugin never calls `spin`, `gcc`, UPPAAL, TLA+ or PRISM itself: `model_export` writes the input they read.

Conventions, the directory map and the hard rules are in [AGENTS.md](AGENTS.md); project memory (research, architecture decisions, handover) starts at [.github/memory/MEMORY.md](.github/memory/MEMORY.md).

To contribute: the two kinds of report have different structures — **an improvement with a source** (cite the method, name the check code, say whether it changes a verdict or adds a signal, and bring the nearest case that must still pass plus a mutation that makes the new case go red) and **a problem while running it** (quote the report, give the smallest reproduction). See [CONTRIBUTING.md](CONTRIBUTING.md) and [.github/ISSUE_TEMPLATE/](.github/ISSUE_TEMPLATE/).

## References

The published work behind the checks — and which checks have none — is in [docs/references.md](docs/references.md). Every entry is **extracted verbatim** from a `Provenance` section in this repository (generator: `docs/references/generate.mjs`) with the file that cites it. The list exists to keep two things apart: a published method, and a convention of this repository's own. Most of the checks are the second, and dressing a convention as a citation is worse than saying it is one.

## License and security

MIT, see [LICENSE](LICENSE). Security policy in [SECURITY.md](SECURITY.md).

## Sponsor

This plugin is open source under the MIT license. If it saves you time, you can support development on [Afdian](https://afdian.com/a/amethystluna).

Sponsorship is voluntary and changes neither the license nor the features.

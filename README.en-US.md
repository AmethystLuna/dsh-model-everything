# Modeling / Automated Review for Designs and Code (dsh-model-everything)

<p align="center"><strong>English</strong> · <a href="README.md">中文</a></p>

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
| Concurrency | Mines concurrency claims (thread-safe, lock-free, ISR-safe) and routes each to a tool that can prove it. It proves nothing itself |
| Export | Exports a verified model as input for UPPAAL, TLA+, PRISM or SPIN |
| Reports | Report body rendering, baseline comparison (`report_diff`), hash specification |

## Typical uses

### A refactoring harness

A refactor may change the implementation. It may not change the behaviour. Let an engine settle that, instead of reading the diff:

1. **Before**: extract a BEFORE model from the code as it stands (`uml_parse` reads an existing diagram, or write the model against the schema).
2. **Refactor**.
3. **After**: extract an AFTER model.
4. **Regression**: `model_verify` with `beforeModel` and `stateMapping` runs D1-D4: behaviour preserved, invariants continuous, the state mapping consistent. On the data side, `model_datamodel_verify` runs DD1-DD4 from its `beforeModel`, `fieldMapping` and `migrationMappings`.
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
2. **Run the checks**: `model_verify` runs S1-S8 and A1-A14 - unreachable states, absorbing cycles, events silently ignored, an allocation with no recovery path, a budget overrun, a deadline that cannot be met.
3. **State the always/never claims**: put them in `invariants`. The engine searches every reachable state for a counterexample and returns the shortest one it finds.
4. **Reconcile with the source**: every error finding goes back to the code.

It does not prove concurrency safety; those claims are routed to TSan, CBMC or TLA+. Hard real-time semantics - deadlines and periods - are outside its scope as well.

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
| `model_compose_verify` | Two or more machines together: deadlock, and a rendezvous that never fires |
| `model_datamodel_verify` | Data models and migrations |
| `model_concurrency_scan` | Mines and routes concurrency claims |
| `model_export` | Exports to an external checker (UPPAAL, TLA+, PRISM, SPIN) |
| `uml_structure_verify` | Dependency-graph audit, including a dependency matrix and multi-level refinement |
| `report_diff` | Compares two reports: what a change added, removed or changed |

## Reading a report

What a tool returns is a report, and the outcome is in `verdict`: read `verdict`, never `ok`, which only says the tool ran.

| Field | Meaning |
|---|---|
| `verdict` | The outcome: `pass`, `pass_with_findings` or `fail` |
| `verdictReason` | One sentence saying why the verdict is what it is |
| `hashes` | `hashSpec` and `modelHash`; a regression also carries `beforeModelHash` and `afterModelHash`. The same model always hashes to the same value |
| `nextSteps` | What the engine suggests doing next |
| `schema` | The versioned report contract, for example `model-everything/verify/v1`. Branch on this field rather than on the shape of the payload |
| `truncated` | The search hit its ceiling and stopped. **A truncated search is not a pass**, it is no conclusion; a property that could not be decided appears as `_UNDECIDED` |

The body is what comes back by default. For the whole structured result, pass `reportView: "full"`.

When `ok` is `false` the verdict is `fail` as well, but it means something else: the tool did not run. The reason is in `errorCode` - invalid input, an unsupported diagram family, or a declared `intent` this view cannot serve. Such a refusal starts its `verdictReason` with `the tool did not run:`.

`uml_render`, `uml_parse` and `uml_review` take one more field, `intent`, which says what the artifact is for: a human will read it (`present`), the verification engine has to read it back (`verify`), or the point is to prove the render matches the model (`fidelity`). A view that cannot serve the declared purpose is refused rather than drawn anyway.

## Examples

`examples/` holds sample models that run as they are, with [`examples/README.md`](examples/README.md) saying what each one shows and what to expect. They are documentation, not test fixtures — every suite reads its own `tests/<suite>/fixtures/`:

- `examples/order-state-machine.before.json` and `examples/order-state-machine.after.json`: two versions of an order flow, for the D1-D4 regression.
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
| `model-everything-concurrency` | Concurrency claims: which can be proven, and with which tool |

## Install (dsh)

The plugin ships as a cordis bundle, declared by `dsh.bundle` in the root `package.json` and by `cordis.patch.yml`.

```bash
# from a source checkout (development)
dsh plugin --profile <profile> add "file:$PWD"
# from npm once published
dsh plugin --profile <profile> add dsh-model-everything
# without a global dsh
npx -p @deepseek-ai/dsh dsh plugin --profile <profile> add dsh-model-everything
```

Restart the profile afterwards; `dsh --profile <profile> --dump-config` should list this plugin. Remove it with the same plugin manager.

It registers its skills through the standard DSH filesystem skill provider and its tools on `ctx.tools`, plus one model-visible status entry that reports registration state and the model schema versions the bundled engines accept.

## Configuration

| Key | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `true` | Whether this plugin registers its tools. |

Override it by row id in the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-model-everything
      name: 'dsh-model-everything'
      config:
        enabled: false
```

## Boundaries

- **It does not own your code.** It reads what you point it at and reports conclusions with citations; the source is the authority.
- **Concurrency is routing only.** `model_concurrency_scan` finds the claims and names the tool that can settle them.
- **A diagram review is not a code review.** A diagram that matches the model it was drawn from proves the drawing; the code still has to be checked against the source.

## Requirements

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

## License and security

MIT, see [LICENSE](LICENSE). Security policy in [SECURITY.md](SECURITY.md).

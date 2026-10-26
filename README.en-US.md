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

## Specialised in modelling review for medium-to-large, medium-to-high-complexity projects

This tool does one thing: it turns what a project claims about behaviour, structure and data into a model,
runs it, and returns a conclusion that can be recomputed - not a paragraph that reads like one.

**The scale it specialises in is the medium-to-large, medium-to-high-complexity project**: tens of
thousands of lines, hundreds of files, protocols and state machines that cross modules. At that scale one
decision replaces dozens of reads, and the fixed cost of the skill body and the tool definitions is
amortised; the ratio we measured falls to 0.93x-1.11x there.

It hands back three things:

- a conclusion that can be **recomputed**: hashes, `verdict`, citations;
- a **counterexample path**: the steps or the event sequence that breaks the claim;
- a **portable model**: the same conclusion can be handed to UPPAAL, TLA+, PRISM or SPIN for a second
  opinion.

**What it specialises in deciding is the small model a person has already abstracted**: state machines,
finite-word automata, data models and migrations, design declarations, dependency graphs. When a model is
too large to enumerate, it reports `truncated` and names the undecided check; reducing the model (dropping
variables the property does not read, collapsing symmetric states), or handing that model to SPIN for
partial-order reduction, NuSMV for symbolic search, CBMC for bounded SAT, carries the question further.

## Report cards

A report still prints in full, and gains a card where the UI can render one. The card is not a second
conclusion: it is the same computation, arranged for a reader.

- **The verdict first**, then the first finding, then the next step;
- **A diff keeps two questions apart**: what this change added, and what the current report decides on its
  own - they differ exactly when a clean change lands on an already-failing report;
- **A design review keeps three levels apart**: a violation decides the verdict, a signal is a structural
  fact, a fact is a measurement;
- **A concurrency scan** says it routed the claims and **proved none of them**;
- Without a card the raw text is what shows, so an unsupported UI loses nothing.

A card **saves no tokens**: the model still gets the full text.

## What it covers

| Domain | What it does |
|---|---|
| Claim checking | Enumerates the verifiable claims in a design, spec or review comment. Checks each against the code with a citation, and says plainly which ones it could not settle |
| Behaviour | State machines and protocols: structural checks, adversarial probes, budgets and deadlines, before/after regression. Composition checks catch deadlock and a rendezvous that never fires. Finite-word automata decide language relations - equivalence, inclusion - and return the shortest witness word |
| Diagrams | UML 2.5 diagram families: render, parse and modelling review (including the render→parse fidelity check), in Mermaid and PlantUML |
| Structure | Component, package, class and deployment diagrams audited as dependency graphs: isolated nodes, dangling endpoints, cycles, matrix and layer violations, missing required edges |
| Data | Data models and migrations: structure, migration coverage, copy consistency, rollback symmetry, before/after data regression |
| Concurrency / synchrony / async | Mines claims about how work is executed (thread-safe, locks, interrupts, async/await, the event loop) and routes each to a tool that can decide it. It proves nothing itself |
| Export | Exports a verified model as input for UPPAAL, TLA+, PRISM or SPIN |
| Reports | Report body rendering, baseline comparison (`report_diff`), hash specification. Every report also carries a summary for a UI - verdict, the first finding, the next step - while the model still gets the full text |
| Architecture visualisation | Draws a source directly (the drawable Mermaid / PlantUML subset), measures its structure against budgets, and compares two designs by containment. Parent/child grouping is first-class: nested boundaries, folding, light and dark palettes, and a sidebar whiteboard |

## Architecture visualisation

Drawing is not decoration here; it is how a design gets read. Three questions, kept apart because they are
different questions:

| You want | Tool | It answers | It does not answer |
|---|---|---|---|
| The source drawn | `diagram_render` | What the drawing looks like | Whether the system it draws is right |
| Whether the drawing is too dense | `diagram_review` | How wide each boundary is, how deep they nest, how many nodes | Whether those boundaries should exist |
| What changed between two designs | `diagram_diff` | Which boundary appeared, vanished, was renamed or re-parented, and which component changed owner | Whether the change is an improvement |

**Parent/child grouping is first-class.** Mermaid `subgraph` and PlantUML `package` both read as boundaries,
boundaries nest, and the layout stacks a group's members inside it and wraps a parent around its children -
because a layered diagram whose members float outside their package is not showing containment at all. Clicking a
boundary folds it into one box and clicking again unfolds it; folding is a transform on the model, not a mode of
the painter, so the edges re-aim at the box.

**A line it cannot draw is refused with its line number.** Sequence diagrams, class diagrams, Gantt charts, the
`click`/`classDef` directives and PlantUML's `actor`/`note` are all refused by line. A sequence diagram that
quietly lost its lifelines looks complete, and that is worse than no drawing.

**Light and dark follow the page.** The rendered background decides which palette is used, and four schemes are
available (`default`, `github`, `high-contrast`, `print`); the surface is painted inside the SVG, so a re-skinned
container cannot change a picture's contrast. The right sidebar carries a whiteboard tab as well: paste a source,
get the drawing, with no tool result involved.

It **does not prove the design is right**: a tidy drawing is a readable model, and the judgement stays with
`model_verify` and `uml_structure_verify`.

## Typical uses

Each one says what to hand over, which field to read, and what the tool does not do.

### A refactoring harness

1. Extract the **BEFORE** model; keep the old schema for the data side.
2. Refactor.
3. Extract the **AFTER** model.
4. `model_verify` with `beforeModel` and `stateMapping`; `model_datamodel_verify` with `fieldMapping` for data.
5. `report_diff` against the baseline report: **a newly added error is the reason to reject the refactor**.

It compares two models, not two codebases. It reads no diff, changes no code, runs no test.

### A state machine or a flow

1. Hand the diagram to `uml_parse`, or write the model against the schema.
2. `model_verify` runs the structural checks and the adversarial probes: unreachable states, absorbing cycles, silently ignored events, budgets, deadlines.
3. Put the always/never claims into `invariants` and get the shortest counterexample path back.
4. For the drawing alone, `uml_review`: are the branches exhaustive, is there a dead end.
5. Every error finding goes back to the code; fixing the model is `model_edit`, which returns the structural diff and the change in findings in one call.

**A correct drawing is not correct code** - that step belongs to the extraction.

### Auditing a dependency graph

1. Hand over a diagram, or a `repoPath` and let `uml_structure_verify` build the graph from the source.
2. Optional matrix: `layers` plus `rules`.
3. Read the findings: cycle, isolated node, dangling endpoint, layer violation, missing required edge. When the parser reports **label drift**, `uml_explain_labels` prints the spellings that notation accepts.

**Facts belong here, rules do not**: whether an edge exists is this tool's question; whether it was allowed is `model_design_review`.

### A design held to its own declarations

1. Write the design and the rules it declares as a `DesignModelV1`.
2. `model_design_review` reports three lists: `violations` decide the verdict, `signals` are signals, `facts` are measurements.
3. A check with nothing to hold the design to is `skip`, not `pass`.

It judges no design **by an external standard**. It asks whether the design holds to what it says about itself.

### Two machines that must cooperate

1. Model each one, hand the array to `model_compose_verify`.
2. Put the handshakes that need both sides ready into `rendezvous`.
3. Read C1 (a node no machine can advance from) and C2 (a rendezvous that never fires), each with a per-machine reason and, for C1, the shortest counterexample.

A question about one machine alone goes back to `model_verify`. There is no rate ratio and no fairness in a composition.

### Concurrency claims: mine, then route

1. `model_interleaving_scan` reads a document and reports absolute claims by `family` (thread-safe, lock-free, ISR-safe ...).
2. Each one names the analysis that decides it: TSan or Helgrind, CBMC, TLA+, RTOS-aware analysis.
3. This plugin **runs none of them** and proves nothing about concurrency.

A clean scan is not a clean bill of health: it says no claim was found.

### A migration: two models, one assertion

1. A data model before and after.
2. `fieldMapping`; `migrationMappings` for a field whose source is not its own old name.
3. `model_datamodel_verify` checks migration coverage, copy consistency, rollback symmetry, and the before/after data regression.
4. `DS2_REQUIRED_FIELD_UNSOURCED` is a **warning**: it is a decision for you, not a failure the engine can announce.

### Language inclusion: two automata

1. Write the specification and the implementation as automata: `states`, `alphabet`, `transitions`, `accepting`.
2. `model_automaton_verify` with `other` and `relation` (`equivalent`, `subset` or `superset`).
3. When the relation fails you get the **shortest witness word** - accepted by one, rejected by the other, replayable through both.

Finite words only. Liveness, fairness and timing need a Büchi or timed automaton, which this family does not build.

### Diagrams as source: freeze and iterate

1. `uml_render` writes Mermaid or PlantUML source; `uml_parse` reads it back into a model.
2. Commit the source, the model and the report of that run together, as the design record at a point in time.
3. On the next change, re-extract, re-run, and compare with `report_diff`.
4. For a second opinion, `model_export` writes UPPAAL, TLA+, PRISM or SPIN input.

What is kept is the **source file**; a rendered image is a by-product.

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
| `model_automaton_verify` | Finite-word automata: empty language, trap states, reachability, and the equivalence or inclusion relation against another automaton, with the **shortest witness word** when it fails |
| `model_edit` | Changes a model file by naming one change (add/remove a state, add/remove/update a transition, pointer set/remove): returns the structural diff and the difference in findings, so edit-verify-compare takes one call |
| `report_diff` | Compares two reports: what a change added, removed or changed |
| `diagram_render` | Source text to SVG: the drawable subset of Mermaid (flowchart, stateDiagram) and PlantUML (component, package, state). Layout, paint and output are all computed here; optionally writes a file and takes a colour scheme. A line it cannot draw is **refused with its line number**, never half-drawn |
| `diagram_review` | Structural budgets: how wide each boundary is, how deep they nest, how many nodes the drawing holds. Every finding names its group, and the report also prints **what it measured**, so "nothing to check" cannot read as "checked and clean" |
| `diagram_diff` | Structural difference between two drawings: boundaries added, removed, renamed or re-parented, and nodes that changed owner. It says what moved, never whether the move is better |

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
# the published version, from npm: pin it
dsh plugin --profile <profile> add dsh-model-everything@<version>
# without a global dsh
npx -p @deepseek-ai/dsh dsh plugin --profile <profile> add dsh-model-everything@<version>
```

**Why pin it.** Right after a release, an unpinned install resolves the previous version: the mirror's
`latest` lags, and pnpm's `minimumReleaseAge` refuses a version that was published minutes ago. With the
version named, the dsh installer records the exception in the profile's `minimumReleaseAgeExclude` itself;
check the result with `--dump-config` and the installed copy's `package.json`.

Restart the profile afterwards; `dsh --profile <profile> --dump-config` should list this plugin. Remove it with the same plugin manager.

It registers its skills through the standard DSH filesystem skill provider and its tools on `ctx.tools`, plus one model-visible status entry that reports registration state and the model schema versions the bundled engines accept.

### Two components

| Component | Row id | Carries | Default |
|---|---|---|---|
| `dsh-model-everything` | `dsh-model-everything` | every tool and skill | on |
| Injected routing prompt | `dsh-model-everything-gate` | one routing message in the first model step of a session | on |
| Drawing | `dsh-model-everything-diagram` | the three drawing tools, and the diagram whiteboard in the right sidebar | on |

**Drawing** is the third component, kept apart on purpose: it carries no engine, so the two rows above can be
off and it still draws. A deployment that only wants its Mermaid sources drawn installs the same package and
enables this row alone.

The whiteboard is a tab in the right sidebar: paste a source, get a drawing. It scales, switches colour scheme
(`default`, `github`, `high-contrast`, `print`), follows the page's light or dark surface, and folds a group into
one box when you click it. It reads no tool result at all, which is why a change on the tool side cannot break
it.

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

# AGENTS.md

Agent and contributor guide for **dsh-model-everything**: a DeepSeek Harness plugin for
modeling abstraction and automated review, in place of reasoning an answer out. It abstracts what a design or a piece of code
claims into a model, then reviews that model and the code it came from: UML diagrams
(render, read, review), executable verification of machines and protocols, data-model and
migration checks, concurrency claim routing, external-checker export, dependency-graph
review, and report diffing - and a refactoring harness, because a refactor may change the
implementation but not the behaviour: extract a model before and after, run the regression,
and diff the two reports.

This file is the single source for how to work in this repository. There is no second
host guide: this plugin has exactly one host.

## What this repository is

- **One host: dsh.** The plugin is a single cordis bundle: skills, tools, and the engine they
  run on. A capability is answered here or not at all.
- **The documentation is the guidance.** A capability has to be discoverable through its own
  tool description or skill text: doctrine and per-domain detail live in the skills.
- **Tool surface.** Each tool does one job and takes only the parameters that job needs.
  The UML diagram families are read from the engine's table (`UML_DIAGRAMS`), so adding a
  family is an engine-table plus family-module change and touches no tool schema. Keep it
  that way: open for extension, closed for modification.
- **Reports are contracts.** Every result carries a versioned `schema` and a `verdict`.
  Read `verdict`, never `ok`: `ok` carries a per-family historical meaning - most families set
  it `true` for a failing review, a composition sets it `false` when an error finding exists -
  so it cannot be read as a verdict. Reading it as one is how a reader concludes the opposite
  of what the report says.

## Layout

| Path | What lives there |
|---|---|
| `src/engine.ts` | The verification engine: S1-S8 structural checks, A1-A14 adversarial probes, D1-D4 regression, verdict/hash contract, `REPORT_SCHEMAS` |
| `src/uml-syntax.ts` | The notation syntax engine: notation table, the UML 2.5 family table with each notation's fidelity, the capability decision, detection, and the lexical primitives |
| `src/uml.ts` | The machine families (state, activity, sequence) and the family registry that dispatches to modules |
| `src/uml-usecase.ts`, `src/uml-structure.ts` | Family modules: their model, renderer, parser and review findings |
| `src/structure.ts`, `src/granularity.ts` | Dependency-graph review and multi-level refinement |
| `src/data-engine.ts`, `src/concurrency.ts`, `src/exporters.ts`, `src/baseline.ts`, `src/report-view.ts` | The other domains and the report plumbing |
| `src/*-tool.ts`, `src/index.ts` | The dsh tool wrappers and the plugin entry that registers skills and tools |
| `skills/` | The shipped skills, one directory each, discovered by the standard filesystem provider |
| `tests/` | One directory per suite, plus `tests/memory` for the memory gate. [tests/AGENTS.md](tests/AGENTS.md) carries the test methodology: read it before adding or changing a suite |
| `.github/memory/` | Project memory: research findings, architecture decisions, handover |
| `lib/` | Build output; committed, and must stay in step with `src/` |

## Commands

```bash
npm install
npm run typecheck        # tsc --noEmit
npm run build            # tsc -> lib/
npm run test:engine      # every regression suite, including the memory gate
npm run test:full        # end-to-end combined suite
npm run bump -- <x.y.z>  # sync versions across declared manifests
npm run bump -- --check  # all declared manifests agree
npm run bump -- --audit  # no stale version references
```

Before committing: `npm run build` then `git diff --exit-code -- lib`. A change to
`src/` that is not reflected in `lib/` fails CI.

## Trying a build in a real profile

The suites decide whether the engine is right. Only a mounted profile decides whether the
plugin is **reachable**, and that path has two traps, both met while testing this plugin:

- **A re-install over an existing `file:` dependency does nothing.** pnpm treats the
  directory as already satisfied and re-links it without re-copying, so the profile keeps the
  previous build while the command reports success. Remove the bundle, then install it:
  `plugin_manager` with `action: remove_bundle` on the package name, then `install_bundle`
  with the `file:` spec.
- **The running process keeps the module it already imported.** Node's ESM cache cannot be
  invalidated in-process, so a re-mounted plugin continues to serve the old code - the loader
  row is live, the files on disk are new, and the tools answer from the previous build. A
  profile restart is what makes it take effect. The two are worth telling apart before
  debugging anything: `import` the installed `lib/` path from a fresh `node` process and call
  the tool's `execute`. If the fresh process and the running tool disagree, the process is
  stale and nothing about the code is wrong.

A re-install also prints a `Packages:` line that reports removals as it prunes; the plugin and
its neighbours survive it, but that line is not a signal that the copy was refreshed.

## Writing rules

These apply to every file this repository ships or publishes.

Where a change begins: [docs/feature-checklist.md](docs/feature-checklist.md) is the order to do things
in, and [docs/principles.md](docs/principles.md) is the index of what this repository believes and where
each belief is stated.

- **Short sentences, one idea each.** The reader does not have the author's context.
- **No brittle counts.** Never write how many tools, skills, checks or families exist; a
  release changes the number and the sentence silently becomes wrong. Name the capability.
  `tests/skills/run.mjs` holds this line for shipped text.
- **One job per file.** A tool description says what the tool does. A `SKILL.md` carries
  doctrine and routing. `references/*.md` carries per-domain detail. The README tells the
  human story. State a fact in one place and point at it from everywhere else.
- **No dangling pointers.** Every path, flag, command and tool a file names must exist.
  A named command no artifact implements is worse than no mention.
- **Say what it does not prove.** Every scope claim needs its non-goal beside it, plus the
  route to whatever does cover that ground.
- **Descriptions stay factual.** What the plugin does, not why it is wonderful.
- **Bilingual pairs move together.** `README.md` and `README.en-US.md` change in one commit.

## Memory

`.github/memory/` is the project memory, entered at [MEMORY.md](.github/memory/MEMORY.md):
the root lists categories, each `INDEX-<category>.md` lists topics, and the topic files
carry the content. Every topic file needs frontmatter (`name`, `description`,
`metadata.type`), and a new topic needs a row in its category index — the gate reads the
categories from disk, so there is no list to keep in sync by hand.

`tests/memory/run.mjs` enforces: index coverage, root coverage, links that resolve inside
the tree, frontmatter, index rows with a when-to-read column, and desensitisation — no
absolute paths, no scratch directories, no `file://` links, no credential-shaped tokens,
no email addresses. Memory is committed, so treat it as documentation: write what a
future reader needs to act, not a transcript.

## Release

- **Version policy**: patch for fixes, docs, dependency and CI changes; minor for new
  features or new checks; major for breaking changes. Never bump because something
  changed. Every release names its target: `npm run bump -- <x.y.z>`.
- **Compatibility is measured, never assumed.** `dsh.compatibility.dshReleases` gains a
  release only after a round on it (install, mount, offline checks, uninstall). Until a
  release has been measured it stays `unknown`. The rounds themselves are recorded in
  [DSH-COMPATIBILITY.md](DSH-COMPATIBILITY.md) — one row per release, with what was
  established and what was not.
- **Tags move only on explicit instruction.** Moving a published tag is a force push.
- The checklist is in [RELEASE.md](RELEASE.md).

# DSH Compatibility Evidence — dsh-model-everything

Evidence for the DSH STORE fixed-Commit contract: per-release install / start /
uninstall verification of this plugin's native dsh bundle against the DSH
releases listed in `dsh.compatibility.dshReleases`. The two sibling plugins file
the same evidence the same way; this is the copy for this package.

## Environment

| Item | Value |
|---|---|
| Host | Windows 11 (x64), build 19045 |
| Node.js | v24.17.0 |
| npm | 11.13.0 |
| pnpm | 11.21.0 (rounds of 2026-10-16) · 11.28.5 (rounds of 2026-10-18, the host's current pnpm) |
| Test date | 2026-10-16 (ten-release sweep) · 2026-10-18 (0.2.1-rc.2: mount, tool list, live scan) · 2026-10-18 (the published 0.1.0 artifact) |
| Package under test | `dsh-model-everything` 0.1.0 (bundle patch `cordis.patch.yml`, entry ids `dsh-model-everything` and `dsh-model-everything-gate`); published as `dsh-model-everything@0.1.0`, npm shasum `27687378…`, integrity `sha512-1Aai9…` |

## Method (one disposable dsh tree per version)

Every row installed its **own** dsh release into its own directory
(`npm i @deepseek-ai/dsh@<version>`, about 611 packages) and ran against a fresh
`DSH_HOME` under that same scratch root, so no state leaked between versions and
the host's real `~/.dsh` was never touched. `DSH_HOME` is set explicitly on every
command; the dsh on `PATH` is not used. Every row but the last two ran from the
working tree; those two installed the published artifact - once as a tarball, once
by name from the registry (see "The published artifact" under Results).

Seven steps per row:

```bash
# 1) the runtime the peer ranges are checked against
dsh --version

# 2) install as a file: dependency into a fresh profile
dsh plugin --profile scratch add "file:<this-repo>"

# 3) the composed tree carries the plugin's row, enabled, and the gate row
dsh --profile scratch --dump-config

# 4) the package contents are what the bundle promises
#    7 skills with SKILL.md, locale/{en,zh}.json, gate/package.json + gate/locale/*,
#    lib/gate.js, lib/index.js

# 5) start: headless boot with a deliberately invalid API key.
#    Expected: the whole tree loads and the app reaches the model-provider stage,
#    failing only with AUTH for the fake key; no plugin load error.
DEEPSEEK_API_KEY=fake-key-for-boot-test dsh --profile scratch "reply OK"

# 6) a real call from the installed copy (see the two pnpm facts below)
#    model_verify on the installed examples/control-dispatcher.json, then
#    model_interleaving_scan on an async paragraph from the 2026-10-18 rounds

# 7) uninstall; the row is gone from --dump-config and the copy is gone
dsh plugin --profile scratch remove dsh-model-everything
```

Two properties of a `file:` install make step 6 fiddly, and both are pnpm's rather
than this plugin's: the linked copy has no `node_modules` of its own, and its
`peerDependencies` are resolved by the host's loader tree, which a plain `import`
does not consult. The probe therefore runs from the dsh tree and lends the copy the
`@deepseek-ai` scope through a junction, removed again on the way out.

## Results

| dsh release | date | install | mount row | contents | boot to AUTH | real call from the copy | uninstall |
|---|---|---|---|---|---|---|---|
| 0.1.7-alpha.2 | 2026-10-16 | pass | pass | pass | pass | pass (`model_verify`) | pass |
| 0.1.7-rc.1 | 2026-10-16 | pass | pass | pass | pass | pass | pass |
| 0.1.7-rc.2 | 2026-10-16 | pass | pass | pass | pass | pass | pass |
| 0.2.0-rc.1 | 2026-10-16 | pass | pass | pass | pass | pass | pass |
| 0.2.0-rc.2 | 2026-10-16 | pass | pass | pass | pass | pass | pass |
| 0.2.1-alpha.1 | 2026-10-16 | pass | pass | pass | pass | pass | pass |
| 0.2.1-alpha.2 | 2026-10-16 | pass | pass | pass | pass | pass | pass |
| 0.2.1-alpha.3 | 2026-10-16 | pass | pass | pass | pass | pass | pass |
| 0.2.1-alpha.4 | 2026-10-16 | pass | pass | pass | pass | pass | pass |
| 0.2.1-alpha.5 | 2026-10-16 | pass | pass | pass | pass | pass | pass |
| 0.2.1-rc.2 | 2026-10-18 | pass | pass (gate row `enabled: true`) | pass | pass | pass (`model_verify` + `model_interleaving_scan`) | pass |
| 0.2.1-rc.2 | 2026-10-18 | pass | pass (`enabled: true`) | pass | pass | pass (`model_interleaving_scan`, 5 findings) | pass |
| 0.2.1-rc.2 | 2026-10-18 | pass (by name, `^0.1.0`) | pass | pass (same bytes) | pass | pass (`model_verify` → `pass`) | pass |

The last two rows are **the published artifact**. The first installed the tarball
`npm pack` produced; the second let the profile resolve `dsh-model-everything` from
the registry, which is what a reader does. `npm publish` reported the same shasum
(`27687378…`) and integrity (`sha512-1Aai9…`) the tarball round measured, so the
bytes exercised and the bytes on the registry are the same.

Everything either round touched came out of the package: the installed copy carries
the seven skills, `locale/`, `gate/`, `lib/` and `cordis.patch.yml`, its
`package.json` says `0.1.0` and names `AmethystLuna` as author, and the sha256 of
each installed file equals the one inside the tarball.

The real call in the tarball round was `model_interleaving_scan` on a paragraph
about an async handler, and it doubles as the regression evidence for the async
vocabulary: the report came back `fail` with five findings, including
`CONCURRENCY_KEYWORD:warning:await@L1` for the word "awaiting". The same text
yielded four findings before that form was matched - the defect this release fixes,
measured from the installed copy rather than from the source.

Ten rows from the 2026-10-16 sweep, run by the parameterised `compat-round.ps1` and
`sweep-versions.ps1` harness in the scratch task directory; the 0.2.1-rc.2 row was
re-run three times on 2026-10-18 as the artifact changed (the tool rename, the
interleaving scan's five families, and the gate's default). Every row installed
without `dsh plugin allow-version`, so no version exemption was involved.

## The 0.2.0 artifact

`dsh-model-everything` 0.2.0 is on npm as `latest`. npm reports integrity
`sha512-AUyBpywxk0FJmjtzIYxyg21FlfF8wLN+ZFfJmBkr86/0TZMbfsUtyH/6AXw09VDL+kso8ePiCL0kJp08Bw1xQw==`
and shasum `fe385a5d67687b051b9c50d2c31e351e19920305`, the same values `npm pack`
produced, so the bytes below are the published ones.

Measured 2026-10-21 on dsh `0.2.1-rc.2`, installed as `file:<packed tarball>` into a
fresh `DSH_HOME`:

| Step | Result |
|---|---|
| install | pass (`dsh plugin --profile headless add`, 917ms, no version exemption) |
| mount row | pass — both rows, the gate row with `enabled: true` |
| contents | pass — the installed copy reports `0.2.0` |
| real call from the copy | pass — `model_verify` with `modelPath` returns `verdict: pass`, `checksRun: 6`; the same model inline returns `pass`; `check: "S1"` prints that check |
| uninstall | pass — `--dump-config` carries no row afterwards |

Not repeated for this artifact: the headless boot to AUTH, and an install by package
name from the registry. The identity with the published package rests on the
integrity match above, not on a second install. The nine evaluation sessions that
exercised this code are recorded in the project memory, not here: they ran against a
copied build, so they are evidence about the behaviour, not about the artifact.

## Notes that are properties of the harness, not of this plugin

- **A profile created by `plugin add` is base-only.** It contains the base bundle
  and this plugin, so a bare `dsh --profile scratch "reply OK"` waits forever
  instead of booting. The rc.2 rounds added the shipped `@deepseek-ai/dsh-headless`
  app to the same disposable profile and booted that; the hang is reproducible on
  0.2.1-rc.2 and is not caused by this plugin. The version matters: the `latest`
  tag of `@deepseek-ai/dsh-headless` is `0.0.1-rc.1`, which 0.2.1-rc.2 rejects as
  incompatible, so the round names `@deepseek-ai/dsh-headless@0.2.1-rc.2`.
- **pnpm prints a peer warning for a `file:` install** ("Issues with peer
  dependencies found"): the linked copy resolves its peers from the host tree, not
  from the profile. The round confirms that this is a warning, not an admission
  refusal: `--dump-config` lists the row and `plugin allow-version` is never needed.
- **0.1.7-alpha.1 is not installable as published** (npm resolves that batch's peer
  ranges into a conflict), which is why the sweep starts at 0.1.7-alpha.2. That is
  a property of that release's packaging, not of this plugin.
- **0.2.1-rc.1 was not measured for this plugin.** It is absent from
  `dsh.compatibility.dshReleases` rather than assumed: the two sibling plugins
  measured it, this one did not.

## Round: 0.3.0 on 0.1.7-rc.2

- **What ran**: `compat-round.ps1` - install through the profile's package manager, `--dump-config`,
  the packaged skills and locale files, a headless boot with a deliberately invalid API key, a real
  report from the installed copy, then uninstall.
- **Result**: row present and enabled; fourteen tools registered; the automaton family answered from
  the installed copy (verdict `pass`, schema `model-everything/automaton/v1`); the row was gone after
  uninstall.
- **What it does not establish**: a live model session (the boot stops at AUTH), the loader tree beyond
  `--dump-config`, and any surface other than headless.
- **One thing to carry forward**: the row id is `dsh-model-everything`, not the bundle's short name. A
  round invoked with `-Row model-everything` reports `ROW MISSING` while the plugin is mounted and
  working, so read that line against `cordis.patch.yml` before believing it.

## Round: 0.4.0 on 0.1.7-rc.2

- **What ran**: `compat-round.ps1` - install through the profile's package manager, `--dump-config`, the
  packaged skills, a headless boot with a deliberately invalid API key, a real report from the installed
  copy, then uninstall; and afterwards a **pinned install from the registry** (`dsh-model-everything@0.4.0`)
  in a fresh home, which is the release's own confirmation that the artifact is published.
- **Result**: row present and enabled, fourteen tools registered, the automaton family answered from the
  installed copy (`verdict = pass`, schema `model-everything/automaton/v1`), the row gone after uninstall.
  The registry install reported 0.4.0 and the installer recorded its own `minimumReleaseAgeExclude` entry.
- **What it does not establish**: a live model session (the boot stops at AUTH), the loader tree beyond
  `--dump-config`, and any surface other than headless.

## Round: 0.2.1-rc.3

- **What ran**: `compat-round.ps1` against `0.2.1-rc.3` - install through the profile's package manager,
  `--dump-config`, the packaged skills, a headless boot with a deliberately invalid API key, a real report
  from the installed copy, then uninstall.
- **Result**: row present and enabled, fourteen tools registered, the automaton family answered from the
  installed copy (`verdict = pass`, schema `model-everything/automaton/v1`), the row gone after uninstall.
- **Why it mattered**: 0.4.0 had been published with a compatibility table that stopped at `0.2.1-rc.2`.
  A release that claims compatibility it never measured is the same defect as a report that claims a check
  it never ran, so 0.4.0 was withdrawn and the table was completed before the next publish.
- **What it does not establish**: a live model session (the boot stops at AUTH), the loader tree beyond
  `--dump-config`, and any surface other than headless.

## What is not established

- Loader-level composition beyond `--dump-config`: the probe mounts the installed
  entry into its own `Context`, not through the dsh loader.
- A live model session: the boot stops at AUTH, before any agent step, so the
  skill catalog and the gate's `agent/pre-step` injection were not exercised in a
  session on these rows.
- The `web` profile and any non-headless surface.
- **A bare `npm install`.** Both artifact rounds installed through the profile's own
  package manager (`dsh plugin add`), which is the documented install path; a plain
  `npm i dsh-model-everything` outside dsh was not run.
- **`0.2.1-rc.1` for this package.** It is absent from `dshReleases` because no
  round ran on it; an entry there is a claim about a round, not an inference from
  the neighbouring releases.

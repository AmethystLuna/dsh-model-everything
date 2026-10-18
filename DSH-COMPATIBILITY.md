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
| Test date | 2026-10-16 (ten-release sweep) · 2026-10-18 (0.2.1-rc.2: mount, tool list, live scan) |
| Package under test | `dsh-model-everything` 0.1.0 (bundle patch `cordis.patch.yml`, entry ids `dsh-model-everything` and `dsh-model-everything-gate`) |

## Method (one disposable dsh tree per version)

Every row installed its **own** dsh release into its own directory
(`npm i @deepseek-ai/dsh@<version>`, about 611 packages) and ran against a fresh
`DSH_HOME` under that same scratch root, so no state leaked between versions and
the host's real `~/.dsh` was never touched. `DSH_HOME` is set explicitly on every
command; the dsh on `PATH` is not used. The rounds ran from the working tree, not
from a published tarball: this package has no npm release yet (see "What is not
established").

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

Ten rows from the 2026-10-16 sweep, run by the parameterised `compat-round.ps1` and
`sweep-versions.ps1` harness in the scratch task directory; the 0.2.1-rc.2 row was
re-run three times on 2026-10-18 as the artifact changed (the tool rename, the
interleaving scan's five families, and the gate's default). Every row installed
without `dsh plugin allow-version`, so no version exemption was involved.

## Notes that are properties of the harness, not of this plugin

- **A profile created by `plugin add` is base-only.** It contains the base bundle
  and this plugin, so a bare `dsh --profile scratch "reply OK"` waits forever
  instead of booting. The rc.2 rounds added the shipped `@deepseek-ai/dsh-headless`
  app to the same disposable profile and booted that; the hang is reproducible on
  0.2.1-rc.2 and is not caused by this plugin.
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

## What is not established

- Loader-level composition beyond `--dump-config`: the probe mounts the installed
  entry into its own `Context`, not through the dsh loader.
- A live model session: the boot stops at AUTH, before any agent step, so the
  skill catalog and the gate's `agent/pre-step` injection were not exercised in a
  session on these rows.
- The `web` profile and any non-headless surface.
- **The published artifact.** Every row ran on the working tree. Once the package
  is published, this file gains a round that installs the npm release and repeats
  the seven steps; until then `dsh.compatibility.dshReleases` records what the
  working tree measured.

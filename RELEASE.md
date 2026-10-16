# Release Checklist

Top to bottom. The bundle is the only part that ships code; the rest is skills, manifests and docs.

## Version policy

Strict semver. **Patch** for fixes, docs, dependency bumps and tooling; **minor** for new
features, new checks or new diagram families; **major** for anything breaking - a renamed
tool, a changed report contract, a moved schema. Never bump because something changed, and
always name the target version.

## 0. Pre-flight

- [ ] `git status` is clean, and the release commit is on the branch you mean to ship
- [ ] `npm ci`
- [ ] `npm run bump -- <x.y.z>`
- [ ] `npm run bump -- --check && npm run bump -- --audit`
- [ ] `npm run typecheck`
- [ ] `npm run build && git diff --exit-code -- lib` (the committed build matches the source)
- [ ] `npm run test:engine`
- [ ] `npm run lint:md`
- [ ] `README.md` and `README.en-US.md` still say the same thing

## 1. Mount check, in an isolated home

Point `DSH_HOME` at a throwaway directory. Never test a mount against the real one.

The mounting `dsh` must satisfy the ranges in `peerDependencies`; the admission
check reads those and nothing else. `dsh --version` names the runtime the check
compares against, so run it first.

```bash
dsh --version                                          # must satisfy the peer ranges
dsh plugin --profile scratch add "file:$PWD"
dsh --profile scratch --dump-config                    # expect this plugin's row, enabled: true
```

- [ ] the session catalog lists the bundled skills
- [ ] the plugin status entry reports the tools as registered
- [ ] one real call returns a report (for example `model_verify model=examples/control-dispatcher.json`)
- [ ] the scratch profile and the scratch `DSH_HOME` are removed afterwards

A round that covers all of this end to end, for any `file:` install, is the `compat-round.ps1`
harness in the `model-everything-mount` task directory under the scratch root (adapted from
the logicprobe round): install, `--dump-config`, the packaged `skills/` and `locale/`, a
headless boot with a deliberately invalid API key, **a real report from the installed
copy**, and an uninstall. Two facts about a `file:` install make that fifth step fiddly, and
both are properties of pnpm rather than of this plugin: the linked copy has no `node_modules`
of its own, and its `peerDependencies` are resolved by the host's loader tree, which a plain
`import` does not consult. The harness therefore runs the probe from the dsh tree and lends
the copy the `@deepseek-ai` scope through a junction, removed again on the way out.

## 2. Compatibility

**The runtime version is the gate; the declaration is not.** `dsh.engines.dsh`,
`dsh.category`, `dsh.displayName` and `dsh.compatibility` (including
`dshReleases`) have no reader in dsh: what admits or refuses a plugin is
`evaluatePluginCompatibility` over `peerDependencies`. So a release is made
installable by widening those ranges, and it is measured by mounting, not by
editing the declaration.

- [ ] the mount round above ran on a dsh release you can name
- [ ] that release is inside the `peerDependencies` ranges, and the mount was made without `dsh plugin allow-version`
- [ ] `package.json` `dsh.compatibility.dshReleases` records it as `compatible`; a release that was not measured stays `unknown`
- [ ] the memory hands any new evidence on: a version bump resets the older claims

## 3. Publish

- [ ] push, and wait for CI: `dsh-bundle` (Node 20 and 22, committed-`lib` drift guard, every suite, markdownlint) and `Plugin Security Scan`
- [ ] `npm publish`
- [ ] install the published artifact into a scratch `DSH_HOME`, mount it, run one report, uninstall it
- [ ] tag `vX.Y.Z` and push the tag - only on explicit instruction

## 4. Housekeeping

- [ ] the [open-work list](.github/memory/history/open-work.md) reflects what shipped; finished items are gone
- [ ] `npm run bump -- --audit` is clean
- [ ] release notes say what changed for a reader, not which commits landed

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
- [ ] `npx --yes markdownlint-cli@0.42.0 --ignore "**/node_modules/**" .`
- [ ] `README.md` and `README.en-US.md` still say the same thing

## 1. Mount check, in an isolated home

Point `DSH_HOME` at a throwaway directory. Never test a mount against the real one.

```bash
export DSH_HOME=/path/to/a/new/scratch/dsh-home
dsh plugin --profile scratch add "file:$PWD"
dsh --profile scratch --dump-config          # expect this plugin's row, enabled: true
```

- [ ] the session catalog lists the five skills
- [ ] the plugin status entry reports the tools as registered
- [ ] one real call returns a report (for example `model_verify model=examples/control-dispatcher.json`)
- [ ] the scratch profile and the scratch `DSH_HOME` are removed afterwards

## 2. Compatibility

- [ ] the mount round above ran on a dsh release you can name
- [ ] `package.json` `dsh.compatibility.dshReleases` records that release; a release that was not measured stays `unknown`
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

# Evaluations

What this directory is: the corpus and the results of every measurement round, kept so the numbers a
document cites can be re-derived rather than trusted. The interpretations live in
[`.github/memory/design/`](../.github/memory/design/); this directory holds the data.

Nothing here ships: `package.json` lists what the npm package carries, and `evals/` is not in it.

## Layout

| Path | What it holds |
|---|---|
| `corpus/*.yml` | One case per file: the prompt, the assertions, and the rubric the judge applies |
| `corpus/fixtures/<case>/` | The workspace seeded for that case - the repository, and the model or diagram it asks about |
| `results/README.md` | Every round's numbers, with the condition and the trial count |

## Running a round

The runner is not in this repository: it drives a real `dsh` process per trial and lives outside the
package. What a round needs from the corpus is the case file and its fixture, in the shape above:
`name`, `prompt`, and an `assert` block with `turn_end`, `max_steps`, `max_tokens` and an
`output_judge.rubric`.

Two conditions matter, and both are needed for a comparison to mean anything:

- **A**: the agent with no plugin installed.
- **C**: the plugin installed, with its gate injection on.

Run each case three times per condition. One trial is not a measurement: the same corpus produced
149k, 157k and 153k across three single runs of one case, against a three-trial median of 40k.

## What the corpus currently covers

- **A stratum** - claims a careful read settles: two state-machine fixtures with documentation claims.
- **B stratum** - seeded defects with green tests and a false documentation claim, including two that
  only appear when modules are composed (a counter split across two modules, a lost update behind two
  different lock keys).
- **Structural** - the plugin's own `src/`, asked three dependency questions whose answers a static
  scan decides.

The results file states what each round found, including the rounds that refuted the hypothesis.

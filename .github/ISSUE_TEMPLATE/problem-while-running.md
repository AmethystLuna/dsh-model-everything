---
name: A problem while running it
about: A tool answered something you believe is wrong, refused something it should accept, crashed, or did not stop.
title: ''
labels: bug
---

<!--
The guide behind this form is CONTRIBUTING.md. The short version: a report is a claim about a model,
so quote it rather than summarising it, and strip your input until removing anything makes the effect
go away.
-->

## The exact call

The tool name and the full arguments object, as you sent it.

```json
{ "tool": "", "arguments": {} }
```

## What you got

Quote the fields rather than describing them.

- `verdict`:
- `verdictReason`:
- finding codes, verbatim:
- `schema`:
- the version you ran:

```text
paste the report, or the part of it that matters
```

## What you expected, and why

The rule, source or reasoning that says the answer should differ.

## The smallest input that shows it

Strip your model or diagram until removing anything makes the effect go away. That boundary is
usually the report.

```text
the smallest model, diagram or arguments that still show it
```

## Anything else

- Is it stable or intermittent? A report is deterministic by contract, so "sometimes" is itself
  worth stating.
- Did anything else happen — a refusal where a report was expected, a raw error with no code to
  route on, the process dying, a search that did not stop?

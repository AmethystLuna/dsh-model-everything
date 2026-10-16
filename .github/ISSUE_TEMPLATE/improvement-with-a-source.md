---
name: An improvement with a source
about: You have a paper, standard or documented algorithm that says a check should work differently, or you found a defect in how a judgement is computed.
title: ''
labels: enhancement
---

<!--
The guide behind this form is CONTRIBUTING.md. If the change is also a behaviour problem, file that
first: a method proposal is easier to judge once the behaviour it would change is agreed.
-->

## The source

The published method, with its year and venue, and the passage you read it from.

- Citation:
- Where in it:
- Is this a published method or a house convention of this repository? The reference files separate
  the two in their provenance sections; 4 of 10 carry one today.

## Which check changes

- The code, e.g. `DES1_CYCLE`:
- The reference file that documents it:
- Does it change a **verdict** or add a **signal**? Only the violation level decides a verdict; a
  check that is useful but not decisive belongs at signal level.

## What it still does not decide

Every check here states its own non-goal beside its scope claim. What is out of scope for this one?

## What it comes with

- **The nearest case that must still pass.** Take the shape that must trigger it, then put one
  condition right and require silence.
- **A mutation that makes the new case go red.** Which line of the engine, and what the broken
  version does.
- **The far side of the tradeoff**, if there is one — precision bought with runtime, or completeness
  bought with memory.

## Anything else

Does this change a report's shape, a code's severity, or a document that ships? Those have their own
consequences, and saying so up front gets the proposal judged faster.

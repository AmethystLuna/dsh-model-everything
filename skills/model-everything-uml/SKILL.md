---
name: model-everything-uml
description: "Use when drawing a code flow as UML or auditing a diagram someone drew: parse a hand-drawn state, activity, timing, profile or composite structure diagram, render a model, and check round-trip fidelity. A component, class, object, package or deployment diagram goes to the model-everything-structure skill; an entity-relationship diagram is not a UML family and is refused, with the reason. Doctrine: the model-everything skill."
---

# Model Everything — UML Modelling

A diagram is a model, and a model can be wrong. A tidy flow chart is not evidence about the code, and a diagram that disagrees with its own model is worse than no diagram, because a reader will believe it.

This skill covers the diagram half of this toolbox. The claim-verification doctrine it inherits — enumerate verifiable claims, cite `file:line`, read `verdict` and never `ok` — lives in the `model-everything` skill; load that one when the task is to verify behaviour rather than to draw or audit a diagram.

## When This Skill Applies

| The task involves… | What it does |
|---|---|
| Modelling a code flow as a state, activity or sequence diagram | `uml_render`: model to diagram source, with a citation per state, event, guard and action |
| Reading a hand-drawn diagram back into a model | `uml_parse`: Mermaid or PlantUML state/activity text into a LogicModelV1 that `model_verify` can check |
| Auditing a diagram somebody drew | `uml_review`: structural defects, documentation gaps, and render-versus-model round-trip fidelity |
| Printing what the parser accepts for labels and comments | `action=explain-labels`: the accepted label spellings, the form the renderer writes, and which lines are ignored |
| A diagram whose claims must be tied to the code | Every element needs a source citation; the review says what the diagram says, not whether the code is correct |

Pipeline (DSH):

```text
code flow → model (citation per element) → uml_render → diagram source
          → uml_review → modelling findings + round-trip fidelity
          → model_verify           → behaviour (S1-S8 structural, A1-A14 adversarial)
```

- **render** — model to diagram. Mermaid covers the state, activity, sequence and `interaction-overview` families. PlantUML covers the state, sequence, timing, profile, composite structure, communication, class, object, package, component and deployment families. Any construct the notation cannot carry becomes a warning, never a silent drop. PlantUML activity is refused instead of approximated, and a family the notation only approximates is drawn with an `UML_RENDER_APPROXIMATE_VIEW` warning that names what the picture cannot say.
- **parse** — diagram to model. It reads Mermaid and PlantUML state or activity text, so a hand-drawn diagram can be verified like any other model. A PlantUML timing diagram is read as its own model (lifelines, states over time, messages, duration constraints), and a composite structure or communication diagram reads back exactly (nesting and port direction; lifelines, links and the numbered messages). Inputs are refused with the reason when they cannot reconstruct a model: a sequence diagram (a trace cannot reconstruct a machine), a profile (an extension and a generalization are the same arrow), an interaction overview (a flowchart node names an interaction rather than being one), an entity-relationship diagram (not a UML 2.5 family), a different Mermaid family (`classDiagram`, `erDiagram`, `gantt`, `mindmap`, …). Each comes back with its `errorCode` and, where the diagram carried constructs that were dropped, the construct named. The body carries the model it read (`MODEL`) and how it read the text (`PARSE`), and each note the parser made is a finding — a note that changed the verdict but appeared in no roster read as "nothing was reported".
- **review** — it answers one of three questions. Give it a model: is the machine well-modelled? Give it a diagram: what does the diagram say? Give it both: does the diagram match the model?
- **explain-labels** — the parser's own account of labels and comments: the accepted spellings, the form the renderer writes, and which lines it ignores. No diagram needed. It answers "why does my hand-drawn diagram report drift or ignored lines?" without reading the source.

The view follows the question, not the machine, and no tool picks it for you. Declare the question with `intent` (`present` / `verify` / `fidelity`) and a view that cannot serve it is refused before any work, with a code that names why. The ordered procedure, the intent-by-action table and those codes are under [Choosing the view](references/uml-modeling-guide.md#choosing-the-view).

A host without the tools runs the same four actions through the repository engine. The engine is deliberately single-source — do not copy it into this skill.

## A Structure Diagram Is the Dangerous Case, Because It Parses

PlantUML component, package, class and deployment diagrams declare no diagram kind, so the parser meets their keywords line by line. It still returns *something* — the arrows look like transitions — so `parse` reports the by-product model **plus** an error finding `UML_NOT_A_STATE_DIAGRAM`, the declarations it could not represent in `discardedConstructs` (with line and text), the arrows that were misread in `discardedEdges`, and `verdict: "fail"`.

Read that as: **there is no model of this file; the diagram was not checked.** Do not feed that model to `model_verify` and call the result a review of the architecture, and do not present a component diagram as evidence about dependencies. A structure diagram has its own reviewer: the `model-everything-structure` skill and the `uml_structure_verify` tool parse the same text into a real dependency graph and check isolated nodes, dangling endpoints, cycles, allowed-dependency and layer violations (`UML020`-`UML026`). Use that one when the question is *where the dependencies point*.

Mermaid families with an explicit header (`classDiagram`, `erDiagram`, `gantt`, …) are refused outright, because an empty model would be worse than no model.

## What the Review Reports

Structural defects: unreachable states, dead ends, ambiguous or non-exhaustive branches, self-loops with no exit, duplicate transitions. Documentation gaps: a missing narrative, unbounded variables, states the reader cannot map back to code, and label drift between diagram and narrative. It also runs the fidelity check — any structural difference between the diagram and its model is `UML017_ROUND_TRIP_MISMATCH`.

## Rules for This Mode

1. **A diagram is not evidence.** Every state, event, guard and action needs a citation. Use `file:line` for code and a section reference for a document. Present the citations with the diagram.
2. **Review before you present.** Run `uml_review` and fix the error findings first. An ambiguous or dead-ended diagram misleads every later reader.
3. **Check the verdict before the picture.** `ok: true` with `verdict: "fail"` means the review failed; a diagram whose review failed is not something to show as if it were checked.
4. **The review never replaces verification.** It covers the modelling. S1-S8 and A1-A14 cover the behaviour, and each finding names the check that settles it — hand those over to the `model_verify` skill.
5. **Keep the narrative with the model.** Write `narrative.states`, `narrative.events` and `narrative.scenarios`. Then the diagram stays readable against the code, and label drift shows up as a finding instead of as a stale picture.
6. **Name a finding for the reader, not by its code.** `UML017_ROUND_TRIP_MISMATCH` is a report field; the sentence the reader gets says what disagreed (「图里少了 ERROR→COOLDOWN 这条迁移」), in their language. Keep the code for a report field quoted verbatim, a diff or a test name. The full rule is under "Writing the Answer" in the `model_verify` skill.

The full checklist (codes `UML001` to `UML019` plus `UML_NOT_A_STATE_DIAGRAM`), the directive format generated diagrams carry, a worked example, and the limits of each view are in [`references/uml-modeling-guide.md`](references/uml-modeling-guide.md).

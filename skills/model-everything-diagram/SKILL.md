---
name: model-everything-diagram
description: "Use when drawing a diagram from its source text or checking its structure: Mermaid and PlantUML subsets, structure budgets, and containment diffs. Every line it cannot draw is refused by number. The drawing proves layout, not design. Doctrine: the model-everything skill.""
---

# Model Everything — Drawing

A drawing is how a design is read, and a drawing that quietly drops a lifeline is worse than no drawing, because
it looks complete. This skill covers the drawing half: it renders the subset it can actually draw, refuses the rest
**by line**, measures the structure against budgets, and compares two drawings by what contains what.

The doctrine it inherits — say what a result does and does not prove, read `verdict` and never `ok` — lives in the
`model-everything` skill. Load that one when the question is whether a design is *correct*; load this one when the
question is what the picture shows.

## When This Skill Applies

| The task involves… | What it does |
|---|---|
| "draw this mermaid", "render this PlantUML", "make a diagram of this flow" | `diagram_render`: source text to SVG, laid out and painted here, with `out` to write a file and `scheme` for the palette |
| "is this diagram too dense", "how deep do the packages nest" | `diagram_review`: group width, nesting depth and node count against budgets you set, plus **what it measured** |
| "what changed between these two diagrams", "did this package move" | `diagram_diff`: boundaries added, removed, renamed or re-parented, and nodes that changed owner |
| A source in a notation the plugin does not draw | Refused with the line number; `diagram_render` still draws everything else and reports what it skipped |
| A label with a hard line break, or one too long for its box | `<br>`, `<br/>` and a real newline end a line; anything longer than the drawing's line width wraps. The box is sized from the lines it draws, and edge labels move clear of boxes rather than printing on top of them |
| A diagram already in a file, to link from a document | `diagram_render` with `out`, then link the SVG |

## The two notations, and where each one stops

| Notation | Drawn | Refused by name |
|---|---|---|
| Mermaid | `graph`/`flowchart` (TD/TB/LR), node shapes `[..]`, `(..)`, `{..}`, `((..))`, `[(..)]`, `[[..]]`, `<<..>>`; edges `-->`, `---`, `-.->`, `==>`, labels `-->\|text\|` and `-- text -->`; `stateDiagram`/`-v2` with `[*]` start and end markers and `state "text" as id`; `subgraph … end` including nesting | `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt`, `pie`, `journey`, `mindmap`, `timeline`, `quadrantChart`, `gitGraph`, `C4Context`, and the `click`/`style`/`classDef` directives |
| PlantUML | `component`, `package`, `node`, `folder`, `cloud`, `database`, `state`, `artifact`, `rectangle` blocks and `[bracketed]` components; `-->`, `--->`, `..>`, either direction, `: label`; `[*] -->` start markers; `skinparam`/`!theme` ignored | `actor`, `participant`, `usecase`, `class`, `object`, `note`, `legend`, and the `alt`/`opt`/`loop`/`par` fragments |

A refusal is one line in `refused`, phrased `line N: …`. The drawing you get does not show the refused lines, and
the tool says so rather than leaving you to notice.

## What the structure review reports

| Code | Severity | What it means |
|---|---|---|
| `B1_GROUP_TOO_WIDE` | error | A boundary holds more direct children than the budget. A package with twenty boxes has stopped reading as a package. |
| `B2_TOO_DEEP` | error | Nesting past the budget. Beyond three levels a reader needs the source, not the picture. |
| `B3_EMPTY_GROUP` | error | A boundary with nothing drawable inside it: it claims a containment the drawing cannot show. |
| `B4_SINGLE_MEMBER` | warning | A boundary around one thing. Often a layer that was never split, sometimes exactly right. |
| `B5_TOO_MANY_NODES` | error | The whole drawing past its node budget. |
| `D0_NO_SOURCE` | error | Nothing to review. |

`measured` is printed next to `findings` on purpose: an empty finding list from a source that never parsed would
otherwise read as a clean bill of health.

## What the diff reports

| Code | Kind | What changed |
|---|---|---|
| `H1_GROUP_ADDED` | info | A boundary that did not exist, saying what contains it when it is nested |
| `H2_GROUP_REMOVED` | info | A boundary that is gone |
| `H3_GROUP_RENAMED` | info | Same id, different text |
| `H4_GROUP_MOVED` | warning | A boundary that changed parent, both sides named |
| `H5_NODE_ADDED` / `H6_NODE_REMOVED` | info | A node that appeared or disappeared |
| `H7_NODE_REGROUPED` | warning | A node that changed which group holds it |
| `D1_SIDE_UNREADABLE` | error | One side produced no drawing, so there was nothing to compare |

A rename is only a rename when the id survived. A vanished id beside a new one is an unrelated removal and
addition, because the ids are what a caller tracks across versions.

**It judges movement, not merit.** Whether a component belongs in its new package is the reader's call; the diff
reports that the move happened and nothing more.

## The whiteboard

The right sidebar has a **Diagram** tab: paste a source, get the drawing. It scales to the pane, switches colour
scheme (`default`, `github`, `high-contrast`, `print`), follows the page's light or dark surface, and folds a group
into a single box when you click it. It reads no tool result, so it keeps working whatever changes on the tool side.

## What this does not do

- **It does not verify behaviour.** A drawing of a machine says nothing about whether the machine is safe; that is
  `model_verify` on the model the drawing came from.
- **It does not read a diagram back into a model.** `uml_parse` does that for the families it owns.
- **It does not audit dependencies.** `uml_structure_verify` reads a component diagram as a dependency graph and
  judges the edges; `diagram_review` only measures the shape.
- **It does not draw everything.** A notation outside the subset above is refused by line; a picture that looks
  complete and quietly lost half its arrows is the failure this whole subset exists to avoid.

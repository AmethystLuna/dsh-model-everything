---
name: model-everything-diagram
description: "Use when drawing a diagram from its source text, showing one to a reader, or checking its structure: Mermaid and PlantUML subsets, structure budgets, and containment diffs. Reach for it when an explanation is clearer shown than told - a layout, a flow, a change - and put the picture beside the explanation. Every line it cannot draw is refused by number. The drawing proves layout, not design. Doctrine: the model-everything skill."
---

# Model Everything — Drawing

A drawing is how a design is read, and a drawing that quietly drops a lifeline is worse than no drawing, because
it looks complete. This skill covers the drawing half: it renders the subset it can actually draw, refuses the rest
**by line**, measures the structure against budgets, and compares two drawings by what contains what.

The doctrine it inherits — say what a result does and does not prove, read `verdict` and never `ok` — lives in the
`model-everything` skill. Load that one when the question is whether a design is *correct*; load this one when the
question is what the picture shows.

## Draw to explain, not to decorate

A reader takes a layout, a flow, a boundary and a change between two of them from a picture. So the trigger
is not the phrase "draw" — it is an answer that has that shape: reach for `diagram_render` when the
explanation would otherwise spell out positions and connections in prose, and put the drawing beside the
explanation rather than in place of it.

| Where the reader sees it | What it shows | How it starts |
|---|---|---|
| the file you wrote | the SVG at full size, kept next to the document it belongs to | `diagram_render` with `out`, then hand the file over with `present` |
| the card in the conversation | the drawing, redrawn from the call's own source, with the refused lines under it | nothing to do: the card is keyed to `diagram_render` and appears where the call was |
| the whiteboard tab | any source, editable and zoomable, with the colour schemes | the reader opens the tab and pastes; it holds none of the session's data |

The reader can point at a node and send a note from the whiteboard or from the call's card. It arrives as an
ordinary message that starts `Diagram annotation · node "…"`, and that is what it is: the reader marking one
node of that drawing and saying something about it. Answer the node, not the whole picture.

Before a drawing goes in front of a reader, run `diagram_review`: a picture that needs scrolling is no
longer a summary. When you present one, say what it shows — the layout, not whether the design is right.

## When This Skill Applies

| The task involves… | What it does |
|---|---|
| "draw this mermaid", "render this PlantUML", "make a diagram of this flow" | `diagram_render`: source text to SVG, laid out and painted here, with `out` to write a file and `scheme` for the palette |
| "is this diagram too dense", "how deep do the packages nest" | `diagram_review`: group width, nesting depth and node count against budgets you set, plus **what it measured** |
| "what changed between these two diagrams", "did this package move" | `diagram_diff`: boundaries added, removed, renamed or re-parented, and nodes that changed owner |
| A source in a notation the plugin does not draw | Refused with the line number; `diagram_render` still draws everything else and reports what it skipped |
| An edge whose straight line would cross a component | Routed around it on a sparse grid (candidate lines from each box edge, A* with a bend penalty), so a line never reads as a connection that is not there |
| A batch of arrows into one component from the same side | Drawn as the arrows it is: one port and one line each, the ports spread along the side. Lines are never merged into a shared run - PlantUML does not merge them either, and one drawn line cannot carry two statement kinds without saying something the source did not |
| A label with a hard line break, or one too long for its box | `<br>`, `<br/>` and a real newline end a line; anything longer than the drawing's line width wraps. The box is sized from the lines it draws. An edge label is drawn on its edge - centred on the middle of the edge's longest straight run, over a mask in the page colour - and slides along that run to clear a box, another label or another edge's line |
| A diagram already in a file, to link from a document | `diagram_render` with `out`, then link the SVG |

## The two notations, and where each one stops

| Notation | Drawn | Refused by name |
|---|---|---|
| Mermaid | `graph`/`flowchart` (TD/TB/LR), node shapes `[..]`, `(..)`, `{..}`, `((..))`, `[(..)]`, `[[..]]`, `<<..>>`; edges `-->`, `---`, `-.->`, `==>`, labels `-->\|text\|` and `-- text -->`; `stateDiagram`/`-v2` with `[*]` start and end markers and `state "text" as id`; `subgraph … end` including nesting | `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt`, `pie`, `journey`, `mindmap`, `timeline`, `quadrantChart`, `gitGraph`, `C4Context`, and the `click`/`style`/`classDef` directives |
| PlantUML | `component`, `package`, `node`, `folder`, `cloud`, `database`, `state`, `artifact`, `rectangle` blocks and `[bracketed]` components; `-->`, `--->`, `..>`, either direction, `: label`; `[*] -->` start markers; `skinparam`/`!theme` ignored | `actor`, `participant`, `usecase`, `class`, `object`, `note`, `legend`, and the `alt`/`opt`/`loop`/`par` fragments |

**Draw your own cards in PlantUML.** A `package`/`component` block states containment in the source, and `as` gives a
node a short alias to name in edges, so a reader can check the grouping against the text that produced it. Mermaid
stays supported - a flow someone else wrote still draws - but a new diagram this plugin authors is written in
PlantUML. Both notations go through the same layout engine, so the choice changes the spelling of the source, not
the drawing rules - and **neither notation's direction keyword changes the layout**: Mermaid's `LR` and PlantUML's
`left to right direction` are read and dropped, because there is one layout, top to bottom.

A refusal is one line in `refused`, phrased `line N: …`. The drawing you get does not show the refused lines, and
the tool says so rather than leaving you to notice.

A third answer sits between drawn and refused. A **layout control** - `left to right direction`, `skinparam`,
`scale`, `hide`, `!pragma layout`, `together` - asks a layouter to arrange the drawing, and this renderer is the
layouter: the line is understood, has no effect, and is reported in `ignored`. So a control that looks like it did
nothing did nothing, and you are not left guessing whether it was dropped or obeyed.

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

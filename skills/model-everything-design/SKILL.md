---
name: model-everything-design
description: "Use when a design has to keep its own declarations: does the layering hold, do responsibilities match the dependencies they own, can a subtype stand in for its supertype, is an interface wider than its callers. Also reports the graph's shape (cycles and the fewest edges to break them, load-bearing elements, ranks, fan-in/out) without judging the design. A drawing of an architecture audited against a matrix is model-everything-structure. Doctrine: the model-everything skill."
---

# Model Everything — Design Review

A design makes claims about itself: which layer may depend on which, which responsibility owns
which dependency, which subtype may stand in for its supertype. Those claims are checkable, and
this skill is about checking them — plus the shape of the graph they are drawn on.

The claim-verification doctrine it inherits — cite evidence, read `verdict` and never `ok` —
lives in the `model-everything` skill. Load that one for behaviour (state machines, protocols,
timing) and `model-everything-structure` for a dependency diagram audited against a matrix.
Load this one when the question is whether the *design* keeps its own declarations.

## The One Rule That Matters Here

**This review compares a design against what the design declares. It never says a design is
good.**

Every finding is one of three things, and the report keeps them apart:

| Level | What it means | Decides the verdict? |
|---|---|---|
| **violation** | The design contradicts something it declared. `DES1`, `DES2`, `DES3`, `DES5`, `DES6`, `DES7`, `DES9` | Yes |
| **signal** | A structural fact, reported without claiming it is wrong. `DES4`, `DES8`, `DES10`, `DES11` | No — it is a warning |
| **fact** | A count or computed structure, in `facts` | No |

A layer is a declaration. If the design declares three layers and one edge runs from the
first to the third, that is not a style opinion: the declaration is contradicted, and `DES2`
says so. If instead the design declares layers and one node carries every dependency, the
report says *that node is load-bearing* and stops there, because whether it should be is a
question about the design that no model can answer.

The same line applies to the principles. `DES7` reports that a subtype refuses an event its
supertype declares it handles, which is a strengthened precondition and contradicts the
inheritance the model states (Liskov & Wing, *A Behavioral Notion of Subtyping*, TOPLAS 1994).
It does not report that the hierarchy is badly designed.

## When This Skill Applies

| The task involves… | What it does |
|---|---|
| "Is the layering right", "does anything reach across a boundary", "where are the tangled parts" | `DES1`-`DES6` over the declared layers, boundaries and required edges |
| "Does this follow single responsibility", "tag each module's responsibilities" | `DES10` compares the declared responsibilities with the declared dependencies; see the warning below |
| "Is this interface too fat", "ISP", "does every caller need all of it" | `DES8` unused operations, `DES9` client groups that share no operation |
| "LSP", "can this subtype replace its base", "is the contract preserved" | `DES7` over `extends`, `transitions`, `forbids` and operation signatures |
| "Is this abstraction depending on details", "DIP" | `DES11` |
| A dependency graph whose structure matters more than its rules | `facts`: ranks, fan-in/out, components, density, cyclomatic complexity, mutually reachable groups |

## What It Checks

| Code | Level | What it means |
|---|---|---|
| `DES1_CYCLE` | violation | A dependency cycle. Reported with the fewest edges whose removal makes the graph acyclic - an exact minimum for small cyclic parts, and an upper bound past that, with `facts.feedbackArcsExact` saying which - plus the largest mutually reachable group. |
| `DES2_LAYER_ORDER` | violation | An edge that skips a declared layer, an upward edge, or a node two layers both claim. |
| `DES3_BOUNDARY_LEAK` | violation | An edge across a declared boundary that no `allowedEdges` rule permits. Deny beats allow. |
| `DES4_LOAD_BEARING_ELEMENT` | signal | An articulation point (removing it disconnects the graph) or a bridge (the only edge joining its two sides). |
| `DES5_UNDECLARED_NODE` | violation | A node in no declared layer and no declared boundary. |
| `DES6_MISSING_REQUIRED_EDGE` | violation | A `requiredEdges` entry the architecture does not have. |
| `DES7_LSP_CONTRACT` | violation | A subtype refuses an event its supertype handles, or an inherited operation changes arity. A differing guard text is a warning: two strings cannot decide whether a precondition was strengthened. |
| `DES8_ISP_UNUSED_OPERATION` | signal | An interface operation no client in this model calls. |
| `DES9_ISP_DISJOINT_CLIENTS` | violation | An interface called by client groups that share no operation: two interfaces wearing one name. |
| `DES10_RESPONSIBILITY_GAP` | signal | A dependency no declared responsibility owns, a responsibility owning nothing, or one dependency claimed by two responsibilities. |
| `DES11_CONCRETE_DEPENDENCY` | signal | A type declared `interface`/`abstract-class` depending on a declared concrete class. |

## `skip` Is Not `pass`

A check with nothing to hold the design to reports `skip` and is listed in
`facts.checksSkipped`. A design that declares no layers cannot violate a layer order — and
reporting that as a pass would read as "this design's layering was verified". It was not.

The same applies to the principle checks, because each needs vocabulary the model must supply:

| Check | Needs | Without it |
|---|---|---|
| `DES7` | `transitions` or `forbids` on a type, and `extends` | No behavioural contract is stated, so nothing to compare |
| `DES8`, `DES9` | `interface` types with `operations`, and `uses` naming what each client calls | No caller list, so "unused" cannot be decided |
| `DES10` | `responsibilities` with `uses` | No tags, so nothing to compare the dependencies against |
| `DES11` | A declared `interface`/`abstract-class` and a declared concrete type | Nothing is declared abstract, so inversion is not a question |

An empty vocabulary is not a pass. It is a design that declared nothing for those checks.

## On Responsibility Tags

Tagging a type with its responsibilities is what makes `DES10` possible, and it is worth being
exact about what it decides. `DES10` compares two declarations the model makes — the
responsibility list and the dependency list — and reports where they disagree. It cannot say
whether a responsibility is the right one, whether two responsibilities belong together,
whether a name is honest, or whether the code implements the split. A tag list that matches the
dependencies is a *consistent* declaration, not a *good* one, and the report says so.

## What This Review Does Not Prove

- **It reviews a model, not code.** Whether the code obeys the model is the extractor's
  question. Reconcile with a source-side scan.
- **LSP is decided only where the contract is stated.** Behavioural substitutability in general
  is not decidable from a design; `DES7` decides the declared fragment — refused events,
  operation arity, guard text that differs. A subtype that is substitutable in the model may
  still violate its base in the implementation.
- **Guard comparison is textual.** Two guard strings that differ are reported for a reader to
  judge, because whether the difference strengthens or weakens a precondition is not decidable
  from the strings.
- **`DES4` is about the graph, not the design.** A gateway layer is supposed to be a node
  everything routes through; the point of the finding is that the design did not say so.
- **The edge count is a minimum only where it says so.** A minimum feedback arc set is NP-hard
  (Garey & Johnson, 1979). `DES1` decides it exactly by subset search while the cyclic part is
  small, and past that limit reports the edges a canonical peel cannot remove - an upper bound.
  `facts.feedbackArcsExact` is the flag, and the wording of the finding follows it.
- **Complexity numbers are counts, not judgements.** `facts.cyclomatic` is McCabe's `E - V + 2P`
  over the dependency graph; a high number is a fact about the graph.
- **This is not topology.** Ranks, articulation points, bridges and mutual reachability are
  combinatorial graph properties. Persistent homology and Betti numbers have no established
  reading for a dependency diagram, and this plugin does not compute them.

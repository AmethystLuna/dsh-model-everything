# Architecture views, hierarchy, and conformance

The doctrine behind the design-time and as-is modes: what an architecture description is, why a level
tree is the unit a reviewer reads, and how a drawing is reconciled with code. Per-domain concerns are in
`architecture-domains.md`; the checks themselves live in the tools.

## A view is what a reader acts on

An architecture is not one picture. It is a set of **views**, each answering one stakeholder's question,
and each written against a **viewpoint** that fixes what may appear in it. That framing is standardised
in ISO/IEC/IEEE 42010:2011 and predates it in practice: Kruchten's 4+1 model made the point that
logical, process, development and physical views are all "the architecture" and none of them is the
whole.

Two consequences for this plugin:

- **A report is a view.** A dependency graph, a state machine and a data model are three views of the
  same system, and a verdict about one is not a verdict about the others.
- **The reader is fixed.** A view written for the architect who must decide is short and about
  consequences; a view written for the team who must implement is longer and about interfaces. The
  architecture-description literature keeps these apart deliberately — Clements et al. organise the
  whole of *Documenting Software Architectures* around choosing the view for the audience, and Rozanski
  and Woods write a viewpoint catalogue for exactly that reason.

Simon Brown's C4 model is the pragmatic version most working architects actually use: four zoom levels
(context, container, component, code), each one a different audience. It is not a formal method, and it
does not claim to decide anything — which is precisely the gap this plugin fills.

## Why hierarchy is not an optional feature

Herbert Simon's *The Architecture of Complexity* (1962) is the argument: complex systems are
**nearly decomposable**, and their subsystems interact far more strongly internally than across
boundaries. That is why a level tree is how people describe and review them, and why a flat graph of a
large system is not a simplification but a different, less useful object.

The hierarchy literature supplies the semantics that makes a parent/child pair checkable rather than
decorative:

- **UML composite structure** describes a part inside a whole, with ports and connectors — the modelling
  vocabulary for "this box expands".
- **Event-B (Abrial)** and the CSP/CCS refinement tradition (Hoare; Milner) give refinement as a relation
  between levels: a child may decide more, and may not contradict the parent.
- Hierarchical graphs and algebraic graph transformation (Ehrig et al.) make containment itself the
  morphism, which is what a parent/child diagram is.

This plugin takes three rules from that and nothing more:

1. **Containment** — a child's scope is one node in the parent, and that node is expanded exactly once.
2. **Refinement** — a child may not introduce a cross-boundary edge the parent does not have. It may
   introduce everything internal to its scope.
3. **Budget** — a level past the drawing threshold must be decomposed. The limit is not a rendering
   apology; it is the point at which a view stops being reviewable.

## Reconciling the drawing with the code

The as-is mode answers a question the design-time mode cannot: does the code still have the architecture
we say it has? The established name for the technique is **reflexion modelling** (Murphy, Notkin and
Sullivan): extract the implementation graph, declare the intended graph, and classify every edge as
agreed, absent, or convergent — the third category being the interesting one, because convergence is
usually a deliberate violation nobody wrote down.

Related traditions worth knowing, and what each adds:

- **Dependency Structure Matrix** (Steward; Browning) — cycles and layering read off a matrix instead of
  a picture. A DSM is what tells you *which* edges to cut, where a graph tells you *that* there is a
  cycle.
- **Software architecture reconstruction** (Kazman and Carriere) — recovering the conceptual
  architecture from artefacts when no declaration exists. Our `repoPath` scan is the cheap end of this:
  imports only, no clustering, no inference about intent.
- **Conformance tests in code** (ArchUnit and its descendants) — a rule checked by the build. That is the
  right home for a rule once it is settled; this plugin is for deciding whether the rule is right.
- **Architecture erosion and drift** (Perry and Wolf for the vocabulary) — the observation that the
  implemented architecture decays unless something keeps checking it.

The acyclic-dependencies and stable-dependencies principles (Martin) are the usual declared rules in this
space; they are what a matrix encodes, and the engine judges them as edges rather than as opinions.

## Drawing a level

Layered graph drawing (Sugiyama, Tagawa and Toda) is the only layout this plugin needs to consider: place
nodes in ranks, order within a rank to reduce crossings, then route edges. The general reference is Di
Battista, Eades, Tamassia and Tollis, *Graph Drawing*.

Two aesthetic findings shape the choices here rather than taste: edge crossings and bends dominate how
quickly a reader parses a graph (Purchase's experiments on aesthetic criteria), and past a few dozen
nodes comprehension of any layout collapses. That is the evidence behind a fixed drawing budget: the
answer for a large level is a smaller level, not a cleverer layout.

## Recording the decision

An architecture decision record is the artefact that survives the meeting. The practice is described by
Tyree and Akerman (*Architecture Decisions: Demystifying Architecture*, IEEE Software 2005) and
popularised by Nygard's *Documenting Architecture Decisions* (2011): context, decision, status,
consequences. arc42 is the document template most European teams use to hold them.

A record generated from a verified model has one property a hand-written one does not: every consequence
it states can name the check that produced it.

## Provenance

| Part | Where it comes from |
|---|---|
| views and viewpoints as the unit of description | ISO/IEC/IEEE 42010:2011; Kruchten, *The 4+1 View Model of Architecture*, IEEE Software (1995) |
| choosing the view for its audience | Clements et al., *Documenting Software Architectures: Views and Beyond* (2010); Rozanski and Woods, *Software Systems Architecture* (2011) |
| zoom levels as a practical hierarchy | Brown, *The C4 Model for Visualising Software Architecture* (2018) |
| near-decomposability as the reason for levels | Simon, *The Architecture of Complexity* (1962) |
| containment and refinement semantics | UML 2.5 composite structure; Abrial, *Modeling in Event-B* (2010); Hoare, *Communicating Sequential Processes* (1985); Milner, *Communication and Concurrency* (1989) |
| the three hierarchy rules and the node budget | this repository's own decision, from the theory above |
| reflexion modelling as the as-is method | Murphy, Notkin and Sullivan, *Software Reflexion Models*, IEEE Transactions on Software Engineering (2001) |
| matrix view of cycles and layering | Steward, *The Design Structure System* (1981); Browning (2001) |
| reconstruction from artefacts | Kazman and Carriere, *Playing Detective: Reconstructing Software Architecture from Available Evidence* (1999) |
| erosion and drift | Perry and Wolf, *Foundations for the Study of Software Architecture* (1992) |
| acyclic and stable dependency principles | Martin, *Agile Software Development* (2002) |
| layered layout | Sugiyama, Tagawa and Toda, *Methods for Visual Understanding of Hierarchical System Structures* (1981); Di Battista et al., *Graph Drawing* (1999) |
| crossing and size limits | Purchase's studies of aesthetic criteria; the specific threshold is this repository's |
| decision records | Tyree and Akerman, *Architecture Decisions: Demystifying Architecture*, IEEE Software (2005); Nygard, *Documenting Architecture Decisions* (2011); arc42 |

Citations are given without volume and page numbers where those were not verified against the
publication. The argument does not depend on them; the reader who needs them can find the work by title.

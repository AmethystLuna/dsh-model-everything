# Release notes

Reader-facing notes, newest first. A release names what changed for someone using the plugin, not which commits landed.

## 0.7.0

Six drawing features and the fixes that came out of turning every picture on its side.

### Drawing

- **A Mermaid line may state several connections.** `a & b --> c` is drawn as two edges, not refused.
- **An interface written as its own circle is an interface**, and a port on a component says whether it is `in`, `out`
  or `inout`.
- **A parenthesised use case and an abstract class are read as what they are**, instead of being drawn as plain boxes.
- **A partition is a boundary** (`partition "name" { }`), and `note "text" as n` is a note with its folded corner -
  two notes beside one box stay two notes.
- **A Mermaid state keeps its composite, its type and its note**, so a sub-state machine reads back as one.

### Fixed

- **A left-to-right drawing with a group no longer puts a member outside its own boundary.** A group's rectangle was
  measured in the layout's coordinates and then turned a second time, so the boundary was drawn 90 degrees wrong and a
  member stuck out of it (measured: 44px overlap with the next group's box).
- **A note written after a closing brace joins the boundary its box is in, and sits beside it.** It used to be drawn a
  rank below the whole group, at the far end of the page from the words it annotates.
- **A note has one owner.** A note written inside an outer package is no longer also a member of it, which had put it
  outside the inner boundary it belongs to.
- **A label with nowhere clear along its own line steps aside** instead of settling on the next box. The label first
  asks every leg of its own edge, and only then moves off the line - so a clear shorter leg still wins over a side spot.
- **A machine with a malformed `updates` list is refused with the field named**, instead of throwing a `TypeError` past
  the error list.

### Under the hood

- The acceptance gallery grew to 24 drawings and five structural assertions: no refused line, no route through a box, no
  label collision, no box drawn under another, and every member of a boundary drawn inside it.
- One complex case per UML family (14 families), each asserting the drawing, the round trip and the review.
- 150 mutation points, `npm run coverage` works again, and the three modules the release checklist names stay at 100% of
  statements.

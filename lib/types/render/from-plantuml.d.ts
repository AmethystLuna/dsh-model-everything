/**
 * PlantUML text to a diagram, for the subset this renderer can actually draw.
 *
 * PlantUML is a large language, and a renderer that accepted all of it would be a re-implementation of
 * PlantUML. This one accepts what an architecture document actually contains - boxes, groups and arrows -
 * and refuses the rest **by line**, because a component diagram that quietly loses a lifeline reads as
 * complete and is not.
 *
 * Supported:
 *
 * - `@startuml` / `@enduml` (optional) and `title ...`;
 * - elements: `component`, `node`, `rectangle`, `artifact` and `state` (a rectangle), `database` and
 *   `entity` (a cylinder), `usecase` (an ellipse), `[text]`, each with a `"text"` label and `as` alias;
 * - boundaries: `package`, `folder`, `node`, `component`, `rectangle` and `artifact` blocks, closed by `}`;
 * - arrows, either direction: association `-->`/`<--`, dependency `..>`/`<..`, generalisation `--|>`/`<|--`,
 *   realisation `..|>`/`<|..`, composition `*--`/`--*`, aggregation `o--`/`--o`, labelled after `:`;
 * - an edge end that names a declared block attaches to that block's rectangle, the way an external
 *   dependency on a package is drawn; a name that is not a declared block is an implicit element;
 * - `[*] --> X` for a start marker;
 * - `'` comments and `skinparam`/`!theme`/`hide`/`show`/`scale` directives;
 * - `left to right direction` is accepted and has no effect: this renderer has one layout, top to bottom, so a
 *   source that asks for landscape gets the same picture as one that does not.
 *
 * Refused, by line and by name: the element keywords this renderer has no symbol for (`actor`, `class`,
 * `cloud`, ...), the diagram kinds it does not draw (`sequence`), and an edge it cannot draw as written (a
 * line with no arrow end, a mark at both ends, a dotted diamond, an edge between two boundaries, or an edge
 * into a boundary that is nested or empty).
 */
import { type Diagram } from './model.js';
export interface Parsed {
    diagram: Diagram;
    /** Lines the parser refused to interpret, with the reason. Empty when the whole source was understood. */
    refused: string[];
    /**
     * Lines that were understood and have no effect, with the reason.
     *
     * A layout control - a direction, a spacing, a scale - asks the renderer to arrange the drawing differently. This
     * renderer decides the arrangement itself, so the line is accepted and dropped. Saying so is the point: a reader who
     * wrote `left to right direction` and saw the same picture had no way to tell a refusal from a no-op.
     */
    ignored: string[];
}
/**
 * Read one arrow line.
 *
 * Returns the edge it states, `undefined` when the line is not an arrow at all, or the reason it is refused.
 * The arrow the source writes decides which end carries the mark: `A <|-- B` is B generalising to A, so the
 * edge runs from B to A with the triangle at A, and `A *-- B` puts its diamond at A, so A is the source.
 */
/**
 * The boxes a `together { }` block names, read from the text before the lines are parsed.
 *
 * Every declaration inside the block registers its box on its own; what the block adds is that they share a row. Reading
 * it as a pre-pass keeps the declaration paths - quoted alias, bracketed alias, plain alias, bare name - untouched, and
 * a block whose members are declared elsewhere still contributes the ids it names.
 */
export declare function fromPlantUml(source: string, title?: string): Parsed;

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
 * - `'` comments and `skinparam`/`!theme` directives.
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
}
export declare function fromPlantUml(source: string, title?: string): Parsed;

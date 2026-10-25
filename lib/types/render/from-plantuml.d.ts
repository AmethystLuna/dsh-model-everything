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
 * - `component X`, `component "text" as X`, `[text] as X`, `[text]`;
 * - `package "text" { ... }`, `node`, `folder`, `cloud`, `database` - a group, closed by `}`;
 * - `X --> Y`, `X ---> Y`, `X ..> Y`, `X --> Y : label`, arrow either direction;
 * - `state X`, `state "text" as X`, and `[*] --> X` for a start marker;
 * - `'` comments and `skinparam`/`!theme` directives.
 *
 * Refused, by name: `sequence`, `actor`, `participant`, `usecase`, `class`, `object`, `note`, `legend`,
 * `alt`/`opt`/`loop`/`par` and any other fragment keyword.
 */
import { type Diagram } from './model.js';
export interface Parsed {
    diagram: Diagram;
    /** Lines the parser refused to interpret, with the reason. Empty when the whole source was understood. */
    refused: string[];
}
export declare function fromPlantUml(source: string, title?: string): Parsed;

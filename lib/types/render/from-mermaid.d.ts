/**
 * Mermaid text to a diagram, for the subset this renderer can actually draw.
 *
 * The subset is chosen by what a reader of an architecture document writes: a flowchart of boxes and
 * arrows, a state diagram with a start marker, and the group syntax that turns a flat graph into a layered
 * one. Everything outside it is refused **with its line number** rather than half-drawn: a picture that
 * silently drops a lifeline or an interaction is worse than no picture, because it looks complete.
 *
 * Supported:
 *
 * - `graph TD|TB|LR` and `flowchart TD|TB|LR`; `LR` and `RL` turn the drawing the way PlantUML's
 *   `left to right direction` does, and `TD`/`TB`/`BT` leave it top to bottom;
 * - node declarations `A[text]`, `A(text)`, `A{text}`, `A((text))`, and a bare `A`;
 * - edges `-->`, `---`, `-.->`, with a label as `-->|text|` or `-- text -->`; a thick line (`==>`) is refused;
 * - `stateDiagram` / `stateDiagram-v2`: `[*] --> A`, `A --> B: event`, `state "text" as id`;
 * - `subgraph name ... end`, which becomes a group;
 * - `%%` comments and blank lines.
 *
 * Refused, by name: `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt`, `pie`, `journey`, `mindmap`,
 * `timeline`, `quadrantChart`, `gitGraph`, `C4Context`, and `click`/`style`/`classDef` directives.
 */
import { type Diagram } from './model.js';
export interface Parsed {
    diagram: Diagram;
    /** Lines the parser refused to interpret, with the reason. Empty when the whole source was understood. */
    refused: string[];
    /** Lines understood and dropped, with the reason. Mermaid's own layout hints are read and have no effect here. */
    ignored: string[];
}
export declare function fromMermaid(source: string, title?: string): Parsed;

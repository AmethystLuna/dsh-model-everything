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
 * - `graph TD|TB|LR` and `flowchart TD|TB|LR`, with direction carried into the layout as a hint;
 * - node declarations `A[text]`, `A(text)`, `A{text}`, `A((text))`, and a bare `A`;
 * - edges `-->`, `---`, `-.->`, `==>`, with a label as `-->|text|` or `-- text -->`;
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
}
export declare function fromMermaid(source: string, title?: string): Parsed;
